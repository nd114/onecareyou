/**
 * Turn raw microphone samples into a complete WAV file.
 *
 * Live transcription sends the visit in short windows while the consultation is
 * still going. Recorder fragments cannot be sent that way — only the first one
 * carries a file header, so every later piece is rejected as corrupt. Encoding
 * each window as a whole 16 kHz mono WAV sidesteps that, and also sidesteps
 * Safari's fragmented MP4, which the transcription models cannot decode.
 */

const TARGET_RATE = 16000;

/** Flatten and downsample float samples to the target rate. */
function downsample(chunks: Float32Array[], sourceRate: number, targetRate = TARGET_RATE) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const flat = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    flat.set(c, at);
    at += c.length;
  }
  if (sourceRate <= targetRate) return flat;

  const ratio = sourceRate / targetRate;
  const out = new Float32Array(Math.floor(flat.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(flat.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += flat[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Standard 16-bit mono WAV. */
export function encodeWav(chunks: Float32Array[], sourceRate: number): Blob {
  const samples = downsample(chunks, sourceRate);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Rough loudness of a window, so silence is never uploaded. */
export function peakLevel(chunks: Float32Array[]): number {
  let peak = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i += 1) peak = Math.max(peak, Math.abs(c[i]));
  return peak;
}
