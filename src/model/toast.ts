/** Short corner messages after actions; shown by components/Polish.tsx. */
export const TOAST_EVENT = 'chitocapture:toast'
export type Toast = { id: number; text: string; tone?: 'ok' | 'info' | 'warn' }
let nextId = 1
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: { id: nextId++, text, tone } }))
}
