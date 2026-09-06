import { describe, expect, it } from "vitest";

import {
  answerLookupTool,
  boundedNames,
  buildInteractionVerdict,
  condense,
  drugNamesMatch,
  fetchDrugLabel,
  fetchRxNormInteractions,
  formatInteractionVerdict,
  formatMedicationBrief,
  interactionCheck,
  interactionsFromRxNav,
  isLookupTool,
  labelExcerpt,
  medicationBrief,
  missedDosePassage,
  referenceInteractionsFor,
  searchSafeName,
  severityFromDescription,
  type FetchLike,
} from "../../supabase/functions/_shared/medication-knowledge";

/**
 * The assistant used to answer "can I take ibuprofen with my lisinopril?" from
 * the model's own memory while the medications page answered the same question
 * from RxNorm plus the offline table. These tests exist to keep the two on one
 * body of knowledge, and — more importantly — to keep the gaps in that
 * knowledge visible instead of quietly filled in.
 */

/** A fetch that answers from a fixed URL→body map and records what it was asked. */
function stubFetch(routes: Array<[RegExp, unknown, number?]>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const fn = (async (url: string) => {
    urls.push(url);
    for (const [pattern, body, status] of routes) {
      if (pattern.test(url)) {
        const code = status ?? 200;
        return { ok: code >= 200 && code < 300, status: code, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }) as FetchLike & { urls: string[] };
  fn.urls = urls;
  return fn;
}

describe("missed-dose extraction", () => {
  const leaflet =
    "Take LISINOPRIL exactly as prescribed. The usual starting dose is 10 mg once daily and " +
    "may be titrated to 40 mg. If you miss a dose, take it as soon as you remember. " +
    "If it is almost time for your next dose, skip the missed dose and go back to your " +
    "regular schedule. Do not take two doses at the same time. Store below 30C.";

  it("returns the guidance and the sentence that prevents doubling up", () => {
    const passage = missedDosePassage(leaflet);
    expect(passage).toContain("take it as soon as you remember");
    expect(passage).toContain("skip the missed dose");
  });

  it("leaves the titration sentence out of it", () => {
    // The whole reason this is an extraction and not a section: handing an
    // assistant a dose-titration table is handing it the dose changes it has
    // been told not to discuss.
    expect(missedDosePassage(leaflet)).not.toContain("40 mg");
  });

  it("returns null when the label never mentions a missed dose", () => {
    expect(missedDosePassage("Take one tablet daily with water. Store below 30C.")).toBeNull();
  });

  it("finds the guidance however the label words it", () => {
    expect(missedDosePassage("If you forget to take a tablet, take it when you remember.")).not.toBeNull();
    expect(missedDosePassage("Never double the dose to make up for a missed one.")).not.toBeNull();
  });
});

describe("label excerpts", () => {
  const label = {
    adverse_reactions: ["<p>Common: cough, dizziness.</p>"],
    dosage_and_administration: ["Start at 10 mg. If you miss a dose, take it when you remember."],
    openfda: { brand_name: ["Zestril"], generic_name: ["LISINOPRIL"], manufacturer_name: ["Almatica"] },
  };

  it("strips markup out of the section it quotes", () => {
    const excerpt = labelExcerpt(label, "side_effects");
    expect(excerpt.found).toBe(true);
    expect(excerpt.text).toBe("Common: cough, dizziness.");
    expect(excerpt.section).toBe("adverse_reactions");
  });

  it("reports a missing section rather than returning empty text", () => {
    const excerpt = labelExcerpt(label, "storage");
    expect(excerpt.found).toBe(false);
    expect(excerpt.section).toBeNull();
  });

  it("does not fall back to the whole dosage section for a missed dose", () => {
    const noGuidance = { dosage_and_administration: ["Start at 10 mg and titrate to 40 mg."] };
    expect(labelExcerpt(noGuidance, "missed_dose").found).toBe(false);
  });
});

describe("the brief the model reads", () => {
  it("names every gap instead of leaving it blank", () => {
    const text = formatMedicationBrief({
      query: "Zestril",
      identity: { name: "Zestril", genericName: "LISINOPRIL" },
      excerpts: [
        { topic: "side_effects", section: "adverse_reactions", text: "Cough.", found: true },
        { topic: "missed_dose", section: null, text: "", found: false },
      ],
      labelFound: true,
    });

    expect(text).toContain("SIDE EFFECTS");
    expect(text).toContain("MISSED DOSE — the label does not answer this");
    expect(text).toContain("do not fill it in from memory");
  });

  it("tells the model not to answer from memory when nothing was found", () => {
    const text = formatMedicationBrief({
      query: "xyzzy",
      identity: null,
      excerpts: [],
      labelFound: false,
    });
    expect(text).toContain("NO LABEL FOUND");
    expect(text).toContain("Do NOT answer from memory");
  });
});

describe("interaction severity", () => {
  it("grades upward when a description carries words from both bands", () => {
    // Biased on purpose: read-as-worse costs a question to a pharmacist, and
    // the other direction costs more than that.
    expect(severityFromDescription("A minor effect, but avoid the combination.")).toBe("high");
  });

  it("keeps the plainly small ones small", () => {
    expect(severityFromDescription("The effect is theoretical.")).toBe("low");
    expect(severityFromDescription("May increase plasma concentration.")).toBe("moderate");
  });
});

describe("RxNav parsing", () => {
  const payload = {
    fullInteractionTypeGroup: [
      {
        sourceName: "DrugBank",
        interactionType: [
          {
            interactionPair: [
              {
                description: "Risk of severe hyperkalemia.",
                interactionConcept: [
                  { minConceptItem: { name: "lisinopril" }, sourceConceptItem: { url: "https://x" } },
                  { minConceptItem: { name: "spironolactone" } },
                ],
              },
              {
                description: "May increase plasma levels.",
                interactionConcept: [
                  { minConceptItem: { name: "a" } },
                  { minConceptItem: { name: "b" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("puts the worst pair first", () => {
    const parsed = interactionsFromRxNav(payload);
    expect(parsed.map((i) => i.severity)).toEqual(["high", "moderate"]);
    expect(parsed[0].drug1).toBe("lisinopril");
    expect(parsed[0].sourceUrl).toBe("https://x");
  });

  it("returns nothing for a body that is not an interaction list", () => {
    expect(interactionsFromRxNav({})).toEqual([]);
    expect(interactionsFromRxNav(null)).toEqual([]);
    expect(interactionsFromRxNav({ fullInteractionTypeGroup: "nope" })).toEqual([]);
  });
});

describe("the reference table", () => {
  it("matches a pair however the two are ordered", () => {
    const hits = referenceInteractionsFor(["Ibuprofen", "Aspirin"]);
    expect(hits).toHaveLength(1);
    expect(referenceInteractionsFor(["Aspirin", "Ibuprofen"])).toHaveLength(1);
  });

  it("matches a name that carries its strength", () => {
    expect(drugNamesMatch("Ibuprofen 400mg", "Ibuprofen")).toBe(true);
    expect(drugNamesMatch("Metformin", "Lisinopril")).toBe(false);
  });

  it("matches across a separator, whichever side has it", () => {
    // The inherited normalisation deleted the hyphen instead of spacing it, so
    // "Vitamin-K" became "vitamink" and missed the table's "Vitamin K" — losing
    // the warfarin warning for anyone who typed it that way.
    expect(drugNamesMatch("Vitamin-K", "Vitamin K")).toBe(true);
    expect(drugNamesMatch("Co-codamol", "co codamol")).toBe(true);
    expect(referenceInteractionsFor(["Warfarin", "Vitamin-K"])).toHaveLength(1);
    expect(referenceInteractionsFor(["Metformin", "Contrast-Dye"])).toHaveLength(1);
  });

  it("never matches on an empty name", () => {
    expect(drugNamesMatch("", "Aspirin")).toBe(false);
  });
});

describe("the verdict, and what silence means", () => {
  const clear = { rxnorm: [], reference: [], rxnormChecked: true, rxnormFailed: false };

  it("is only clear when both sources actually answered", () => {
    expect(buildInteractionVerdict(clear).isClear).toBe(true);
    expect(buildInteractionVerdict({ ...clear, rxnormFailed: true }).isClear).toBe(false);
    expect(buildInteractionVerdict({ ...clear, rxnormChecked: false }).isClear).toBe(false);
  });

  it("tells the model that a failed check is not a clean result", () => {
    const text = formatInteractionVerdict(
      ["lisinopril", "ibuprofen"],
      buildInteractionVerdict({ ...clear, rxnormFailed: true }),
    );
    expect(text).toContain("THE CHECK DID NOT COMPLETE");
    expect(text).toContain("Do NOT say there are no interactions");
  });

  it("does not let the model call a clean check 'safe'", () => {
    const text = formatInteractionVerdict(["a", "b"], buildInteractionVerdict(clear));
    expect(text).toContain("not that they are safe");
  });

  it("reports the same pair once when both sources have it", () => {
    const verdict = buildInteractionVerdict({
      rxnorm: [
        {
          drug1: "Ibuprofen",
          drug2: "Aspirin",
          severity: "high",
          description: "Bleeding risk.",
          source: "DrugBank",
        },
      ],
      reference: referenceInteractionsFor(["Ibuprofen", "Aspirin"]),
      rxnormChecked: true,
      rxnormFailed: false,
    });
    expect(verdict.interactions).toHaveLength(1);
    expect(verdict.interactions[0].sourceLabel).toBe("DrugBank");
  });
});

describe("retrieval", () => {
  const labelBody = {
    results: [
      {
        openfda: { brand_name: ["Zestril"], generic_name: ["LISINOPRIL"] },
        adverse_reactions: ["Cough, dizziness."],
      },
    ],
  };

  it("falls through to the substance search when the name search misses", async () => {
    const fetchFn = stubFetch([[/substance_name/, labelBody]]);
    const label = await fetchDrugLabel("Zestril", fetchFn);
    expect(label).not.toBeNull();
    expect(fetchFn.urls).toHaveLength(2);
  });

  it("keeps a crafted name out of the query", () => {
    // openFDA takes a query string, so an unescaped quote rewrites the search
    // rather than being searched for.
    expect(searchSafeName('lisinopril" OR openfda.brand_name:"aspirin')).toBe(
      "lisinopril OR openfda brand name aspirin",
    );
  });

  it("reports no label rather than throwing when the network fails", async () => {
    const exploding: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await fetchDrugLabel("Zestril", exploding)).toBeNull();

    const brief = await medicationBrief("Zestril", ["side_effects"], exploding);
    expect(brief.labelFound).toBe(false);
    expect(formatMedicationBrief(brief)).toContain("Do NOT answer from memory");
  });

  it("marks RxNorm unreachable when it will not answer", async () => {
    const fetchFn = stubFetch([[/rxcui\.json/, { idGroup: { rxnormId: ["1"] } }], [/interaction/, {}, 503]]);
    const lookup = await fetchRxNormInteractions(["a", "b"], fetchFn);
    expect(lookup.reachable).toBe(false);
  });

  it("does not call a lookup it never made 'nothing found'", async () => {
    // Neither name is known to RxNorm, so the question was never put to it.
    const fetchFn = stubFetch([[/rxcui\.json/, { idGroup: {} }]]);
    expect((await fetchRxNormInteractions(["zzz", "qqq"], fetchFn)).reachable).toBe(false);
  });

  it("still reports the reference pair when the live source is down", async () => {
    const fetchFn = stubFetch([[/rxcui\.json/, {}, 500]]);
    const verdict = await interactionCheck(["Ibuprofen", "Aspirin"], fetchFn);

    expect(verdict.isClear).toBe(false);
    expect(verdict.isPartial).toBe(true);
    expect(verdict.interactions).toHaveLength(1);
    expect(formatInteractionVerdict(["Ibuprofen", "Aspirin"], verdict)).toContain("may be incomplete");
  });
});

describe("condensing", () => {
  it("cuts at a sentence boundary and says that it cut", () => {
    const text = `${"One sentence here. ".repeat(20)}Tail.`;
    const short = condense(text, 100);
    expect(short.length).toBeLessThan(140);
    expect(short).toContain("[…truncated]");
    expect(short).toMatch(/\.\s\[…truncated\]$/);
  });

  it("leaves text that already fits alone", () => {
    expect(condense("Short enough.", 100)).toBe("Short enough.");
  });
});

describe("the assistant's lookups", () => {
  const labelBody = {
    results: [
      {
        openfda: { brand_name: ["Zestril"], generic_name: ["LISINOPRIL"] },
        adverse_reactions: ["Cough, dizziness."],
      },
    ],
  };

  it("cites the label it read", async () => {
    const fetchFn = stubFetch([[/brand_name/, labelBody]]);
    const result = await answerLookupTool("look_up_medication", { name: "Zestril" }, fetchFn);

    expect(result.source).toBe("FDA label — Zestril");
    expect(result.content).toContain("SIDE EFFECTS");
    // Every topic was asked for, so every gap is named.
    expect(result.content).toContain("MISSED DOSE — the label does not answer this");
  });

  it("cites nothing when it found nothing", async () => {
    const result = await answerLookupTool("look_up_medication", { name: "xyzzy" }, stubFetch([]));
    expect(result.source).toBeNull();
    expect(result.content).toContain("NO LABEL FOUND");
  });

  it("ignores topics the model made up", async () => {
    const fetchFn = stubFetch([[/brand_name/, labelBody]]);
    const result = await answerLookupTool(
      "look_up_medication",
      { name: "Zestril", topics: ["side_effects", "dosage_advice", 7] },
      fetchFn,
    );
    expect(result.content).toContain("SIDE EFFECTS");
    expect(result.content).not.toContain("dosage_advice");
  });

  it("asks rather than guessing when only one medicine was named", async () => {
    const result = await answerLookupTool("check_interactions", { names: ["aspirin"] }, stubFetch([]));
    expect(result.content).toContain("no interaction check was run");
    expect(result.source).toBeNull();
  });

  it("caps how many medicines one turn can check", () => {
    expect(boundedNames(Array.from({ length: 40 }, (_, i) => `drug${i}`), 10)).toHaveLength(10);
    expect(boundedNames(["a", "", "  ", 7, null], 10)).toEqual(["a"]);
    expect(boundedNames("not an array", 10)).toEqual([]);
  });

  it("marks the citation partial when the check could not complete", async () => {
    const fetchFn = stubFetch([[/rxcui\.json/, {}, 500]]);
    const result = await answerLookupTool(
      "check_interactions",
      { names: ["Ibuprofen", "Aspirin"] },
      fetchFn,
    );
    // The line under the reply must not read as a clean bill of health.
    expect(result.source).toBe("Interaction check (incomplete)");
  });

  it("only recognises the two lookups", () => {
    expect(isLookupTool("look_up_medication")).toBe(true);
    expect(isLookupTool("check_interactions")).toBe(true);
    expect(isLookupTool("propose_add_medication")).toBe(false);
    expect(isLookupTool(undefined)).toBe(false);
  });
});

describe("a check that never ran", () => {
  it("is never reported as a clean one", async () => {
    const verdict = await interactionCheck(["aspirin"], stubFetch([]));
    expect(verdict.isClear).toBe(false);
    expect(formatInteractionVerdict(["aspirin"], verdict)).toContain("Do NOT say there are no interactions");
  });
});
