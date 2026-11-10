export const num = (value: number, digits = 0) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0)

/** Compact tonnes: 1,234 t · 12.3 kt · 1.2 Mt */
export function tonnes(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${num(value / 1_000_000, 2)} Mt`
  if (abs >= 10_000) return `${num(value / 1_000, 1)} kt`
  return `${num(value, abs < 10 ? 1 : 0)} t`
}

export function ringgit(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `RM ${num(value / 1_000_000, 1)}m`
  if (abs >= 10_000) return `RM ${num(value / 1_000, 0)}k`
  return `RM ${num(value)}`
}

export const kindIcon: Record<string, string> = {
  kiln: '🔥', boiler: '♨️', furnace: '🔥', mill: '⚙️', fan: '🌀', pump: '💧', compressor: '🫧', chiller: '❄️',
  'production-line': '🏗️', genset: '⚡', wastewater: '🌊', 'cold-room': '🧊', office: '🏢',
}
