/**
 * The ChitoCapture mark: a white leaf with a green vein on an emerald tile.
 */
export default function BrandLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <svg className={`brand-logo ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ChitoCapture">
    <defs>
      <linearGradient id="bl-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#047857" /></linearGradient>
      <linearGradient id="bl-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d1fae5" /></linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#bl-tile)" />
    <path d="M14 48 C12 28 26 14 50 14 C51 36 38 50 18 50 Z" fill="url(#bl-leaf)" />
    <path d="M17 47 C26 38 34 30 45 20" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" fill="none" />
  </svg>
}
