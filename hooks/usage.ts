import type { SessionRateLimit } from 'claude-code'

// One usage window as the band and the alerts read it
export type UsageWindow = { kind: string; label: string; percentUsed: number; resetsAt?: string }

// The endpoint the status bar reads: it carries the per-model weekly window the engine lacks
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const USAGE_TTL_MS = 900_000
// Past this age an endpoint reading is no longer trusted
export const USAGE_EXPIRY_MS = 3_600_000

export type EndpointReading = { fetchedAt: number; windows: UsageWindow[] }

type EndpointWindow = { utilization?: unknown; resets_at?: unknown }
type EndpointLimit = { kind?: unknown; percent?: unknown; resets_at?: unknown; scope?: { model?: { display_name?: unknown } } | null }

const isFuture = (iso: string | undefined, now: number) => iso !== undefined && Date.parse(iso) > now

function fromWindow(kind: string, label: string, raw: EndpointWindow | undefined): UsageWindow | undefined {
  if (!raw || typeof raw.utilization !== 'number') return undefined
  return { kind, label, percentUsed: raw.utilization, resetsAt: typeof raw.resets_at === 'string' ? raw.resets_at : undefined }
}

export function parseEndpoint(text: string, now: number): EndpointReading | undefined {
  let body: { five_hour?: EndpointWindow; seven_day?: EndpointWindow; limits?: EndpointLimit[] }
  try {
    body = JSON.parse(text)
  } catch {
    return undefined
  }
  const windows: UsageWindow[] = []
  const fiveHour = fromWindow('five_hour', '5HR', body.five_hour)
  if (fiveHour) windows.push(fiveHour)
  const scoped = (body.limits ?? []).find(l => typeof l.scope?.model?.display_name === 'string')
  if (scoped && typeof scoped.percent === 'number') {
    const name = String(scoped.scope?.model?.display_name).toUpperCase()
    windows.push({
      kind: `weekly_${name.toLowerCase()}`,
      label: `WK ${name}`,
      percentUsed: scoped.percent,
      resetsAt: typeof scoped.resets_at === 'string' ? scoped.resets_at : undefined,
    })
  }
  const sevenDay = fromWindow('seven_day', 'WK', body.seven_day)
  if (sevenDay) windows.push(sevenDay)
  return windows.length === 0 ? undefined : { fetchedAt: now, windows }
}

const ENGINE_LABELS: Record<string, string> = { five_hour: '5HR', seven_day: 'WK' }

// Endpoint first, engine as fallback; a window whose reset has passed is stale and dropped
export function mergeWindows(
  engine: readonly SessionRateLimit[],
  endpoint: EndpointReading | undefined,
  now: number,
): UsageWindow[] {
  const isFresh = endpoint !== undefined && now - endpoint.fetchedAt < USAGE_EXPIRY_MS
  const fromEndpoint = isFresh ? endpoint.windows.filter(w => isFuture(w.resetsAt, now)) : []
  const have = new Set(fromEndpoint.map(w => w.kind))
  const fromEngine = engine
    .filter(r => !have.has(r.kind) && isFuture(r.resetsAt, now))
    .map(r => ({ kind: r.kind, label: ENGINE_LABELS[r.kind] ?? r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))
  const order = (w: UsageWindow) => (w.kind === 'five_hour' ? 0 : w.kind === 'seven_day' ? 2 : 1)
  return [...fromEndpoint, ...fromEngine].sort((a, b) => order(a) - order(b))
}

// The status bar's grade for every percentage: the higher, the hotter
export function usageColor(percent: number): string {
  if (percent >= 80) return '#f43f5e'
  if (percent >= 60) return '#fb923c'
  if (percent >= 40) return '#fbbf24'
  return '#34d399'
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const pad = (n: number) => String(n).padStart(2, '0')

// Same-day resets read as a time, later ones with the weekday, as the status bar did
export function resetLabel(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const at = new Date(resetsAt)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return at.getTime() - now < 86_400_000 ? time : `${DAYS[at.getDay()]} ${time}`
}

// The latest usage figures, for any tool that wants them: under the user's home, whatever folder the session runs in
export const CAPTURE_FILE = '.claude/usage-limits.json'

const toEpoch = (iso: string | undefined) => (iso === undefined ? null : Math.round(Date.parse(iso) / 1000))

// The wrapper's record shape; undefined when neither window has a reading, so a real capture is never blanked
export function captureRecord(windows: readonly UsageWindow[], capturedAt: string): string | undefined {
  const five = windows.find(w => w.kind === 'five_hour')
  const seven = windows.find(w => w.kind === 'seven_day')
  if (!five && !seven) return undefined
  const record = {
    capturedAt,
    source: 'context-usage',
    rateLimits: {
      five_hour: { used_percentage: five?.percentUsed ?? null, resets_at: toEpoch(five?.resetsAt) },
      seven_day: { used_percentage: seven?.percentUsed ?? null, resets_at: toEpoch(seven?.resetsAt) },
    },
  }
  return JSON.stringify(record, null, 2) + '\n'
}
