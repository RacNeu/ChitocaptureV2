/**
 * Talks to /api/chat, the real-AI mode. Returns null whenever the AI is not available (no key set,
 * running locally without the server function, network down) so the built-in assistant answers.
 */

export type AiMessage = { role: 'user' | 'assistant'; content: string }
export type AiStatus = 'unknown' | 'on' | 'off'

let status: AiStatus = 'unknown'
export const aiStatus = () => status

export async function askAI(messages: AiMessage[], context: unknown): Promise<string | null> {
  if (status === 'off') return null
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, context }) })
    const type = response.headers.get('content-type') ?? ''
    // 501 = no key on the server; 404 or an HTML page = no server function (local dev, static host).
    if (response.status === 501 || response.status === 404 || !type.includes('application/json')) { status = 'off'; return null }
    const data = await response.json() as { text?: string; error?: string }
    if (data.error === 'bad-key') { status = 'off'; return null }
    if (!response.ok || !data.text) return null
    status = 'on'
    return data.text
  } catch {
    return null
  }
}
