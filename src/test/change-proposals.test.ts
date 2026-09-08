import { describe, expect, it } from 'vitest';

import { describeProposal, type ChangeProposal } from '@/hooks/useChangeProposals';

/**
 * What a proposal says it is.
 *
 * The whole mechanism rests on the patient understanding what they are being
 * asked to accept. A card that renders "medication_change" is a card nobody
 * can answer, and one that lists every field alongside the one that changed
 * makes the reader hunt for the edit.
 */
const base: ChangeProposal = {
  id: 'p1',
  patient_user_id: 'pat',
  proposed_by_user_id: 'doc',
  kind: 'medication_change',
  medication_id: 'm1',
  payload: {},
  rationale: null,
  status: 'pending',
  responded_at: null,
  response_note: null,
  applied_medication_id: null,
  created_at: '2026-09-01T00:00:00Z',
};

describe('describeProposal', () => {
  it('names the medication being changed', () => {
    const { title } = describeProposal({ ...base, payload: { dosage: '1000 mg' } }, 'Metformin');
    expect(title).toBe('Change Metformin');
  });

  it('says what the new dose is, because that is the decision', () => {
    const { detail } = describeProposal({ ...base, payload: { dosage: '1000 mg' } }, 'Metformin');
    expect(detail).toContain('1000 mg');
  });

  it('lists only what is changing', () => {
    const { detail } = describeProposal(
      { ...base, payload: { dosage: '1000 mg' } },
      'Metformin',
    );
    expect(detail).not.toMatch(/frequency/i);
  });

  it('lists every field that is changing, not just the first', () => {
    const { detail } = describeProposal(
      { ...base, payload: { dosage: '1000 mg', frequency: 'once daily' } },
      'Metformin',
    );
    expect(detail).toContain('1000 mg');
    expect(detail).toContain('once daily');
  });

  it('falls back to the note when a change carries no recognised field', () => {
    const { detail } = describeProposal({ ...base, payload: { pharmacy: 'Boots' } }, 'Metformin');
    expect(detail).toBe('Details in the note below');
  });

  it('reads as a stop when it is a stop', () => {
    const { title, detail } = describeProposal({ ...base, kind: 'medication_stop' }, 'Metformin');
    expect(title).toBe('Stop Metformin');
    expect(detail).toBeNull();
  });

  it('names a new medication from the payload, since there is no row yet', () => {
    const { title, detail } = describeProposal({
      ...base,
      kind: 'medication_start',
      medication_id: null,
      payload: { name: 'Gliclazide', dosage: '80 mg', frequency: 'once daily' },
    });
    expect(title).toBe('Start Gliclazide');
    expect(detail).toBe('80 mg, once daily');
  });

  it('degrades to something readable when the medication name is unknown', () => {
    // A clinician's proposal about a medication the patient has since removed,
    // or a list that has not loaded yet. "Change undefined" is the failure this
    // guards against.
    const { title } = describeProposal({ ...base, payload: { dosage: '5 mg' } });
    expect(title).toBe('Change a medication');
  });

  it('does not claim a strength a start proposal did not give', () => {
    const { detail } = describeProposal({
      ...base,
      kind: 'medication_start',
      medication_id: null,
      payload: { name: 'Gliclazide' },
    });
    expect(detail).toBeNull();
  });
});
