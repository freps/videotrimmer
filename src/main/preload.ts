import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  saveFileDialog: (defaultName: string) => ipcRenderer.invoke("save-file-dialog", defaultName),
  trimVideo: (opts: {
    inputPath: string; outputPath: string;
    startTime: number; endTime: number;
    codec: "original" | "h264" | "h265";
    noAudio: boolean;
  }) => ipcRenderer.invoke("trim-video", opts),
  onTrimProgress: (callback: (data: { percent: number; fps: number; speed: string }) => void) => {
    ipcRenderer.on("trim-progress", (_event, data) => callback(data));
  },
  removeTrimProgressListener: () => {
    ipcRenderer.removeAllListeners("trim-progress");
  },
  onOpenFile: (callback: (data: { filePath: string; streamUrl: string }) => void) => {
    ipcRenderer.on("open-file", (_event, data) => callback(data));
  },
});
