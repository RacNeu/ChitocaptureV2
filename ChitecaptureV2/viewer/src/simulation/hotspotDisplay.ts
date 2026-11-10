/** Returns the stored activity/source label, falling back when it is blank or corrupted. */
export function getHotspotDisplayName(activityName?: string | null, category?: string | null) {
  const name = activityName?.trim()
  if (name && name.length > 1) return name
  return category?.trim() || 'Unnamed activity'
}
