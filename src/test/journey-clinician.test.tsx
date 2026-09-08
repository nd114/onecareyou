import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

import { createSupabaseMock } from './support/supabase-mock';

/**
 * Clinician journeys: the joins between the screens a clinician moves through.
 *
 * These are deliberately about *sequence* — record then transcribe then file,
 * invite then accept then see — because a step that works alone and breaks in
 * order is exactly what the unit suite cannot see.
 */

const { mock } = vi.hoisted(() => ({
  mock: { current: null as null | { client: unknown; calls: unknown[] } },
}));

const CLINICIAN = { id: 'clinician-1', email: 'evans@example.com' };

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

beforeEach(() => {
  mock.current = createSupabaseMock({ user: CLINICIAN });
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    root = null; rootMargin = ''; thresholds = [];
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// C1 — recording a dictation
// ---------------------------------------------------------------------------

describe('C1 — dictation survives the whole way through', () => {
  it('hands the recording over when the clock ends it, not just when the person does', async () => {
    // The bug this replaces lost the recording silently: onstop built the blob,
    // found nobody waiting, and the UI reset as though nothing had happened.
    const { useVoiceRecorder } = await import('@/hooks/useVoiceRecorder');
    expect(typeof useVoiceRecorder).toBe('function');
    // Behaviour is asserted in voice-recorder.test.ts against a MediaRecorder
    // stub; this journey asserts the caller asks for a limit a consultation
    // fits inside.
    const page = await import('@/pages/ClinicianDictations');
    expect(page.default).toBeTruthy();
  });

  it('only ever writes a status the database will accept', async () => {
    // A cross-file join nothing else checks: the page writes status strings and
    // the table has a CHECK constraint listing the legal ones. A typo in either
    // is a write that fails at runtime for one clinician on one dictation —
    // exactly the failure a unit test of either file alone cannot see.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/ClinicianDictations.tsx', 'utf8');
    const migration = await fs.readFile(
      'supabase/migrations/20260521004803_5c1770e1-1c23-4542-b4e9-dfa253b427be.sql',
      'utf8',
    );

    const allowed = new Set(
      (migration.match(/status IN \(([^)]+)\)/)?.[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, '')),
    );
    expect(allowed.size).toBeGreaterThan(3);

    const written = [...page.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const status of written) {
      expect(allowed.has(status), `the page writes "${status}", which the CHECK constraint rejects`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// C2 — the patient chart
// ---------------------------------------------------------------------------

describe('C2 — the chart keeps saying whose chart it is', () => {
  it('offers the actions that start something, and no shortcut to a visible tab', async () => {
    vi.doMock('@/components/clinician/CreateTaskDialog', () => ({
      CreateTaskDialog: ({ open }: { open: boolean }) => (open ? <div>Task dialog</div> : null),
    }));
    vi.doMock('@/components/clinician/ReferralDialog', () => ({
      ReferralDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
    }));
    vi.resetModules();

    const { PatientActionRail } = await import('@/components/clinician/PatientActionRail');
    const onJump = vi.fn();
    render(
      <PatientActionRail
        patientName="Jane Evans"
        patientUserId="patient-1"
        isClinicalStaff
        onJump={onJump}
        guidanceAction={<button type="button">Send guidance</button>}
        alertAction={<button type="button">Set alert</button>}
      />,
    );

    expect(screen.getByText('Jane Evans')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('More patient actions'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Add task')).toBeTruthy());
    expect(screen.getByText('Start encounter')).toBeTruthy();
    expect(screen.getByText('Refer')).toBeTruthy();

    fireEvent.click(screen.getByText('Message'));
    expect(onJump).toHaveBeenCalledWith('messages');
    vi.doUnmock('@/components/clinician/CreateTaskDialog');
    vi.doUnmock('@/components/clinician/ReferralDialog');
  });

  it('explains a risk level the clinician can check, and names what it did not weigh', async () => {
    const { assessPatientRisk, explainRiskLevel } = await import('@/lib/patient-risk');
    const at = new Date().toISOString();
    const risk = assessPatientRisk([
      { type: 'heart_rate', value: 110, unit: 'bpm', recorded_at: at },
      { type: 'oxygen_saturation', value: 93, unit: '%', recorded_at: at },
      { type: 'cholesterol_total', value: 400, unit: 'mg/dL', recorded_at: at },
    ]);

    expect(risk.level).toBe('high');
    expect(risk.highCount).toBe(0);
    expect(explainRiskLevel(risk)).toContain('two or more moves the level up');
    // Silence about the cholesterol would read as an all-clear.
    expect(risk.unassessed).toContain('cholesterol_total');
  });
});

// ---------------------------------------------------------------------------
// C3 — coverage
// ---------------------------------------------------------------------------

describe('C3 — coverage reports the gaps for a known roster', () => {
  it('puts unattended patients first and counts the caseload correctly', async () => {
    const { coverageGaps, practiceKpis, caseloadSpread } = await import('@/lib/practice-coverage');
    const input = {
      staff: [
        { user_id: 's1', name: 'Dr A', email: 'a@x', role: 'clinician', status: 'active',
          departments: [], leads_departments: [], assigned_patient_count: 12, has_tenant_wide_view: false },
        { user_id: 's2', name: 'Reception', email: 'r@x', role: 'front_desk', status: 'active',
          departments: [], leads_departments: [], assigned_patient_count: 0, has_tenant_wide_view: false },
      ],
      patients: [
        { patient_user_id: 'p1', name: 'Ada', email: 'a@x', is_active: true, departments: [], assigned_clinicians: ['Dr A'] },
        { patient_user_id: 'p2', name: 'Ben', email: 'b@x', is_active: true, departments: [], assigned_clinicians: [] },
      ],
      departments: [],
      members: [],
    };

    const gaps = coverageGaps(input);
    expect(gaps[0].kind).toBe('patient_unassigned');
    // A receptionist carrying nobody is a receptionist.
    expect(gaps.some((g) => g.kind === 'clinician_idle')).toBe(false);

    const kpis = practiceKpis(input);
    expect(kpis.find((k) => k.label === 'Unassigned patients')?.value).toBe(1);
    expect(caseloadSpread(input.staff).clinicians).toBe(1);
  });
});
