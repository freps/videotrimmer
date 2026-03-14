/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ElectronAPI {
  openFileDialog(): Promise<{ filePath: string; streamUrl: string } | null>;
  saveFileDialog(defaultName: string): Promise<string | null>;
  trimVideo(opts: {
    inputPath: string; outputPath: string;
    startTime: number; endTime: number;
    codec: "original" | "h264" | "h265";
    noAudio: boolean;
  }): Promise<{ success: boolean }>;
  onTrimProgress(callback: (data: { percent: number; fps: number; speed: string }) => void): void;
  removeTrimProgressListener(): void;
  onOpenFile(callback: (data: { filePath: string; streamUrl: string }) => void): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
