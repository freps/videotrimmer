import { execFileSync } from "child_process";
import * as path from "path";

type EncoderMap = { h264: string; h265: string };

let cachedEncoders: EncoderMap | null = null;

/** Detect best available hardware encoders, fallback to software */
function detectEncoders(): EncoderMap {
  if (cachedEncoders) return cachedEncoders;

  const ffmpeg = getFfmpegPath();
  const available = getAvailableEncoders(ffmpeg);

  const h264Candidates = [
    "h264_videotoolbox",  // macOS
    "h264_nvenc",         // NVIDIA (Windows/Linux)
    "h264_amf",           // AMD (Windows)
    "h264_qsv",           // Intel QuickSync
    "libx264",            // Software fallback
  ];
  const h265Candidates = [
    "hevc_videotoolbox",  // macOS
    "hevc_nvenc",         // NVIDIA
    "hevc_amf",           // AMD
    "hevc_qsv",           // Intel
    "libx265",            // Software fallback
  ];

  const h264 = h264Candidates.find(e => available.has(e)) || "libx264";
  const h265 = h265Candidates.find(e => available.has(e)) || "libx265";

  cachedEncoders = { h264, h265 };
  console.log(`[FFmpeg] Encoders: h264=${h264}, h265=${h265}`);
  return cachedEncoders;
}

function getAvailableEncoders(ffmpeg: string): Set<string> {
  try {
    const output = execFileSync(ffmpeg, ["-encoders", "-hide_banner"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    const encoders = new Set<string>();
    for (const line of output.split("\n")) {
      const match = line.match(/^\s*V\S*\s+(\S+)/);
      if (match) encoders.add(match[1]);
    }
    return encoders;
  } catch {
    return new Set(["libx264", "libx265"]);
  }
}

/** Build FFmpeg codec args for the given codec choice */
export async function getCodecArgs(codec: "original" | "h264" | "h265"): Promise<{ args: string[]; isHardware: boolean }> {
  if (codec === "original") return { args: ["-c", "copy"], isHardware: false };

  const encoders = detectEncoders();
  const encoder = codec === "h264" ? encoders.h264 : encoders.h265;

  const isHardware = encoder !== "libx264" && encoder !== "libx265";
  const args: string[] = [];

  if (isHardware) {
    args.push("-c:v", encoder, "-q:v", "65", "-c:a", "aac");
  } else {
    args.push("-c:v", encoder, "-preset", "ultrafast", "-c:a", "aac");
  }

  if (codec === "h265") {
    args.push("-tag:v", "hvc1");
  }

  return { args, isHardware };
}

export function getFfmpegPath(): string {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "ffmpeg.exe" : "ffmpeg";

  // In packaged app, check extraResources
  if (process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, binaryName);
    try {
      require("fs").accessSync(resourcePath);
      return resourcePath;
    } catch {}
  }
  // Development: use ffmpeg-static
  try {
    const ffmpegStatic = require("ffmpeg-static");
    return typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic.default;
  } catch {
    return binaryName;
  }
}

// Pre-detect on import
detectEncoders();
