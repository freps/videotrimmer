import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { createReadStream, statSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import * as path from "path";
import { getCodecArgs, getFfmpegPath } from "./ffmpeg";

let mainWindow: BrowserWindow | null = null;
let currentVideoPath: string | null = null;
let pendingFilePath: string | null = null;
let serverPort = 0;

// --- Local HTTP file server for video streaming (replaces Bun.serve) ---
function startFileServer(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!currentVideoPath) {
        res.writeHead(404);
        res.end("No video");
        return;
      }

      const stat = statSync(currentVideoPath);
      const fileSize = stat.size;
      const mime = getMimeType(currentVideoPath);
      const range = req.headers.range;

      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
            "Content-Type": mime,
            "Access-Control-Allow-Origin": "*",
          });
          createReadStream(currentVideoPath, { start, end }).pipe(res);
          return;
        }
      }

      res.writeHead(200, {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": mime,
        "Access-Control-Allow-Origin": "*",
      });
      createReadStream(currentVideoPath).pipe(res);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      console.log("[MAIN] File server on port", port);
      resolve(port);
    });
  });
}

function getMimeType(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo",
    mkv: "video/x-matroska", webm: "video/webm", m4v: "video/mp4",
  };
  return types[ext] || "application/octet-stream";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    title: "Video Trimmer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}


// --- IPC Handlers ---
function setupIPC() {
  ipcMain.handle("open-file-dialog", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        { name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    currentVideoPath = result.filePaths[0];
    return {
      filePath: result.filePaths[0],
      streamUrl: `http://127.0.0.1:${serverPort}/video`,
    };
  });

  ipcMain.handle("save-file-dialog", async (_event, defaultName: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Video speichern",
      defaultPath: defaultName,
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "mkv"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle("trim-video", async (_event, opts: {
    inputPath: string; outputPath: string;
    startTime: number; endTime: number;
    codec: "original" | "h264" | "h265";
    noAudio: boolean;
  }) => {
    const { spawn } = require("child_process");
    const ffmpegPath = getFfmpegPath();
    const totalDuration = opts.endTime - opts.startTime;
    const codecArgs = await getCodecArgs(opts.codec);
    const audioArgs = opts.noAudio && opts.codec !== "original" ? ["-an"] : [];
    const args = [
      "-y",
      "-ss", String(opts.startTime),
      "-i", opts.inputPath,
      "-t", String(totalDuration),
      "-progress", "pipe:1",
      ...codecArgs,
      ...audioArgs,
      opts.outputPath,
    ];

    console.log("[MAIN] ffmpeg:", ffmpegPath, args.join(" "));

    return new Promise<{ success: boolean }>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderrData = "";
      let buffer = "";
      let lastPercent = -1;

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let outTimeUs = 0;
        let fps = 0;
        let speed = "";

        for (const line of lines) {
          const [key, val] = line.split("=");
          if (!key || !val) continue;
          const k = key.trim();
          const v = val.trim();
          if (k === "out_time_us") outTimeUs = parseInt(v, 10) || 0;
          else if (k === "fps") fps = parseFloat(v) || 0;
          else if (k === "speed") speed = v;
        }

        if (outTimeUs > 0 && totalDuration > 0) {
          const currentSec = outTimeUs / 1_000_000;
          const percent = Math.min(99, Math.round((currentSec / totalDuration) * 100));
          if (percent !== lastPercent) {
            lastPercent = percent;
            mainWindow?.webContents.send("trim-progress", { percent, fps, speed });
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString();
      });

      proc.on("close", (code: number) => {
        if (code !== 0) {
          console.error("[MAIN] ffmpeg error:", stderrData.slice(-300));
          reject(new Error(`FFmpeg fehlgeschlagen: ${stderrData.slice(-200)}`));
        } else {
          mainWindow?.webContents.send("trim-progress", { percent: 100, fps: 0, speed: "done" });
          resolve({ success: true });
        }
      });

      proc.on("error", (err: Error) => {
        reject(new Error(`FFmpeg konnte nicht gestartet werden: ${err.message}`));
      });
    });
  });
}

// --- Helper: load a video file from path ---
function loadVideoFile(filePath: string) {
  currentVideoPath = filePath;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    mainWindow!.webContents.on("did-finish-load", () => {
      mainWindow!.webContents.send("open-file", {
        filePath,
        streamUrl: `http://127.0.0.1:${serverPort}/video`,
      });
    });
  } else {
    mainWindow.webContents.send("open-file", {
      filePath,
      streamUrl: `http://127.0.0.1:${serverPort}/video`,
    });
  }
}

// --- App lifecycle ---
// macOS: file opened while app is already running
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (serverPort && mainWindow) {
    loadVideoFile(filePath);
  } else {
    pendingFilePath = filePath;
  }
});

app.whenReady().then(async () => {
  serverPort = await startFileServer();
  setupIPC();
  createWindow();

  // macOS cold start: check for pending file from open-file event
  if (pendingFilePath) {
    mainWindow!.webContents.on("did-finish-load", () => {
      loadVideoFile(pendingFilePath!);
      pendingFilePath = null;
    });
  }

  // Non-macOS: file path passed as CLI argument
  if (!pendingFilePath && process.argv.length > 1) {
    const arg = process.argv[process.argv.length - 1];
    if (arg && !arg.startsWith("-") && /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(arg)) {
      mainWindow!.webContents.on("did-finish-load", () => {
        loadVideoFile(arg);
      });
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
