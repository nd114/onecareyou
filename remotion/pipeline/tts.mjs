// Renders one MP3 per narration beat with ElevenLabs (female voice) and writes a
// manifest with the measured duration of each clip. Durations drive capture timing.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const key = process.argv[2];
if (!key) throw new Error("usage: node tts.mjs <patient|clinician>");

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");

// Sarah — warm, clear, female.
const VOICE_ID = process.env.ONECARE_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";
const MODEL = "eleven_multilingual_v2";

const beats = JSON.parse(fs.readFileSync(path.join(dir, `beats.${key}.json`), "utf8"));
const outDir = path.join("/tmp/howto", key, "audio");
fs.mkdirSync(outDir, { recursive: true });

const manifest = [];
for (let i = 0; i < beats.beats.length; i++) {
  const b = beats.beats[i];
  const file = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${b.id}.mp3`);
  if (!fs.existsSync(file)) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: b.narration,
          model_id: MODEL,
          previous_text: beats.beats[i - 1]?.narration,
          next_text: beats.beats[i + 1]?.narration,
          voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 1.0 },
        }),
      },
    );
    if (!res.ok) throw new Error(`[${res.status}] ${await res.text()}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log("voiced", b.id);
  }
  const dur = Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ]).toString().trim(),
  );
  manifest.push({ ...b, index: i, audio: file, duration: dur });
}

const total = manifest.reduce((a, b) => a + b.duration + 0.6, 0);
fs.writeFileSync(
  path.join("/tmp/howto", key, "manifest.json"),
  JSON.stringify({ ...beats, beats: manifest, totalSeconds: total }, null, 2),
);
console.log(`${key}: ${manifest.length} clips, ~${Math.round(total)}s`);
