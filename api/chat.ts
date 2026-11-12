import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * POST /api/chat — the real-AI mode of the ChitoCapture assistant (a Vercel serverless function).
 * The API key stays on the server: set ANTHROPIC_API_KEY in Vercel → Project → Settings →
 * Environment Variables, then redeploy. Without a key this returns 501 and the app quietly keeps
 * using its built-in assistant.
 */

const MODEL = 'claude-opus-5-5'
const MAX_MESSAGES = 20
const MAX_CHARS = 4_000

const SYSTEM = `You are the ChitoCapture assistant inside a carbon-management app used by Malaysian factories.
You help plant engineers, sustainability teams and managers decide which processes or equipment to change to cut CO2 and cost.

Rules:
- Base every number on the SITE DATA JSON you are given. Do not invent plant figures. If something is not in the data, say so and say what would be needed.
- Prefer options that keep production running (efficiency, heat recovery, renewable power, capture) over shutting equipment. If asked about shutting something, give the CO2 removed and explain the production trade-off.
- When asked to hit a money or CO2 goal, pick options from the data, cheapest per tonne or best saving first, and total them up.
- Currency is Malaysian ringgit (RM). Use tonnes CO2 per year. Round sensibly.
- Malaysia's carbon tax rate is not confirmed; if you use a carbon price, say it is an assumption.
- The sample companies are illustrative; remind the user once if they ask whether figures are real.
- Answer in plain text, short: at most about 8 lines, using "•" bullets for lists. No markdown headings or tables.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function clean(body: unknown): { messages: ChatMessage[]; context: unknown } | null {
  if (!body || typeof body !== 'object') return null
  const { messages, context } = body as { messages?: unknown; context?: unknown }
  if (!Array.isArray(messages) || messages.length === 0) return null
  const tidy = messages.slice(-MAX_MESSAGES).flatMap((item): ChatMessage[] => {
    if (!item || typeof item !== 'object') return []
    const { role, content } = item as { role?: unknown; content?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return []
    return [{ role, content: content.slice(0, MAX_CHARS) }]
  })
  // The conversation must start with the user.
  while (tidy.length && tidy[0].role !== 'user') tidy.shift()
  return tidy.length && tidy[tidy.length - 1].role === 'user' ? { messages: tidy, context } : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(501).json({ error: 'no-key' }); return }
  const input = clean(req.body)
  if (!input) { res.status(400).json({ error: 'bad-request' }); return }

  const client = new Anthropic()
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      // If the model declines, the API retries on a suitable fallback model in the same call.
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `SITE DATA (JSON):\n${JSON.stringify(input.context).slice(0, 30_000)}` },
      ],
      messages: input.messages,
    })
    if (response.stop_reason === 'refusal') { res.status(200).json({ text: 'Sorry, I can’t help with that one. Try asking about your site’s emissions, costs or upgrade options.' }); return }
    const text = response.content.flatMap((block) => block.type === 'text' ? [block.text] : []).join('\n').trim()
    res.status(200).json({ text: text || 'I didn’t get an answer that time. Please try again.', model: response.model })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) { res.status(502).json({ error: 'bad-key' }); return }
    if (error instanceof Anthropic.RateLimitError) { res.status(429).json({ error: 'rate-limited' }); return }
    if (error instanceof Anthropic.APIError) { res.status(502).json({ error: `api-${error.status}` }); return }
    res.status(500).json({ error: 'server' })
  }
}
