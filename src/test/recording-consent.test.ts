import { describe, expect, it } from "vitest";

import {
  RECORDING_NOTICE,
  RECORDING_NOTICE_VERSION,
  acknowledgeRecordingNotice,
  defaultRecordingTitle,
  formatDuration,
  normaliseRecordingTitle,
  recordingFileName,
  transcriptFileBody,
} from "@/lib/recording-consent";

describe("what someone is told before recording", () => {
  it("tells them to ask, rather than telling them what the law is", () => {
    // Recording law is one-party in some places and all-party in others, and
    // we do not know where any given patient is. Guessing wrong turns a
    // helpful feature into a criminal offence for the person using it.
    const asking = RECORDING_NOTICE.find((p) => /ask/i.test(p.heading));
    expect(asking).toBeDefined();
    expect(asking?.body).toMatch(/permission|agreement/i);
    expect(asking?.body).toMatch(/differ|vary|country|place/i);
  });

  it("says the transcript will be wrong in places", () => {
    const accuracy = RECORDING_NOTICE.find((p) => /mistake|accur/i.test(p.heading));
    expect(accuracy).toBeDefined();
    // The parts that matter clinically are the parts most often wrong.
    expect(accuracy?.body).toMatch(/dose|name|number/i);
  });

  it("says it is not the clinical record", () => {
    expect(RECORDING_NOTICE.some((p) => /not a medical record/i.test(p.heading))).toBe(true);
  });

  it("says who can see it", () => {
    const privacy = RECORDING_NOTICE.find((p) => /private|yours/i.test(p.heading));
    expect(privacy?.body).toMatch(/nobody else|unless you/i);
  });

  it("says a whole-Vault share does not include recordings", () => {
    // It used to. The audio and transcript are ordinary Vault documents, so
    // "Clinicians can view whole vault when granted" reached them, and a
    // patient who turned that on had handed over every recording without
    // being told. The database was fixed; this holds the sentence that says
    // so, because the promise and the policy have to agree.
    const privacy = RECORDING_NOTICE.find((p) => /private|yours/i.test(p.heading));
    expect(privacy?.body).toMatch(/whole vault/i);
    expect(privacy?.body).toMatch(/deliberately|specifically|each one/i);
  });

  it("admits that asking for a transcript sends the audio away", () => {
    // "Stays private" stops being true the moment a transcript is produced,
    // because producing one means shipping the audio to something that can
    // hear it. Saying so is the difference between a promise and a claim we
    // break the first time the feature is used.
    const privacy = RECORDING_NOTICE.find((p) => /private|yours/i.test(p.heading));
    expect(privacy?.body).toMatch(/transcri/i);
    expect(privacy?.body).toMatch(/sent to|send/i);
  });
});

describe("the acknowledgement", () => {
  it("records which wording was agreed to, not just that something was", () => {
    // Otherwise it becomes impossible to say what a person actually agreed to
    // once the text changes.
    const consent = acknowledgeRecordingNotice(new Date("2026-10-01T09:15:00Z"));
    expect(consent.noticeVersion).toBe(RECORDING_NOTICE_VERSION);
    expect(consent.acknowledgedAt).toBe("2026-10-01T09:15:00.000Z");
  });
});

describe("naming a recording", () => {
  it("defaults to the day and time, which is always correct", () => {
    const title = defaultRecordingTitle(new Date("2026-10-01T09:15:00Z"));
    expect(title).toMatch(/2026/);
    expect(title).toMatch(/Oct/);
  });

  it("keeps a name the patient typed", () => {
    expect(normaliseRecordingTitle("  Cardiology   follow-up  ")).toBe("Cardiology follow-up");
  });

  it("falls back to the timestamp rather than storing nothing", () => {
    // An untitled recording is an unfindable one.
    const when = new Date("2026-10-01T09:15:00Z");
    expect(normaliseRecordingTitle("   ", when)).toBe(defaultRecordingTitle(when));
  });

  it("bounds the length", () => {
    expect(normaliseRecordingTitle("x".repeat(500)).length).toBe(120);
  });
});

describe("the filename it downloads as", () => {
  it("comes from the title", () => {
    expect(recordingFileName("Cardiology follow-up", "webm")).toBe("Cardiology-follow-up.webm");
  });

  it("strips anything that would break a filesystem", () => {
    expect(recordingFileName("Dr Evans / 1st visit: notes?", "txt")).toBe("Dr-Evans-1st-visit-notes.txt");
  });

  it("never produces a nameless file", () => {
    expect(recordingFileName("///", "webm")).toBe("recording.webm");
    expect(recordingFileName("", "txt")).toBe("recording.txt");
  });

  it("keeps letters from any alphabet", () => {
    // A name is not less valid for being written in another script.
    expect(recordingFileName("Consultation médicale", "txt")).toBe("Consultation-médicale.txt");
  });
});

describe("the transcript file a patient downloads", () => {
  const recording = {
    title: "Cardiology follow-up",
    recorded_at: "2026-10-01T09:15:00Z",
    transcript: "  Clinician: How have you been?\nPatient: Better.  ",
  };

  it("carries the warning inside the file, not just on the screen", () => {
    // The downloaded copy is the one most likely to be read by somebody who
    // never saw the dialog — forwarded to a relative, printed, filed away.
    const body = transcriptFileBody(recording);
    expect(body).toMatch(/produced automatically/i);
    expect(body).toMatch(/doses and numbers/i);
    expect(body).toMatch(/not a\s+medical record/i);
  });

  it("says which recording it came from and when", () => {
    const body = transcriptFileBody(recording);
    expect(body).toContain("Cardiology follow-up");
    expect(body).toMatch(/Recorded /);
  });

  it("includes the transcript, trimmed", () => {
    const body = transcriptFileBody(recording);
    expect(body).toContain("Clinician: How have you been?");
    expect(body).toContain("Patient: Better.");
    expect(body).not.toContain("  Clinician");
  });

  it("still warns when there is no transcript text", () => {
    // An empty file that says nothing is one a patient could mistake for a
    // faithful record of a silent room.
    const body = transcriptFileBody({ ...recording, transcript: null });
    expect(body).toMatch(/produced automatically/i);
  });
});

describe("how long a recording ran", () => {
  it("counts seconds while it is still seconds", () => {
    expect(formatDuration(45)).toBe("45 sec");
  });

  it("drops the seconds when they are zero", () => {
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(605)).toBe("10 min 5 sec");
  });

  it("switches to hours for a long appointment", () => {
    expect(formatDuration(3900)).toBe("1 hr 5 min");
  });

  it("says so rather than showing a wrong number", () => {
    // duration_seconds is nullable, and "0 sec" for an unknown length would
    // read as an empty recording.
    expect(formatDuration(null)).toBe("Length unknown");
  });
});
