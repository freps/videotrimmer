# Video Trimmer — Electron + Vue.js

Desktop-App zum Trimmen von Videos.

## Voraussetzungen

- [Node.js](https://nodejs.org) (v20+)
- npm

## Setup

```bash
cd video
npm install
```

## Entwicklung

```bash
npm run dev
```

## Produktion

```bash
npm run build
```

## Features

- Video öffnen (MP4, MOV, AVI, MKV, WebM)
- Timeline mit Trim-Start/Ende-Reglern
- Positions-Regler + Abspielen
- Codec-Auswahl: Original (Copy), H.264, H.265
- FFmpeg embedded via `ffmpeg-static`
