/**
 * Cross-screen navigation: open a machine's live view (the Melt shop for a steel mill, the
 * galvanising line for the wire plant). The target unit is held until that view mounts and reads it.
 */
let pendingUnit: string | null = null
let pendingAt = 0

export function openLiveView(unitId: string) {
  pendingUnit = unitId
  pendingAt = Date.now()
  window.location.hash = 'simulate'
  window.scrollTo({ top: 0 })
}

/** The unit requested in the last few seconds, if any (safe to call more than once while mounting). */
export function takePendingUnit(): string | null {
  return pendingUnit && Date.now() - pendingAt < 3_000 ? pendingUnit : null
}
