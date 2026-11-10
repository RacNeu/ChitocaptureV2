export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'

export function formatMalaysiaDateTime(value: string | Date, includeSeconds = false): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23', timeZone: MALAYSIA_TIME_ZONE,
  }).format(new Date(value))
}

export function toMalaysiaDateTimeInput(value?: string): string {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: MALAYSIA_TIME_ZONE,
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export function fromMalaysiaDateTimeInput(value: string): number {
  if (!value) return Number.NaN
  // Malaysia uses UTC+08:00 year-round; datetime-local has no timezone of its own.
  return new Date(`${value}:00+08:00`).getTime()
}
