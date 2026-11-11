import type { ActionStatus, Role } from './types'

export const roles: { id: Role; label: string; icon: string; person: string; blurb: string }[] = [
  { id: 'engineer', label: 'Plant engineer', icon: '👷', person: 'Aiman (Engineer)', blurb: 'Enters machine data, proposes and delivers actions, reports measured savings.' },
  { id: 'sustainability', label: 'Sustainability', icon: '🌿', person: 'Mei Ling (Sustainability)', blurb: 'Sets targets and factors, approves actions and verifies results.' },
  { id: 'management', label: 'Management', icon: '💼', person: 'Encik Rahman (Management)', blurb: 'Reviews progress and cost, approves investment. Read-only otherwise.' },
]
export const roleById = (id: Role) => roles.find((item) => item.id === id)!

export const statusInfo: Record<ActionStatus, { label: string; tone: string }> = {
  proposed: { label: 'Proposed', tone: 'grey' },
  approved: { label: 'Approved', tone: 'blue' },
  'in-progress': { label: 'In progress', tone: 'amber' },
  done: { label: 'Done · awaiting check', tone: 'violet' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}
export const statusOrder: ActionStatus[] = ['proposed', 'approved', 'in-progress', 'done', 'verified', 'rejected']

/** Which status moves each role may make. */
export function nextSteps(status: ActionStatus, role: Role): { to: ActionStatus; label: string }[] {
  const steps: Record<Role, Partial<Record<ActionStatus, { to: ActionStatus; label: string }[]>>> = {
    engineer: {
      approved: [{ to: 'in-progress', label: 'Start work' }],
      'in-progress': [{ to: 'done', label: 'Mark done' }],
      rejected: [{ to: 'proposed', label: 'Re-propose' }],
    },
    sustainability: {
      proposed: [{ to: 'approved', label: 'Approve' }, { to: 'rejected', label: 'Reject' }],
      done: [{ to: 'verified', label: 'Verify saving' }, { to: 'in-progress', label: 'Send back' }],
    },
    management: {
      proposed: [{ to: 'approved', label: 'Approve' }, { to: 'rejected', label: 'Reject' }],
    },
  }
  return steps[role][status] ?? []
}

export const can = {
  editSettings: (role: Role) => role === 'sustainability',
  editMachines: (role: Role) => role !== 'management',
  propose: (role: Role) => role !== 'management',
  removeAction: (role: Role) => role === 'sustainability',
  editAction: (role: Role) => role !== 'management',
}

/** Actions waiting for this role to do something. */
export function waitingFor(role: Role, status: ActionStatus) {
  return nextSteps(status, role).length > 0 && status !== 'rejected'
}
