/**
 * Browser media capture helpers for the AI Interview Simulator.
 * Records complete WAV files (decodable everywhere) and grabs webcam frames.
 */

export type DeviceCheckResult = {
  camera: boolean;
  microphone: boolean;
  micLevel: number;
  lighting: number;
  faceVisible: boolean;
  network: string;
  checkedAt: string;
};

export async function requestMedia(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Grabs a JPEG data URL from a live <video>. */
export function captureFrame(video: HTMLVideoElement, quality = 0.6): string | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  const scale = 480 / video.videoWidth;
  canvas.width = 480;
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Average luminance 0-100 of the current frame — used by the device check. */
export function frameBrightness(video: HTMLVideoElement): number {
  if (!video.videoWidth) return 0;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return Math.round((total / (data.length / 4) / 255) * 100);
}

function encodeWav(chunks: Float32Array[], sampleRate: number, target = 16000): Blob {
  const length = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(length);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }
  const ratio = sampleRate / target;
  const outLength = Math.floor(length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);
  return new Blob([buffer], { type: "audio/wav" });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

/** PCM recorder producing a complete WAV per answer, with a live level meter. */
export class VoiceRecorder {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;

  level = 0;

  start(stream: MediaStream, onLevel?: (level: number) => void) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.startedAt = Date.now();

    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.processor.onaudioprocess = (e) => {
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.analyser?.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      this.level = Math.min(100, Math.round((avg / 160) * 100));
      onLevel?.(this.level);
    };

    this.source.connect(this.analyser);
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  get seconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<{ blob: Blob; seconds: number }> {
    const seconds = this.seconds;
    const rate = this.ctx?.sampleRate ?? 48000;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.processor = null;
    this.source = null;
    const blob = encodeWav(this.chunks, rate);
    this.chunks = [];
    this.startedAt = 0;
    return { blob, seconds };
  }
}

export function networkQuality(): string {
  const c = (navigator as any).connection;
  if (!c) return "unknown";
  return `${c.effectiveType ?? "unknown"}${c.downlink ? ` · ${c.downlink} Mbps` : ""}`;
}
