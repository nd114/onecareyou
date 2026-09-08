import { describe, expect, it } from 'vitest';

/**
 * The agreement has to contain the instruction the platform acts on.
 *
 * Withdrawal is only processor behaviour if the practice instructed it. If the
 * clause below disappears — a rewrite, a tidy-up, a lawyer's redline that drops
 * a paragraph — then OneCare restricting access on a declared incident stops
 * being the practice's decision and becomes ours, which is what a controller
 * does. Nothing would fail; the capability would keep working exactly as
 * before, and only its legal footing would have moved.
 *
 * Asserted against the source for the same reason as the assistant actions
 * gate: the failure is invisible at runtime.
 */
const read = async () => {
  const fs = await import('node:fs/promises');
  return fs.readFile('src/pages/ClinicianBAA.tsx', 'utf8');
};

describe('the data protection agreement', () => {
  it('instructs OneCare to restrict access on a declared incident', async () => {
    const src = await read();
    expect(src).toMatch(/WITHDRAWAL AND CONTAINMENT/);
    expect(src).toMatch(/The practice instructs OneCare/);
  });

  it('says OneCare does not decide, adjudicate, or act on its own motion', async () => {
    // The three sentences that keep us a processor. Losing any of them is how
    // the platform drifts into determining purposes.
    const src = await read();
    expect(src).toMatch(/does not determine whether a withdrawal is\s*\n?\s*justified/);
    expect(src).toMatch(/adjudicate any dispute/);
    expect(src).toMatch(/initiate a withdrawal of its own motion/);
  });

  it('names restriction as Article 18 rather than erasure', async () => {
    // A withdrawal that reads as an erasure invites a request to erase the
    // audit trail with it.
    const src = await read();
    expect(src).toMatch(/restriction of processing within the meaning\s*\n?\s*of Article 18/);
    expect(src).toMatch(/is not an erasure/);
  });

  it('preserves the record and the audit trail through a restriction', async () => {
    expect(await read()).toMatch(/Preserve the underlying record, the file and the audit trail/);
  });

  it('carries the breach clock HIPAA actually sets', async () => {
    // 45 CFR 164.410 is "without unreasonable delay and no later than 60 days".
    // A bare 60 days is both weaker than the rule and slower than the platform.
    const src = await read();
    expect(src).toMatch(/without unreasonable delay and in no case later than\s*\n?\s*60 calendar days/);
  });

  it('carries the Article 28(3) obligations a processing agreement must have', async () => {
    const src = await read();
    for (const clause of [
      'documented instructions',
      'obligation of confidentiality',
      'sub-processors',
      'Articles 32 to 36',
      'delete or return',
      'contributes to audits',
    ]) {
      expect(src).toContain(clause);
    }
  });

  it('states the split role rather than claiming to be only a processor', async () => {
    // OneCare is a controller for the patient's own account. Saying so in the
    // agreement is more defensible than a claim that would not survive a look
    // at the product.
    expect(await read()).toMatch(/controller in its own right only for the account/);
  });

  it('is on a version that will prompt existing signatories to re-sign', async () => {
    // The terms changed materially. Leaving the version alone would leave every
    // practice on an agreement that does not contain the instruction.
    expect(await read()).toMatch(/CURRENT_BAA_VERSION = '2\.0'/);
  });
});
