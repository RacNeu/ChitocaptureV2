/**
 * The certificate tag every headline figure carries: where the number came from (bills, meter, forecast,
 * estimate, live, template). After a bill import the tags stamp onto the new figures once; that is the one
 * choreographed moment in the app (docs/design/craft-2026-11-18/log.md).
 */
let certifiedAt = 0
/** Window in which freshly mounted tags play the stamp: long enough to cover the navigation after an import. */
const STAMP_WINDOW_MS = 1_500

/** Call when bills have just been accepted, right before showing the figures they produce. */
export function markCertified() { certifiedAt = Date.now() }

export default function SourceTag({ source, index = 0 }: { source: string; index?: number }) {
  const stamp = Date.now() - certifiedAt < STAMP_WINDOW_MS
  return <span className={`src-tag${stamp ? ' stamp' : ''}`} style={stamp ? { ['--i' as string]: index } : undefined}>{source}</span>
}
