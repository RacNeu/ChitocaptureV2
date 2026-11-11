/**
 * Original emblem logos for the demo companies, drawn as SVG.
 * Steel: a mill hall with stacks and a ladle pouring a glowing stream onto an I-beam.
 * Cement: twin silos, a rotary kiln on piers and a preheater tower.
 * Other: a generic factory silhouette.
 */

type Kind = 'steel' | 'cement' | 'factory'

export function logoKindFor(industryId: string | undefined): Kind {
  if (industryId === 'steel' || industryId === 'steel-downstream') return 'steel'
  if (industryId === 'cement') return 'cement'
  return 'factory'
}

const ink = '#e2e8f0'

function Smoke({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return <g className="logo-smoke" style={{ animationDelay: `${delay}s` }}>
    <circle cx={x} cy={y} r="5" fill="#94a3b8" opacity=".55" />
    <circle cx={x + 6} cy={y - 8} r="7" fill="#94a3b8" opacity=".35" />
  </g>
}

export default function CompanyLogo({ kind, size = 180 }: { kind: Kind; size?: number }) {
  const id = `lg-${kind}`
  return <svg className={`company-logo logo-${kind}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="65%">
        <stop offset="0" stopColor={kind === 'steel' ? '#3b1d16' : kind === 'cement' ? '#2a2a24' : '#14302a'} />
        <stop offset="1" stopColor="#0b1220" />
      </radialGradient>
      <linearGradient id={`${id}-hot`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".45" stopColor="#fb923c" /><stop offset="1" stopColor="#e11d48" /></linearGradient>
      <linearGradient id={`${id}-sand`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5e9c8" /><stop offset="1" stopColor="#b8a37a" /></linearGradient>
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <circle cx="100" cy="100" r="94" fill={`url(#${id}-bg)`} />
    <circle cx="100" cy="100" r="94" fill="none" className="logo-ring" />
    <circle cx="100" cy="100" r="84" fill="none" stroke="#ffffff14" strokeWidth="1" />

    {kind === 'steel' && <g>
      {/* Mill hall with a sawtooth roof and two stacks */}
      <path d="M38 128 V92 L62 80 V92 L88 80 V92 L114 80 V128 Z" fill={ink} />
      <rect x="46" y="56" width="10" height="36" fill={ink} /><rect x="44" y="52" width="14" height="6" rx="1" fill={ink} />
      <rect x="66" y="44" width="10" height="40" fill={ink} /><rect x="64" y="40" width="14" height="6" rx="1" fill={ink} />
      <rect x="47" y="64" width="8" height="3" fill="#e11d48" /><rect x="67" y="52" width="8" height="3" fill="#e11d48" />
      <Smoke x={51} y={44} /><Smoke x={71} y={32} delay={1.2} />
      {[44, 58, 72, 86, 100].map((x) => <rect key={x} x={x} y="104" width="7" height="10" fill="#0b1220" opacity=".55" />)}
      {/* Ladle tilted, pouring a glowing stream */}
      <g transform="rotate(-24 140 92)">
        <path d="M122 78 h36 l-5 30 h-26 z" fill={ink} />
        <rect x="119" y="74" width="42" height="6" rx="2" fill={ink} />
        <ellipse cx="140" cy="78" rx="17" ry="3" fill={`url(#${id}-hot)`} filter={`url(#${id}-glow)`} />
      </g>
      <path className="logo-pour" d="M124 92 C 122 104, 126 112, 128 126" stroke={`url(#${id}-hot)`} strokeWidth="5" strokeLinecap="round" fill="none" filter={`url(#${id}-glow)`} />
      {[0, 1, 2, 3, 4].map((k) => <circle key={k} className="logo-spark" cx={128 + (k - 2) * 5} cy="128" r="1.6" fill="#fde68a" style={{ animationDelay: `${k * 0.25}s` }} />)}
      {/* I-beam on the ground */}
      <path d="M30 136 h140 v5 h-62 v10 h62 v5 H30 v-5 h62 v-10 H30 z" fill={ink} />
      <rect x="92" y="141" width="16" height="10" fill={`url(#${id}-hot)`} opacity=".9" />
    </g>}

    {kind === 'cement' && <g>
      {/* Twin silos */}
      <path d="M40 140 V74 a12 7 0 0 1 24 0 V140 Z" fill={`url(#${id}-sand)`} />
      <path d="M66 140 V66 a12 7 0 0 1 24 0 V140 Z" fill={ink} />
      {[86, 100, 114, 128].map((y) => <line key={y} x1="40" x2="90" y1={y} y2={y} stroke="#0b1220" strokeOpacity=".35" strokeWidth="2" />)}
      {/* Preheater tower with stack */}
      <rect x="98" y="58" width="22" height="82" fill={ink} />
      <rect x="102" y="40" width="8" height="20" fill={ink} /><rect x="100" y="36" width="12" height="5" rx="1" fill={ink} />
      <Smoke x={106} y={28} />
      {[68, 82, 96, 110].map((y) => <rect key={y} x="102" y={y} width="14" height="4" fill="#0b1220" opacity=".5" />)}
      {/* Rotary kiln on piers, glowing at the firing end */}
      <g transform="rotate(-8 140 118)">
        <rect x="114" y="110" width="66" height="14" rx="7" fill={ink} />
        <rect x="170" y="110" width="10" height="14" rx="5" fill={`url(#${id}-hot)`} filter={`url(#${id}-glow)`} className="logo-kiln-glow" />
        {[128, 146, 164].map((x) => <rect key={x} x={x} y="108" width="3" height="18" fill="#0b1220" opacity=".35" />)}
      </g>
      {[126, 150, 170].map((x, k) => <rect key={x} x={x} y={124 - k * 3} width="6" height={18 + k * 3} fill={ink} />)}
      <rect x="30" y="140" width="150" height="6" rx="2" fill={ink} />
    </g>}

    {kind === 'factory' && <g>
      <path d="M48 140 V86 h20 V60 h14 v26 l26 -12 v12 l26 -12 v66 Z" fill={ink} />
      <rect x="66" y="52" width="18" height="8" rx="2" fill={ink} />
      <Smoke x={75} y={44} />
      {[[60, 100], [76, 100], [60, 114], [76, 114]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" fill="#0b1220" opacity=".55" />)}
      {[100, 110, 120, 130].map((y) => <rect key={y} x="102" y={y} width="24" height="5" fill="#0b1220" opacity=".55" />)}
      <rect x="34" y="140" width="132" height="6" rx="2" fill={ink} />
      <circle cx="152" cy="64" r="10" fill="#10b981" filter={`url(#${id}-glow)`} />
    </g>}
  </svg>
}
