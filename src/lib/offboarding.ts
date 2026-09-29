/**
 * What ending a membership leaves behind, in words an administrator reads
 * before confirming.
 *
 * The counts come from offboarding_impact(), which changes nothing. Ending a
 * membership used to be one click with no account of what it left: patients
 * with nobody, notes nobody could sign, appointments booked with someone who
 * was gone. Each line here says what happens to that thing, not only how many
 * there are — "3 unsigned drafts" alone reads like something about to be lost,
 * and nothing is.
 */

export interface OffboardingImpact {
  status: string;
  role: string;
  isOwner: boolean;
  otherActiveOwners: number;
  /** Set when ending would be refused, in the words the refusal will use. */
  blockedReason: string | null;
  openAssignments: number;
  patientsLeftUnassigned: number;
  unsignedDrafts: number;
  unfiledDictations: number;
  openTasks: number;
  futureAppointments: number;
  pendingProposals: number;
  leadDepartments: string[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parseOffboardingImpact(raw: unknown): OffboardingImpact {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    status: String(r.status ?? ''),
    role: String(r.role ?? ''),
    isOwner: r.is_owner === true,
    otherActiveOwners: num(r.other_active_owners),
    blockedReason: typeof r.blocked_reason === 'string' && r.blocked_reason ? r.blocked_reason : null,
    openAssignments: num(r.open_assignments),
    patientsLeftUnassigned: num(r.patients_left_unassigned),
    unsignedDrafts: num(r.unsigned_drafts),
    unfiledDictations: num(r.unfiled_dictations),
    openTasks: num(r.open_tasks),
    futureAppointments: num(r.future_appointments),
    pendingProposals: num(r.pending_proposals),
    leadDepartments: Array.isArray(r.lead_departments) ? r.lead_departments.map(String) : [],
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One sentence per thing that will change, in the order an administrator
 * cares about: people first, then clinical work, then the diary.
 *
 * `self` words it for someone reading about their own leaving.
 */
export function describeOffboardingImpact(impact: OffboardingImpact, self = false): string[] {
  const they = self ? 'you' : 'they';
  const lines: string[] = [];

  if (impact.openAssignments > 0) {
    const nobody =
      impact.patientsLeftUnassigned > 0
        ? ` ${plural(impact.patientsLeftUnassigned, 'patient', 'patients')} will then have nobody assigned and will appear under Coverage as needing cover.`
        : ' Each of those patients has someone else assigned as well.';
    lines.push(
      `${plural(impact.openAssignments, 'patient assignment', 'patient assignments')} will end.${nobody}`,
    );
  }
  if (impact.unsignedDrafts > 0) {
    lines.push(
      `${plural(impact.unsignedDrafts, 'unsigned note', 'unsigned notes')} will be frozen as "unsigned — author departed" and sent to the practice's leads, who can sign ${impact.unsignedDrafts === 1 ? 'it' : 'them'} off, mark ${impact.unsignedDrafts === 1 ? 'it' : 'them'} entered in error, or archive ${impact.unsignedDrafts === 1 ? 'it' : 'them'}. Nothing is deleted.`,
    );
  }
  if (impact.unfiledDictations > 0) {
    lines.push(
      `${plural(impact.unfiledDictations, 'unfiled dictation', 'unfiled dictations')} will be frozen the same way and sent to the leads.`,
    );
  }
  if (impact.openTasks > 0) {
    lines.push(
      `${plural(impact.openTasks, 'open task', 'open tasks')} assigned to ${self ? 'you' : 'them'} will be listed under Coverage for reassignment.`,
    );
  }
  if (impact.futureAppointments > 0) {
    lines.push(
      `${plural(impact.futureAppointments, 'future appointment', 'future appointments')} booked with ${self ? 'you' : 'them'} will stay booked and be listed under Coverage for reassignment.`,
    );
  }
  if (impact.pendingProposals > 0) {
    lines.push(
      `${plural(impact.pendingProposals, 'medication proposal', 'medication proposals')} still waiting for a patient will be listed under Coverage, where an administrator can withdraw ${impact.pendingProposals === 1 ? 'it' : 'them'}.`,
    );
  }
  if (impact.leadDepartments.length > 0) {
    lines.push(
      `${self ? 'You lead' : 'They lead'} ${impact.leadDepartments.join(', ')}. ${impact.leadDepartments.length === 1 ? 'That department' : 'Those departments'} will have no lead until someone is appointed.`,
    );
  }
  if (impact.isOwner && !impact.blockedReason) {
    lines.push(`${self ? 'You are' : 'They are'} an owner; the practice keeps ${plural(impact.otherActiveOwners, 'other owner', 'other owners')}.`);
  }
  lines.push(
    `${self ? 'You' : 'They'} will lose access to this practice's patients and records at once, including what ${they} wrote here. The practice keeps all of it, attributed to ${self ? 'you' : 'them'}. ${self ? 'Your' : 'Their'} own private patients are not affected.`,
  );
  return lines;
}
