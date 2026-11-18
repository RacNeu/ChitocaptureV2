/** Simple monochrome line icons (follow the text colour), used instead of emoji across the app. */
const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M10 20v-6h4v6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  furnace: 'M6 6h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6Zm-1 0h14M6 10h12M6 14h12M10 3c0 1 1 1.5 1 2.5M14 3c0 1 1 1.5 1 2.5',
  plan: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM6 6h12v15H6V6Zm3 6 2 2 4-4m-6 7h6',
  risk: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.01',
  live: 'M3 12h4l2-6 4 12 2-6h6',
  sensor: 'M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4.2 2.7a6 6 0 0 1 0-8.4m8.4 0a6 6 0 0 1 0 8.4M5 18.5a10 10 0 0 1 0-14m14 0a10 10 0 0 1 0 14',
  building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3',
  cube: 'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 0v0M4 7.5l8 4.5 8-4.5M12 12v9',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  fan: 'M12 12c0-4 1-8 4-8s2 5-4 8Zm0 0c4 0 8 1 8 4s-5 2-8-4Zm0 0c0 4-1 8-4 8s-2-5 4-8Zm0 0c-4 0-8-1-8-4s5-2 8 4Z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  snow: 'M12 2v20M4 7l16 10M20 7 4 17M9 4l3 3 3-3M9 20l3-3 3 3',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  battery: 'M3 8h15v8H3V8Zm15 3h3v2h-3M7 8v8',
  wave: 'M2 10c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2',
  line: 'M3 17h18M5 17v-4h4v4M10 17V9h4v8M15 17v-6h4v6',
  wire: 'M4 12a4 4 0 0 1 8 0 4 4 0 0 0 8 0M4 12a4 4 0 0 0 8 0 4 4 0 0 1 8 0',
  flask: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  plug: 'M9 3v5m6-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  lock: 'M6 11h12v10H6V11Zm2 0V8a4 4 0 0 1 8 0v3',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 20h16',
  play: 'M7 4v16l13-8L7 4Z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12.5c-.6-.9-1.7-1.5-3-1.5-1.9 0-3 1-3 2.3 0 3 6 1.7 6 4.7 0 1.3-1.2 2.5-3 2.5-1.4 0-2.6-.6-3.2-1.6M12 5.5v13',
  cloud: 'M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18H7Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4',
}

/** Machine kinds drawn with the same line set (the 3D list, site cards). */
export const kindLine: Record<string, string> = {
  kiln: 'furnace', boiler: 'furnace', furnace: 'furnace', mill: 'gear', fan: 'fan', pump: 'drop', compressor: 'fan', chiller: 'snow',
  'production-line': 'line', genset: 'bolt', wastewater: 'wave', 'cold-room': 'snow', office: 'building', solar: 'sun', battery: 'battery',
}

export default function LineIcon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? ''} /></svg>
}
