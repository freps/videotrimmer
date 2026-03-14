<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

const videoSrc = ref<string | null>(null);
const videoPath = ref<string | null>(null);
const duration = ref(0);
const currentTime = ref(0);
const trimStart = ref(0);
const trimEnd = ref(0);
const isPlaying = ref(false);
const codec = ref<"original" | "h264" | "h265">("h265");
const muted = ref(false);
const isSaving = ref(false);
const saveProgress = ref(0);
const saveSpeed = ref("");
const videoEl = ref<HTMLVideoElement | null>(null);
function onKeydown(e: KeyboardEvent) {
  if (!videoEl.value || !videoSrc.value) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "ArrowRight") {
    e.preventDefault();
    stepFrame(1);
  } else if (e.code === "ArrowLeft") {
    e.preventDefault();
    stepFrame(-1);
  }
}
function toggleFullscreen() {
  const container = document.querySelector(".video-container");
  if (!container) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else container.requestFullscreen();
}
function stepFrame(dir: 1 | -1) {
  if (!videoEl.value) return;
  // ~1/30s per frame, clamped to trim range
  const step = dir / 30;
  const t = Math.max(trimStart.value, Math.min(trimEnd.value, videoEl.value.currentTime + step));
  videoEl.value.currentTime = t;
  currentTime.value = t;
  if (isPlaying.value) { videoEl.value.pause(); isPlaying.value = false; }
}
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.electronAPI?.onTrimProgress((data) => {
    saveProgress.value = data.percent;
    saveSpeed.value = data.speed || "";
  });
  window.electronAPI?.onOpenFile((data) => {
    videoPath.value = data.filePath;
    videoSrc.value = data.streamUrl;
  });
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.electronAPI?.removeTrimProgressListener();
});

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${ms}`;
};
const currentTimeDisplay = computed(() => formatTime(currentTime.value));
const durationDisplay = computed(() => formatTime(duration.value));
const trimStartDisplay = computed(() => formatTime(trimStart.value));
const trimEndDisplay = computed(() => formatTime(trimEnd.value));

async function openVideo() {
  const api = window.electronAPI;
  if (api) {
    try {
      const result = await api.openFileDialog();
      if (!result) return;
      videoPath.value = result.filePath;
      videoSrc.value = result.streamUrl;
    } catch (e: any) {
      console.error("openVideo error:", e);
    }
    return;
  }
  // Fallback for browser dev
  const input = document.createElement("input");
  input.type = "file"; input.accept = "video/*";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) { videoSrc.value = URL.createObjectURL(f); videoPath.value = null; }
  };
  input.click();
}

function onLoadedMetadata() {
  if (!videoEl.value) return;
  duration.value = videoEl.value.duration;
  trimStart.value = 0;
  trimEnd.value = videoEl.value.duration;
  currentTime.value = 0;
}
function onTimeUpdate() {
  if (!videoEl.value) return;
  currentTime.value = videoEl.value.currentTime;
  if (videoEl.value.currentTime >= trimEnd.value) {
    videoEl.value.pause(); isPlaying.value = false;
  }
}
function togglePlay() {
  if (!videoEl.value) return;
  if (isPlaying.value) { videoEl.value.pause(); isPlaying.value = false; }
  else {
    if (videoEl.value.currentTime >= trimEnd.value) videoEl.value.currentTime = trimStart.value;
    videoEl.value.play(); isPlaying.value = true;
  }
}
function onVideoEnded() { isPlaying.value = false; }
function onTrimStartChange(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  trimStart.value = Math.min(v, trimEnd.value - 0.1);
  // Jump video to trim start position for preview
  if (videoEl.value) videoEl.value.currentTime = trimStart.value;
}
function onTrimEndChange(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  trimEnd.value = Math.max(v, trimStart.value + 0.1);
  // Jump video to trim end position for preview
  if (videoEl.value) videoEl.value.currentTime = trimEnd.value;
}
function onPositionChange(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  const clamped = Math.max(trimStart.value, Math.min(trimEnd.value, v));
  currentTime.value = clamped;
  if (videoEl.value) videoEl.value.currentTime = clamped;
}
function onTrackClick(e: MouseEvent) {
  if (!videoEl.value || !duration.value) return;
  const track = (e.currentTarget as HTMLElement);
  const rect = track.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const t = Math.max(trimStart.value, Math.min(trimEnd.value, ratio * duration.value));
  currentTime.value = t;
  videoEl.value.currentTime = t;
}

async function saveVideo() {
  if (!videoPath.value) return;
  const api = window.electronAPI;
  if (!api) return;
  isSaving.value = true;
  saveProgress.value = 0;
  saveSpeed.value = "";
  try {
    const ext = codec.value === "original" ? videoPath.value.split(".").pop() : "mp4";
    const savePath = await api.saveFileDialog(`trimmed.${ext}`);
    if (!savePath) { isSaving.value = false; return; }
    await api.trimVideo({
      inputPath: videoPath.value, outputPath: savePath,
      startTime: trimStart.value, endTime: trimEnd.value, codec: codec.value,
      noAudio: muted.value,
    });
  } catch (e: any) {
    console.error("saveVideo error:", e);
  } finally {
    isSaving.value = false;
    saveProgress.value = 0;
  }
}
</script>

<template>
  <div class="app">
    <div v-if="!videoSrc" class="empty-state">
      <button class="btn btn-primary" @click="openVideo">📂 Video öffnen</button>
    </div>
    <div v-else class="editor">
      <div class="video-container">
        <video ref="videoEl" :src="videoSrc" :muted="muted" @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate" @ended="onVideoEnded" @dblclick="toggleFullscreen" />
      </div>
      <div class="bottom-controls">
      <div class="timeline">
        <!-- Background track -->
        <div class="track">
          <!-- Dimmed areas outside trim range -->
          <div class="track-dim-left" :style="{ width: (trimStart / duration) * 100 + '%' }" />
          <div class="track-dim-right" :style="{ width: ((duration - trimEnd) / duration) * 100 + '%' }" />
          <!-- Active trim region -->
          <div class="track-active" :style="{ left: (trimStart / duration) * 100 + '%', width: ((trimEnd - trimStart) / duration) * 100 + '%' }" />
          <!-- Playhead -->
          <div class="playhead" :style="{ left: (currentTime / duration) * 100 + '%' }" />
        </div>
        <!-- Invisible sliders on top -->
        <div class="sliders" @click="onTrackClick">
          <input type="range" class="sl sl-pos" :min="0" :max="duration" :step="0.01" :value="currentTime" @input="onPositionChange" aria-label="Position" />
          <input type="range" class="sl sl-start" :min="0" :max="duration" :step="0.01" :value="trimStart" @input="onTrimStartChange" aria-label="Trim Start" />
          <input type="range" class="sl sl-end" :min="0" :max="duration" :step="0.01" :value="trimEnd" @input="onTrimEndChange" aria-label="Trim Ende" />
        </div>
      </div>
      <!-- Progress bar during save -->
      <div v-if="isSaving" class="progress-bar">
        <div class="progress-fill" :style="{ width: saveProgress + '%' }" />
        <span class="progress-text">{{ saveProgress }}% {{ saveSpeed }}</span>
      </div>
      <div class="controls">
        <div class="ctrl-left">
          <button class="btn btn-icon" @click="togglePlay" :disabled="isSaving" :aria-label="isPlaying ? 'Pause' : 'Abspielen'">{{ isPlaying ? "⏸" : "▶" }}</button>
          <button class="btn btn-icon" @click="openVideo" :disabled="isSaving" aria-label="Video öffnen">📂</button>
          <div class="time-display">
            <span class="trim-time" v-if="trimStart > 0.05">✂ {{ trimStartDisplay }}</span>
            <span>{{ currentTimeDisplay }}</span>
            <span class="sep"> / </span>
            <span>{{ durationDisplay }}</span>
            <span class="trim-time" v-if="duration - trimEnd > 0.05">{{ trimEndDisplay }} ✂</span>
          </div>
        </div>
        <div class="ctrl-right">
          <button class="btn btn-icon" @click="muted = !muted" :aria-label="muted ? 'Ton aktivieren' : 'Stummschalten'">{{ muted ? '🔇' : '🔊' }}</button>
          <select v-model="codec" class="codec" :disabled="isSaving" aria-label="Codec">
            <option value="original">Original (Copy)</option>
            <option value="h264">H.264 (MP4)</option>
            <option value="h265">H.265 / HEVC (MP4)</option>
          </select>
          <button class="btn btn-save" @click="saveVideo" :disabled="isSaving">
            {{ isSaving ? `⏳ ${saveProgress}%` : "💾 Speichern" }}
          </button>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ── Reset ── */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app, .app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  min-width: 700px;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #1e1e1e;
  color: #d4d4d4;
}

/* ── Layout ── */
.app {
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 12px 12px 12px;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

/* ── Video ── */
.video-container {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  background: #0a0a0a;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #2a2a2a;
}

.video-container video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* ── Bottom controls ── */
.bottom-controls {
  flex-shrink: 0;
}

/* ── Time display ── */
.time-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #888;
  white-space: nowrap;
}

.trim-time {
  color: #c4915c;
  font-size: 12px;
}

.sep {
  color: #555;
}

/* ── Timeline track ── */
.timeline {
  position: relative;
  padding: 4px 0 0 0;
}

.track {
  position: relative;
  height: 32px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #333;
  cursor: pointer;
}

.track-dim-left,
.track-dim-right {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1;
}

.track-dim-left {
  left: 0;
}

.track-dim-right {
  right: 0;
}

.track-active {
  position: absolute;
  top: 0;
  height: 100%;
  background: linear-gradient(180deg, #3a3a3a 0%, #303030 100%);
  border-left: 2px solid #c4915c;
  border-right: 2px solid #c4915c;
  z-index: 1;
}

.playhead {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: #e0e0e0;
  z-index: 3;
  transform: translateX(-1px);
  box-shadow: 0 0 3px rgba(255, 255, 255, 0.3);
}

/* ── Range sliders (invisible overlay) ── */
.sliders {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  z-index: 4;
}

.sl {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 32px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  pointer-events: none;
  outline: none;
  margin: 0;
  padding: 0;
}

.sl::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  pointer-events: auto;
  cursor: pointer;
}

.sl-start::-webkit-slider-thumb,
.sl-end::-webkit-slider-thumb {
  width: 6px;
  height: 32px;
  background: #c4915c;
  border-radius: 2px;
  border: none;
  margin-top: 10px;
}

.sl-pos::-webkit-slider-thumb {
  width: 2px;
  height: 32px;
  background: transparent;
  border: none;
  cursor: ew-resize;
}

/* ── Progress bar (save) ── */
.progress-bar {
  position: relative;
  height: 20px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 5px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a8db7, #5a9ec7);
  transition: width 0.3s;
}

.progress-text {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  line-height: 20px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

/* ── Controls bar ── */
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
}

.ctrl-left,
.ctrl-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ── Buttons ── */
.btn {
  padding: 8px 16px;
  border: 1px solid #3a3a3a;
  background: #2d2d2d;
  color: #d4d4d4;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  line-height: 20px;
  transition: background 0.15s;
  -webkit-app-region: no-drag;
}

.btn-icon {
  padding: 8px 12px;
  font-size: 16px;
  width: 40px;
  text-align: center;
}

.btn:hover {
  background: #383838;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #4a8db7;
  border-color: #4a8db7;
  color: #fff;
  font-size: 16px;
  padding: 14px 28px;
}

.btn-primary:hover {
  background: #3f7da5;
}

.btn-save {
  background: #4a8db7;
  border-color: #4a8db7;
  color: #fff;
}

.btn-save:hover {
  background: #3f7da5;
}

/* ── Codec select ── */
.codec {
  padding: 8px 12px;
  border: 1px solid #3a3a3a;
  background: #2d2d2d;
  color: #d4d4d4;
  border-radius: 5px;
  font-size: 13px;
  line-height: 20px;
  height: 38px;
  cursor: pointer;
}

.codec:focus {
  outline: 2px solid #4a8db7;
}
</style>
