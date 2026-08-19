// Generates the human-editable narration scripts from the beat files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");

const words = (s) => s.trim().split(/\s+/).length;
// ElevenLabs multilingual v2 at default speed lands near 2.5 words/second.
const secs = (s) => words(s) / 2.5;

for (const key of ["patient", "clinician"]) {
  const beats = JSON.parse(fs.readFileSync(path.join(dir, `beats.${key}.json`), "utf8"));
  const total = beats.beats.reduce((a, b) => a + secs(b.narration) + 0.6, 0);
  const lines = [];
  lines.push(`# ${beats.title} — how-to narration script`);
  lines.push("");
  lines.push(
    `Source of truth for the voiceover in \`remotion/pipeline/beats.${key}.json\`. Edit the narration lines there (or here and copy across) before audio is rendered — each line becomes its own MP3, and its duration sets how long the matching on-screen action lingers.`,
  );
  lines.push("");
  lines.push(`- Demo account: \`${beats.account}\``);
  lines.push(`- Beats: ${beats.beats.length}`);
  lines.push(`- Estimated runtime: ~${Math.round(total)}s (~${(total / 60).toFixed(1)} min)`);
  lines.push("");
  let chapter = null;
  beats.beats.forEach((b, i) => {
    if (b.chapter !== chapter) {
      chapter = b.chapter;
      lines.push(`## ${chapter}`);
      lines.push("");
    }
    lines.push(`### ${i + 1}. ${b.caption}  \`${b.id}\``);
    lines.push("");
    lines.push(`On screen: ${describe(b.steps)}`);
    lines.push("");
    lines.push(`> ${b.narration}`);
    lines.push("");
    lines.push(`_~${secs(b.narration).toFixed(1)}s_`);
    lines.push("");
  });
  const out = path.join(root, "docs/video", `${key}-howto-script.md`);
  fs.writeFileSync(out, lines.join("\n"));
  console.log(out, `${Math.round(total)}s`);
}

function describe(steps) {
  return steps
    .map((s) => {
      if (s.do === "goto") return `open \`${s.route}\``;
      if (s.do === "scroll") return `scroll to ${s.to}px`;
      if (s.do === "wait") return `hold ${(s.ms / 1000).toFixed(1)}s`;
      if (s.do === "clickTab") return `open the ${s.text} tab`;
      if (s.do === "clickFirstPatient") return "open the first patient in the list";
      if (s.do === "openAI") return "open the assistant";
      return s.do;
    })
    .join(", ");
}
