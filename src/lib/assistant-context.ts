/**
 * What the assistant should already know when it opens.
 *
 * The drawer used to open on the same blank box with the same three starters
 * — "What is HbA1c?", "How do I add a vital?", "What is blood pressure?" —
 * whether you were looking at your medications, your bills or your care team.
 * That is what makes it feel like a destination you have to brief rather than
 * something that is already with you: the screen knows what you are doing and
 * the assistant does not.
 *
 * This maps the route to a short description of where the person is and three
 * questions worth asking *there*. It is deliberately a lookup rather than
 * anything cleverer: the starters are the product's voice, and a generated one
 * would drift.
 */

export interface AssistantContext {
  /** Where the person is, in their words. Shown under the title. */
  where: string;
  /** Openers relevant to this screen. Kept to three; more reads as a menu. */
  starters: string[];
}

/** Fallback for a screen with nothing specific to say. Never route-specific. */
const GENERAL: AssistantContext = {
  where: "your record",
  starters: [
    "What does my record show about me?",
    "Explain a result I do not understand",
    "How do I share with a doctor?",
  ],
};

/**
 * A sub-route inherits its parent's context, so `/medications/add` is still
 * about medications. Where two prefixes would both match, the longer one wins
 * — none currently overlap, so that rule is defensive rather than load-bearing.
 */
const BY_ROUTE: Array<[string, AssistantContext]> = [
  ["/vitals", {
    where: "your readings",
    starters: [
      "What do my recent readings suggest?",
      "Is this blood pressure reading normal?",
      "How often should I be measuring this?",
    ],
  }],
  ["/medications", {
    where: "your medications",
    starters: [
      "Do any of my medications interact?",
      "What is this one for?",
      "What should I do about a missed dose?",
    ],
  }],
  ["/medication-info", {
    where: "a medication",
    starters: [
      "What are the common side effects?",
      "Does this interact with what I already take?",
      "Should I take this with food?",
    ],
  }],
  ["/schedule", {
    where: "today's doses",
    starters: [
      "What am I due to take today?",
      "What happens if I take it late?",
      "Can I move a dose to the evening?",
    ],
  }],
  ["/health-vault", {
    where: "your documents",
    starters: [
      "Summarise my most recent letter",
      "What does this lab result mean?",
      "Which documents has my doctor seen?",
    ],
  }],
  ["/care-circle", {
    where: "who can see your record",
    starters: [
      "Who can see my record right now?",
      "What does each permission actually share?",
      "How do I stop sharing with someone?",
    ],
  }],
  ["/messages", {
    where: "your messages",
    starters: [
      "Summarise what my doctor told me",
      "Help me word a question for my doctor",
      "What was I asked to do after the last visit?",
    ],
  }],
  ["/billing", {
    where: "your bills",
    starters: [
      "What is this charge for?",
      "What do I still owe?",
      "Who do I ask about a bill I do not recognise?",
    ],
  }],
  ["/adherence-report", {
    where: "how you are keeping up",
    starters: [
      "How have I been doing this month?",
      "Which doses do I miss most?",
      "How do I set a better reminder?",
    ],
  }],
  ["/guidance", {
    where: "what your clinician asked",
    starters: [
      "What did my clinician ask me to do?",
      "Explain this instruction in plain words",
      "What happens if I cannot do it?",
    ],
  }],
  ["/knowledge-base", {
    where: "the health library",
    starters: [
      "Explain this condition simply",
      "What questions should I ask my doctor?",
      "How does this relate to my own record?",
    ],
  }],
  ["/dashboard", {
    where: "your day",
    starters: [
      "What needs my attention today?",
      "Anything unusual in my recent readings?",
      "What is coming up?",
    ],
  }],
  ["/settings", {
    where: "your settings",
    starters: [
      "Who has access to my record?",
      "How do I export everything?",
      "How do I turn off AI features?",
    ],
  }],
];

export function assistantContextFor(pathname: string): AssistantContext {
  let best: { context: AssistantContext; length: number } | null = null;
  for (const [prefix, context] of BY_ROUTE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = { context, length: prefix.length };
    }
  }
  return best?.context ?? GENERAL;
}
