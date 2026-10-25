// Free-tier Gemini models differ a lot in speed and quota; try a chain of fast models
// and move on when one is rate-limited, overloaded, slow, or returns unusable output.
export const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

export function geminiModels(env: string | undefined): string[] {
  const list = (env ?? '').split(',').map((m) => m.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_GEMINI_MODELS
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof SyntaxError) return true
  const e = err as { status?: number; name?: string } | null
  if (e?.name === 'AbortError') return true
  const status = e?.status
  return status === 429 || (typeof status === 'number' && status >= 500)
}

// Thrown when every model in the chain failed with a retryable error.
export class FallbackError extends Error {
  status?: number
  attempts: unknown[]
  allQuota: boolean
  constructor(attempts: unknown[]) {
    const last = attempts[attempts.length - 1] as { status?: number; name?: string; message?: string } | undefined
    super(last?.message ?? 'All Gemini models failed')
    this.name = last?.name ?? 'FallbackError'
    this.status = last?.status
    this.attempts = attempts
    this.allQuota = attempts.length > 0 && attempts.every((a) => (a as { status?: number } | null)?.status === 429)
  }
}

export async function withModelFallback<T>(
  models: string[],
  attemptTimeoutMs: number,
  call: (model: string, signal: AbortSignal) => Promise<T>,
): Promise<{ value: T; model: string }> {
  const errors: unknown[] = []
  for (const model of models) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs)
    try {
      return { value: await call(model, controller.signal), model }
    } catch (err) {
      if (!isRetryable(err)) throw err
      errors.push(err)
    } finally {
      clearTimeout(timer)
    }
  }
  throw new FallbackError(errors)
}
