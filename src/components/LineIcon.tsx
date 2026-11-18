/** Simple monochrome line icons (follow the text colour), used instead of emoji in the site menu. */
const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M10 20v-6h4v6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  furnace: 'M6 6h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6Zm-1 0h14M6 10h12M6 14h12M10 3c0 1 1 1.5 1 2.5M14 3c0 1 1 1.5 1 2.5',
  plan: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM6 6h12v15H6V6Zm3 6 2 2 4-4m-6 7h6',
  risk: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.01',
  live: 'M3 12h4l2-6 4 12 2-6h6',
  sensor: 'M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4.2 2.7a6 6 0 0 1 0-8.4m8.4 0a6 6 0 0 1 0 8.4M5 18.5a10 10 0 0 1 0-14m14 0a10 10 0 0 1 0 14',
}

export default function LineIcon({ name }: { name: keyof typeof paths | string }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? ''} /></svg>
}
