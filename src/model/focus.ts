/**
 * Cross-screen navigation: open a machine's live unit in the control room.
 * The target unit is held here until the control room mounts and reads it.
 */
let pendingUnit: string | null = null
let pendingAt = 0

export function openInControlRoom(unitId: string) {
  pendingUnit = unitId
  pendingAt = Date.now()
  window.location.hash = 'control'
  window.scrollTo({ top: 0 })
}

/** The unit requested in the last few seconds, if any (safe to call more than once while mounting). */
export function takePendingUnit(): string | null {
  return pendingUnit && Date.now() - pendingAt < 3_000 ? pendingUnit : null
}
