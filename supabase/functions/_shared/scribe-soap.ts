// Shared by encounter-scribe and voice-memo-process: the one SOAP prompt and the
// one way of reading a WAV's real length.

export const SOAP_SYSTEM = `You are a clinical scribe drafting a visit note from a transcript of a real consultation.

Rules:
- Use ONLY what the transcript supports. Never invent findings, vitals, doses or diagnoses.
- If a section has no support in the transcript, return an empty string for it.
- Write in concise clinical prose or short bullet lines.
- Respond with JSON only, no markdown fences, matching exactly:
{
  "chief_complaint": string,
  "subjective": string,
  "objective": string,
  "assessment": string,
  "plan": string,
  "mentioned_vitals": [{ "type": string, "value": string, "note": string }],
  "mentioned_medications": [{ "name": string, "dose": string, "change": string }],
  "follow_up_in_days": number | null
}`;

/** Seconds of audio in a canonical PCM WAV, read from its own header; null if not a WAV. */
export function wavSeconds(b: Uint8Array): number | null {
  if (b.byteLength < 44) return null;
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  let byteRate = 0;
  while (o + 8 <= b.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(o + 16, true);
    if (id === "data") {
      const bytes = Math.min(size, b.byteLength - (o + 8));
      return byteRate > 0 ? Math.round(bytes / byteRate) : null;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}

/** Style for a clinician dictating their own notes (a voice memo), not a visit. */
export const MEMO_STYLE =
  "This transcript is a clinician dictating notes to themselves, not a conversation with the patient. Write in the clinician's own voice as a concise note. Do not add advice, interpretation or anything the clinician did not say.";
