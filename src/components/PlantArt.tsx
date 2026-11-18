/**
 * Decorative illustrations for dashboard boxes, drawn in code (no stock photos):
 * - plant: a steel mill at dawn with a melt shop, stacks, rooftop solar and a wind turbine
 * - skyline: Kuala Lumpur skyline (twin towers, tower) over green hills, for target banners
 * - hero: both together, for empty states
 * Soft light tones so they sit inside white cards. Purely decorative (aria-hidden).
 */
import { useId } from 'react'

function Mill({ x, y, s = 1, id }: { x: number; y: number; s?: number; id: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    {/* melt shop hall */}
    <path d="M0 0 L0 -70 L60 -95 L150 -95 L150 0 Z" fill={`url(#${id}-bldg)`} />
    <path d="M0 -70 L60 -95 L150 -95 L150 -86 L62 -86 L4 -62 Z" fill="#94b3cf" />
    {Array.from({ length: 6 }, (_, i) => <rect key={i} x={70 + i * 13} y={-74} width="7" height="20" rx="1" fill="#fde68a" opacity=".9" />)}
    <rect x="18" y="-34" width="34" height="34" fill="#5b7a99" />
    {/* glowing furnace door */}
    <rect x="24" y="-26" width="22" height="26" fill={`url(#${id}-glow)`} />
    {/* rolling mill */}
    <path d="M150 0 L150 -55 L290 -55 L290 0 Z" fill={`url(#${id}-bldg2)`} />
    <path d="M150 -55 L220 -72 L290 -55 Z" fill="#a9c4dc" />
    {/* rooftop solar */}
    {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${158 + i * 18} -58 l14 -4 l3 6 l-14 4 Z`} fill="#2563eb" opacity=".75" />)}
    {/* stacks with soft steam */}
    {[[110, 160], [128, 140]].map(([sx, h]) => <g key={sx}>
      <rect x={sx} y={-95 - h} width="9" height={h} fill="#7d98b3" />
      <rect x={sx} y={-95 - h} width="9" height="5" fill="#e11d48" opacity=".7" />
    </g>)}
    <g fill="#ffffff" opacity=".85">
      <ellipse cx="116" cy="-262" rx="16" ry="9" /><ellipse cx="134" cy="-276" rx="20" ry="11" /><ellipse cx="158" cy="-290" rx="24" ry="12" />
    </g>
    {/* silos and tank */}
    <rect x="300" y="-46" width="20" height="46" rx="4" fill="#b7cbe0" /><rect x="324" y="-38" width="20" height="38" rx="4" fill="#a3bad3" />
    {/* conveyor */}
    <path d="M-60 -10 L0 -48" stroke="#7d98b3" strokeWidth="5" />
  </g>
}

function Turbine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-2 0 L-1 -120 L1 -120 L2 0 Z" fill="#e2e8f0" />
    <g transform="translate(0 -120)">
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite" />
        {[0, 120, 240].map((a) => <path key={a} d="M0 0 C 4 -14 3 -44 0 -58 C -3 -44 -4 -14 0 0 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".6" transform={`rotate(${a})`} />)}
      </g>
      <circle r="3" fill="#cbd5e1" />
    </g>
  </g>
}

function Skyline({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  // Generic silhouettes: twin towers with skybridge, a telecom tower, mid-rise blocks.
  const tower = (tx: number) => <g transform={`translate(${tx} 0)`}>
    <path d="M0 0 L0 -150 L4 -158 L4 -170 L8 -176 L8 -190 L11 -196 L11 -230 L12 -232 L13 -230 L13 -196 L16 -190 L16 -176 L20 -170 L20 -158 L24 -150 L24 0 Z" fill="#7c93ad" />
    {Array.from({ length: 14 }, (_, i) => <rect key={i} x="3" y={-140 + i * 10} width="18" height="1.5" fill="#a9bdd2" />)}
  </g>
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[[-120, 60, 26], [-90, 85, 22], [-64, 48, 30], [70, 70, 24], [96, 52, 30], [128, 90, 22], [152, 40, 34]].map(([bx, h, w], i) => <rect key={i} x={bx} y={-h} width={w} height={h} fill={i % 2 ? '#a7bbd1' : '#98aec7'} />)}
    {tower(-30)}{tower(14)}
    <rect x="-6" y="-104" width="20" height="3" fill="#7c93ad" />
    <g transform="translate(-160 0)">
      <rect x="-3" y="-140" width="6" height="140" fill="#8aa1ba" />
      <ellipse cx="0" cy="-136" rx="12" ry="7" fill="#8aa1ba" />
      <rect x="-1" y="-175" width="2" height="36" fill="#8aa1ba" />
    </g>
  </g>
}

export default function PlantArt({ variant, className = 'ms-art' }: { variant: 'plant' | 'skyline' | 'hero'; className?: string }) {
  const id = useId().replace(/:/g, '')
  const W = variant === 'skyline' ? 900 : 640, H = variant === 'skyline' ? 160 : 300
  return <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={variant === 'skyline' ? '#ffffff' : '#e0f2fe'} /><stop offset=".7" stopColor="#ecfdf5" /><stop offset="1" stopColor="#d1fae5" /></linearGradient>
      <linearGradient id={`${id}-bldg`} x1="0" x2="1"><stop offset="0" stopColor="#c7d7e8" /><stop offset="1" stopColor="#dbe6f1" /></linearGradient>
      <linearGradient id={`${id}-bldg2`} x1="0" x2="1"><stop offset="0" stopColor="#d5e1ee" /><stop offset="1" stopColor="#e8eff7" /></linearGradient>
      <linearGradient id={`${id}-glow`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fdba74" /><stop offset="1" stopColor="#f97316" /></linearGradient>
      <linearGradient id={`${id}-hill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#86efac" /><stop offset="1" stopColor="#34d399" /></linearGradient>
    </defs>
    {variant !== 'skyline' && <rect width={W} height={H} fill={`url(#${id}-sky)`} />}
    {variant !== 'skyline' && <circle cx={W * 0.82} cy={H * 0.26} r="34" fill="#fef3c7" />}
    {variant === 'skyline' && <>
      <Skyline x={W * 0.62} y={H - 34} s={0.62} />
      <path d={`M0 ${H} L0 ${H - 40} C ${W * 0.2} ${H - 70} ${W * 0.35} ${H - 30} ${W * 0.55} ${H - 50} S ${W * 0.85} ${H - 30} ${W} ${H - 60} L${W} ${H} Z`} fill={`url(#${id}-hill)`} opacity=".55" />
      <path d={`M0 ${H} L0 ${H - 18} C ${W * 0.25} ${H - 36} ${W * 0.5} ${H - 10} ${W * 0.75} ${H - 26} S ${W * 0.95} ${H - 16} ${W} ${H - 22} L${W} ${H} Z`} fill="#10b981" opacity=".45" />
      {Array.from({ length: 9 }, (_, i) => <g key={i} transform={`translate(${W * (0.4 + i * 0.07)} ${H - 22 - (i % 3) * 4})`}><rect x="-1.5" y="0" width="3" height="10" fill="#065f46" opacity=".5" /><circle r={7 + (i % 2) * 3} fill="#059669" opacity=".55" /></g>)}
    </>}
    {variant !== 'skyline' && <>
      {variant === 'hero' && <Skyline x={W * 0.86} y={H - 46} s={0.5} />}
      <path d={`M0 ${H - 40} C ${W * 0.3} ${H - 70} ${W * 0.6} ${H - 30} ${W} ${H - 56} L${W} ${H} L0 ${H} Z`} fill={`url(#${id}-hill)`} opacity=".35" />
      <Mill x={W * 0.2} y={H - 40} s={variant === 'hero' ? 0.95 : 1.05} id={id} />
      <Turbine x={W * 0.06} y={H - 40} s={0.8} />
      <Turbine x={W * 0.13} y={H - 44} s={0.6} />
      <rect x="0" y={H - 40} width={W} height="40" fill="#e2e8f0" />
      <rect x="0" y={H - 40} width={W} height="4" fill="#cbd5e1" />
      {Array.from({ length: 6 }, (_, i) => <g key={i} transform={`translate(${W * (0.68 + i * 0.05)} ${H - 40})`}><rect x="-1.5" y="-10" width="3" height="10" fill="#065f46" opacity=".6" /><circle cy="-16" r={8 + (i % 2) * 2} fill="#10b981" opacity=".7" /></g>)}
    </>}
  </svg>
}
