# Video Trimmer — Electron + Vue.js

Desktop app for trimming videos.

## Prerequisites

- [Node.js](https://nodejs.org) (v20+)
- npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
```

### Windows Build

For the Windows build (`electron-builder --win`), the `ffmpeg.exe` must be placed manually into the `build/` folder, as it is not included in the repository:

1. Download the Windows binary from [ffmpeg.org](https://ffmpeg.org/download.html) (essentials build is sufficient)
2. Copy `ffmpeg.exe` to `build/ffmpeg.exe`
3. Run the build: `npm run build:win`

> `build/ffmpeg.exe` is excluded via `.gitignore` and must be provided again after every fresh checkout.

## Features

- Open videos (MP4, MOV, AVI, MKV, WebM)
- Timeline with trim start/end sliders
- Position slider + playback
- Codec selection: Original (Copy), H.264, H.265
- FFmpeg embedded via `ffmpeg-static`
