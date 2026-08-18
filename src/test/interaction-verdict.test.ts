import { describe, it, expect } from 'vitest';
import { buildInteractionVerdict } from '@/lib/interaction-verdict';
import type { DrugInteraction } from '@/hooks/useDrugInteractions';
import type { OfflineInteraction } from '@/lib/offline-interactions';

const offlineHit: OfflineInteraction = {
  medications: ['Lisinopril', 'Metformin'],
  severity: 'moderate',
  description: 'May affect blood sugar control.',
  recommendation: 'Monitor blood sugar.',
  med1Name: 'Lisinopril',
  med2Name: 'Metformin',
};

const rxnormHit: DrugInteraction = {
  drug1: 'Lisinopril',
  drug2: 'Metformin',
  severity: 'moderate',
  description: 'Reported interaction.',
  source: 'NIH RxNorm',
} as DrugInteraction;

describe('one verdict from two interaction sources', () => {
  it('never reports "clear" while the offline table disagrees', () => {
    // The exact case found in review: RxNorm silent, offline flagging a pair.
    const v = buildInteractionVerdict({
      rxnorm: [], offline: [offlineHit], rxnormChecked: true, rxnormFailed: false,
    });
    expect(v.isClear).toBe(false);
    expect(v.interactions).toHaveLength(1);
    expect(v.counts.moderate).toBe(1);
  });

  it('reports clear only when both sources ran and both found nothing', () => {
    const v = buildInteractionVerdict({
      rxnorm: [], offline: [], rxnormChecked: true, rxnormFailed: false,
    });
    expect(v.isClear).toBe(true);
  });

  it('does not call a failed lookup a clean bill of health', () => {
    const v = buildInteractionVerdict({
      rxnorm: [], offline: [], rxnormChecked: true, rxnormFailed: true,
    });
    expect(v.isClear).toBe(false);
    expect(v.isPartial).toBe(true);
  });

  it('does not report clear before the lookup has run', () => {
    const v = buildInteractionVerdict({
      rxnorm: [], offline: [], rxnormChecked: false, rxnormFailed: false,
    });
    expect(v.isClear).toBe(false);
  });

  it('shows a pair once when both sources report it', () => {
    const v = buildInteractionVerdict({
      rxnorm: [rxnormHit], offline: [offlineHit], rxnormChecked: true, rxnormFailed: false,
    });
    expect(v.interactions).toHaveLength(1);
    expect(v.interactions[0].source).toBe('rxnorm');
  });

  it('matches a pair regardless of the order the drugs are named', () => {
    const reversed: OfflineInteraction = { ...offlineHit, med1Name: 'Metformin', med2Name: 'Lisinopril' };
    const v = buildInteractionVerdict({
      rxnorm: [rxnormHit], offline: [reversed], rxnormChecked: true, rxnormFailed: false,
    });
    expect(v.interactions).toHaveLength(1);
  });

  it('puts the most severe interaction first', () => {
    const high: OfflineInteraction = {
      ...offlineHit, severity: 'high', med1Name: 'Warfarin', med2Name: 'Aspirin',
    };
    const v = buildInteractionVerdict({
      rxnorm: [], offline: [offlineHit, high], rxnormChecked: true, rxnormFailed: false,
    });
    expect(v.interactions[0].severity).toBe('high');
  });
});
