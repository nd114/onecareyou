import { describe, expect, it } from "vitest";

import {
  didYouMean,
  normaliseForSearch,
  search,
  searchItems,
  searchTerms,
  similarity,
} from "@/lib/search";

const meds = [
  { name: "Amlodipine", dosage: "5 mg", notes: "For blood pressure" },
  { name: "Metformin", dosage: "500 mg", notes: "Twice daily with food" },
  { name: "Co-codamol", dosage: "30/500", notes: "As needed for pain" },
  { name: "Atorvastatin", dosage: "20 mg", notes: "At night" },
];
const fields = (m: (typeof meds)[number]) => [m.name, m.dosage, m.notes];

describe("what people actually type", () => {
  it("finds an accented name typed without accents", () => {
    // On a platform used across countries this is most of the point.
    const people = [{ name: "José Álvarez" }, { name: "Anne Müller" }];
    const by = (p: { name: string }) => [p.name];
    expect(search(people, "jose", by)).toHaveLength(1);
    expect(search(people, "muller", by)[0].name).toBe("Anne Müller");
  });

  it("finds a name typed without its apostrophe or hyphen", () => {
    const people = [{ name: "Síobhán O'Connor" }, { name: "Jean-Luc Bernard" }];
    const by = (p: { name: string }) => [p.name];
    expect(search(people, "oconnor", by)).toHaveLength(1);
    expect(search(people, "jeanluc", by)).toHaveLength(1);
  });

  it("does not care what order the words came in", () => {
    // "pressure blood" found nothing before, and neither did "amlodipine 5mg"
    // against a row reading "5mg amlodipine".
    expect(search(meds, "pressure blood", fields)[0].name).toBe("Amlodipine");
    expect(search(meds, "5 mg amlodipine", fields)[0].name).toBe("Amlodipine");
  });

  it("forgives a typo, which is the failure people actually hit", () => {
    // Drug names are long and unfamiliar, and a substring filter answers a
    // near miss with an empty list.
    expect(search(meds, "amlodipin", fields)[0].name).toBe("Amlodipine");
    expect(search(meds, "metfomin", fields)[0].name).toBe("Metformin");
    expect(search(meds, "atorvastatn", fields)[0].name).toBe("Atorvastatin");
  });

  it("finds a medicine by the start of its name", () => {
    expect(search(meds, "amlo", fields)[0].name).toBe("Amlodipine");
  });

  it("treats punctuation in the data the same way", () => {
    expect(search(meds, "cocodamol", fields)[0].name).toBe("Co-codamol");
  });
});

describe("two words means both, not either", () => {
  it("narrows rather than widens", () => {
    // Typing more should give you fewer things, or search is not search.
    const one = search(meds, "mg", fields).length;
    const two = search(meds, "500 mg", fields).length;
    expect(two).toBeLessThan(one);
  });

  it("finds nothing when one of the words matches nothing", () => {
    expect(search(meds, "amlodipine banana", fields)).toHaveLength(0);
  });
});

describe("ranking", () => {
  it("puts an exact name match first", () => {
    const items = [
      { name: "Vitamin D supplement", notes: "" },
      { name: "Metformin", notes: "take with vitamin D" },
    ];
    const by = (i: (typeof items)[number]) => [i.name, i.notes];
    expect(search(items, "metformin", by)[0].name).toBe("Metformin");
  });

  it("weights the first field above the last", () => {
    // A medication whose *name* matches beats one that merely mentions the
    // word in its instructions.
    const items = [
      { name: "Paracetamol", notes: "not for pain in the chest" },
      { name: "Pain relief gel", notes: "" },
    ];
    const by = (i: (typeof items)[number]) => [i.name, i.notes];
    expect(search(items, "pain", by)[0].name).toBe("Pain relief gel");
  });

  it("never lets a fuzzy hit outrank a real substring", () => {
    const items = [{ name: "Metformin" }, { name: "Metronidazole" }];
    const by = (i: { name: string }) => [i.name];
    expect(search(items, "metformin", by)[0].name).toBe("Metformin");
  });

  it("returns everything, unranked, for an empty query", () => {
    expect(search(meds, "", fields)).toHaveLength(meds.length);
    expect(search(meds, "   ", fields)).toHaveLength(meds.length);
  });
});

