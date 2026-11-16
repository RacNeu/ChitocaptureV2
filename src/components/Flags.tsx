/**
 * Small inline SVG flags. Flag emojis (🇲🇾, 🇪🇺) show as plain letters on Windows,
 * so headings use these instead.
 */

/** Malaysia (Jalur Gemilang): 14 red and white stripes, a blue canton with a yellow crescent and 14-point star. */
export function FlagMY({ size = 18 }: { size?: number }) {
  const w = 28, h = 14
  const star = Array.from({ length: 28 }, (_, k) => {
    const angle = -Math.PI / 2 + k * Math.PI / 14
    const r = k % 2 === 0 ? 2.3 : 1.0
    return `${(10.2 + r * Math.cos(angle)).toFixed(2)},${(3.5 + r * Math.sin(angle)).toFixed(2)}`
  }).join(' ')
  return <svg className="flag" width={size * 2} height={size} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Malaysia">
    {Array.from({ length: 14 }, (_, k) => <rect key={k} x="0" y={k} width={w} height="1" fill={k % 2 === 0 ? '#CC0001' : '#FFFFFF'} />)}
    <rect x="0" y="0" width="14" height="8" fill="#010066" />
    <circle cx="5.6" cy="4" r="3" fill="#FFCC00" />
    <circle cx="6.5" cy="4" r="2.55" fill="#010066" />
    <polygon points={star} fill="#FFCC00" transform="translate(0 0.5)" />
  </svg>
}

/** European Union: a circle of 12 gold stars on blue. */
export function FlagEU({ size = 18 }: { size?: number }) {
  const stars = Array.from({ length: 12 }, (_, k) => {
    const a = k * Math.PI / 6
    return [15 + 6 * Math.cos(a), 10 + 6 * Math.sin(a)]
  })
  const star = (cx: number, cy: number) => Array.from({ length: 10 }, (_, k) => {
    const angle = -Math.PI / 2 + k * Math.PI / 5
    const r = k % 2 === 0 ? 1.1 : 0.45
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`
  }).join(' ')
  return <svg className="flag" width={size * 1.5} height={size} viewBox="0 0 30 20" role="img" aria-label="European Union">
    <rect width="30" height="20" fill="#003399" />
    {stars.map(([x, y], k) => <polygon key={k} points={star(x, y)} fill="#FFCC00" />)}
  </svg>
}
