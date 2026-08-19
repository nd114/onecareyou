#!/usr/bin/env python3
"""Mux the live screen capture with the ElevenLabs narration and lower-third captions."""
import json
import os
import subprocess
import sys

KEY = sys.argv[1]
WORK = f"/mnt/documents/howto-build/{KEY}"
OUT = f"/mnt/documents/onecare-howto-{KEY}.mp4"
FONT = subprocess.run(
    ["fc-match", "-f", "%{file}", "DejaVu Sans:style=Bold"],
    capture_output=True, text=True).stdout.strip() or "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

timeline = json.load(open(f"{WORK}/timeline.json"))["beats"]
video = next(
    os.path.join(f"{WORK}/video", f)
    for f in sorted(os.listdir(f"{WORK}/video")) if f.endswith(".webm")
)

inputs = ["-i", video]
audio_parts = []
for i, b in enumerate(timeline):
    inputs += ["-i", b["audio"]]
    delay = int(b["start"] * 1000)
    audio_parts.append(f"[{i+1}:a]adelay={delay}|{delay},volume=1.0[a{i}]")

mix = "".join(f"[a{i}]" for i in range(len(timeline)))
filters = [
    "[0:v]scale=1920:1080:flags=lanczos,format=yuv420p[v0]",
]

def esc(t):
    return t.replace("\\", "").replace(":", "\\:").replace("'", "")

chain = "[v0]"
for i, b in enumerate(timeline):
    s, e = b["start"] + 0.25, b["end"] - 0.25
    label = f"[v{i+1}]"
    filters.append(
        f"{chain}drawtext=fontfile={FONT}:text='{esc(b['chapter'].upper())}  \u00b7  {esc(b['caption'])}'"
        f":fontsize=34:fontcolor=0xFAF3E3:box=1:boxcolor=0x0B3D2E@0.88:boxborderw=22"
        f":x=72:y=h-140:enable='between(t,{s:.2f},{e:.2f})'{label}"
    )
    chain = label

filters += audio_parts
filters.append(f"{mix}amix=inputs={len(timeline)}:normalize=0:dropout_transition=0[aout]")

cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs,
       "-filter_complex", ";".join(filters),
       "-map", chain, "-map", "[aout]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20",
       "-c:a", "aac", "-b:a", "192k", "-shortest", OUT]
subprocess.run(cmd, check=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