describe("similarity", () => {
  it("scores a near miss high and an unrelated word low", () => {
    expect(similarity("amlodipine", "amlodipin")).toBeGreaterThan(0.7);
    expect(similarity("amlodipine", "metformin")).toBeLessThan(0.2);
  });

  it("scores a word against its own opening, which padding is for", () => {
    // Without padding the start of a word barely counts, and "amlo" scores
    // poorly against the drug it opens.
    expect(similarity("amlodipine", "amlo")).toBeGreaterThan(0.25);
  });

  it("is symmetric and bounded", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("metformin", "atorvastatin")).toBe(
      similarity("atorvastatin", "metformin"),
    );
    expect(similarity("", "anything")).toBe(0);
  });
});

describe("did you mean", () => {
  it("offers a correction only when nothing was found", () => {
    // Offering one alongside results teaches people to distrust the results.
    expect(didYouMean(meds, "amlodipine", fields)).toBeNull();
  });

  it("finds a mild typo outright rather than asking about it", () => {
    // "atorvastine" scores 0.56 against "Atorvastatin", well above the
    // matching threshold, so it is a result and not a question.
    expect(search(meds, "atorvastine", fields)[0].name).toBe("Atorvastatin");
    expect(didYouMean(meds, "atorvastine", fields)).toBeNull();
  });

  it("suggests the real value when the typo was too bad to match", () => {
    // The suggestion band sits *below* the matching threshold. Setting it
    // above — which is what a first pass at this did — makes the band empty by
    // construction, because anything that close has already been returned.
    expect(search(meds, "atorvstn", fields)).toHaveLength(0);
    expect(didYouMean(meds, "atorvstn", fields)).toBe("Atorvastatin");
  });

  it("suggests a real value from the list, never a reconstruction", () => {
    // Sending somebody after a phrase nobody has is worse than saying nothing,
    // so a suggestion is always a whole value some row actually carries.
    const suggestion = didYouMean(meds, "metfrmn", fields);
    expect(suggestion).toBe("Metformin");
  });

  it("has a narrow but real band between finding and suggesting", () => {
    // Measured rather than assumed. Dropping vowels from a long drug name
    // lands between 0.17 and 0.30 — found nowhere, recognisable to a person.
    // A milder typo is simply found; a worse one is honestly nothing.
    expect(search(meds, "amlodpn", fields)[0].name).toBe("Amlodipine"); // 0.36, found
    expect(didYouMean(meds, "atorvstn", fields)).toBe("Atorvastatin"); // 0.29, suggested
    expect(didYouMean(meds, "xqzptv", fields)).toBeNull(); // nothing close
  });

  it("says nothing when nothing is close", () => {
    expect(didYouMean(meds, "helicopter", fields)).toBeNull();
    expect(didYouMean(meds, "", fields)).toBeNull();
  });
});

describe("normalising", () => {
  it("strips accents by decomposition rather than a lookup table", () => {
    expect(normaliseForSearch("José Álvarez")).toBe("jose alvarez");
    expect(normaliseForSearch("Müller")).toBe("muller");
    expect(normaliseForSearch("Łódź")).toBe("łodz");
  });

  it("closes up apostrophes and splits on everything else", () => {
    expect(normaliseForSearch("O'Connor")).toBe("oconnor");
    expect(normaliseForSearch("5mg/dose")).toBe("5mg dose");
  });

  it("keeps digits and letters from any script", () => {
    expect(normaliseForSearch("Аспирин 100")).toBe("аспирин 100");
  });

  it("gives no terms for a query of only punctuation", () => {
    expect(searchTerms("!!!")).toEqual([]);
    expect(searchTerms("")).toEqual([]);
  });
});

describe("the shape callers need", () => {
  it("hands back scores when a caller wants to show relevance", () => {
    const [top] = searchItems(meds, "amlodipine", fields);
    expect(top.item.name).toBe("Amlodipine");
    expect(top.score).toBeGreaterThan(0.5);
  });

  it("honours a limit after ranking, so the best survive", () => {
    const limited = search(meds, "mg", fields, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("copes with rows whose fields are empty or missing", () => {
    const sparse = [{ name: "", notes: null }, { name: "Aspirin", notes: undefined }];
    const by = (i: (typeof sparse)[number]) => [i.name, i.notes];
    expect(search(sparse, "aspirin", by)).toHaveLength(1);
  });
});
