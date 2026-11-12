import type { SessionContextUsage } from 'claude-code'

import type { UsageWindow } from './usage'

// A usage window at or past this share gets one warning per reset
export const LIMIT_WARN_PERCENT = 90

export type Reading = { context: SessionContextUsage; windows: readonly UsageWindow[] }

export type Alert = { note: string; toast: string }

export const kTokens = (n: number) => `${Math.round(n / 1000)}K`

export function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours >= 24
    ? ` (resets in ${Math.floor(hours / 24)}d ${hours % 24}h)`
    : ` (resets in ${hours}h ${minutes % 60}m)`
}

// The point the context bar fills towards: autoCompactWindow when it is set below the model's window
export function limitOf(context: SessionContextUsage, autoCompactWindow: number | undefined): number {
  return autoCompactWindow !== undefined && autoCompactWindow > 0 && autoCompactWindow < context.window
    ? autoCompactWindow
    : context.window
}

export function report(r: Reading, autoCompactWindow: number | undefined, now: number): string {
  const lines: string[] = []
  const { tokens, window, percent } = r.context
  const limit = limitOf(r.context, autoCompactWindow)
  const compacts = limit < window ? ` · auto-compacts at ${kTokens(limit)}` : ''
  lines.push(
    tokens === undefined
      ? 'Context: no reading yet'
      : `Context: ${kTokens(tokens)} of ${kTokens(window)} (${percent ?? '?'}%)${compacts}`,
  )
  if (r.windows.length === 0) lines.push('Usage windows: no reading yet')
  for (const w of r.windows) lines.push(`${w.label}: ${w.percentUsed}%${untilReset(w.resetsAt, now)}`)
  return lines.join('\n')
}

// Remembers which usage windows have been warned about, so each warning fires once per reset
export class Watch {
  private readonly warnedWindows = new Set<string>()

  alerts(r: Reading, now: number): Alert[] {
    const out: Alert[] = []
    for (const w of r.windows) {
      const key = `${w.kind}@${w.resetsAt ?? ''}`
      if (w.percentUsed < LIMIT_WARN_PERCENT || this.warnedWindows.has(key)) continue
      this.warnedWindows.add(key)
      out.push({
        note:
          `context-usage: the ${w.label} usage window is at ${w.percentUsed}%${untilReset(w.resetsAt, now)}. ` +
          'Do not launch subagents that may not finish before it runs out.',
        toast: `${w.label} usage at ${w.percentUsed}%`,
      })
    }
    return out
  }
}
