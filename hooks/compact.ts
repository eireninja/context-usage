// The context limit the band's picker sets, the two things that happen on the way to it (a warning
// toast, then a compaction prompt built from the session), and the prompt's builder.
import type { EngineInterface, SessionMessage } from 'claude-code'

// What the band's limit picker offers; DEFAULT_LIMIT is the one in force until a pick is saved
export const LIMIT_CHOICES = [200_000, 300_000, 400_000, 500_000, 600_000, 800_000, 1_000_000] as const
export const DEFAULT_LIMIT = 400_000
// The warning comes this many tokens before the limit: 350K at the default
export const WARN_MARGIN = 50_000
// $.store: one limit for every session, kept between sessions
const LIMIT_KEY = 'contextLimit'
const AUTO_KEY = 'autoCompact'

export const WARN_TOAST = 'Approaching context limit. Prepare for compaction.'

export const limitLabel = (tokens: number) => (tokens >= 1_000_000 ? `${tokens / 1_000_000}M` : `${Math.round(tokens / 1000)}K`)

// The limit as this session last read it; the band draws from it
let limit: number = DEFAULT_LIMIT
export const contextLimit = () => limit
// COMPACT on (the default): at the limit the compaction prompt is put in the prompt box. Off: nothing happens there.
let autoCompact = true
export const isAutoCompact = () => autoCompact

// The picked limit, never more than the model's own window
export const effectiveLimit = (window: number) => Math.min(limit, window)

export async function loadContextLimit($: EngineInterface): Promise<number> {
  try {
    const saved = await $.store.get(LIMIT_KEY)
    limit = typeof saved === 'number' && Number.isInteger(saved) && saved > 0 ? saved : DEFAULT_LIMIT
    autoCompact = (await $.store.get(AUTO_KEY)) !== false
  } catch {
    // an unreadable store leaves the limit as it was
  }
  return limit
}

export async function setContextLimit($: EngineInterface, tokens: number): Promise<void> {
  limit = tokens
  $.ui.invalidate('ui.render')
  await $.store.set(LIMIT_KEY, tokens)
  $.ui.toast(`Context limit ${limitLabel(tokens)}: a warning at ${limitLabel(Math.max(0, tokens - WARN_MARGIN))}, a compaction prompt at ${limitLabel(tokens)}.`)
}

export async function toggleAutoCompact($: EngineInterface): Promise<void> {
  autoCompact = !autoCompact
  $.ui.invalidate('ui.render')
  await $.store.set(AUTO_KEY, autoCompact)
  $.ui.toast(
    autoCompact
      ? `Compact on: at ${limitLabel(limit)} a compaction prompt built from the session is put in the prompt box for you to send.`
      : `Compact off: nothing happens at ${limitLabel(limit)}. The warning toast still shows.`,
  )
}

export type Crossing = 'warn' | 'compact'

// Each step fires once on the way up. A new limit, or the context falling back under the warning
// level (a compaction ran), arms both again.
export class Thresholds {
  private forLimit = 0
  private hasWarned = false
  private hasPrompted = false

  crossings(tokens: number, atLimit: number): Crossing[] {
    if (atLimit !== this.forLimit) {
      this.forLimit = atLimit
      this.hasWarned = false
      this.hasPrompted = false
    }
    if (tokens < Math.max(0, atLimit - WARN_MARGIN)) {
      this.hasWarned = false
      this.hasPrompted = false
      return []
    }
    if (tokens >= atLimit) {
      if (this.hasPrompted) return []
      this.hasPrompted = true
      this.hasWarned = true
      return ['compact']
    }
    if (this.hasWarned) return []
    this.hasWarned = true
    return ['warn']
  }

  // The compaction step could not be handed over yet: offer it again at the next reading
  retry(): void {
    this.hasPrompted = false
  }
}

const WRITES = /^(?:Edit|Write|MultiEdit|NotebookEdit)$/
const READS = /^Read$/
const MAX_CHANGED = 10
const MAX_READ = 6
// A reply this long says where the work stands; a shorter one is a note made in passing
const MIN_REPLY_WORDS = 30
// The first request and this many of the latest: the task in hand is usually in the recent ones
const MAX_RECENT = 4
const MIN_REQUEST_WORDS = 3

// Scratch, generated and binary files are never the work itself
const THROWAWAY = /(?:^|\/)(?:tmp|temp|scratchpad|node_modules|\.cache|bundled-skills)\/|\.d\.ts$|\.(?:png|jpe?g|gif|pdf|log)$/i

// What the engine, hooks and tools put in a user row that the person did not write, body and all
const MACHINE_BLOCKS = /<(system-reminder|local-command-stdout|local-command-caveat|task-notification|command-name|command-message|command-args|agent-message)\b[^>]*>[\s\S]*?<\/\1[^>]*>/g
// A row that is machine-written from its first words
const MACHINE_ROW = /^\s*(?:\[SYSTEM NOTIFICATION|Another Claude session sent a message|Base directory for this skill:|The user hasn't heard from you|This session is being continued|Caveat:|\[Request interrupted)/

const flat = (text: string) => text.replace(/<\/?[a-z_-]+\b[^>]*>/gi, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

// Cut at the end of a sentence where one falls in the second half, else at a word
function clipped(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  return stop > max / 2 ? head.slice(0, stop + 1) : `${head.slice(0, head.lastIndexOf(' '))} [...]`
}

// The person's own request in a user row, or '' when the row holds none: a slash command with nothing
// typed after it, a command's output, a reminder, a tool result
function requestOf(row: SessionMessage): string {
  if (row.role !== 'user' || MACHINE_ROW.test(row.text)) return ''
  const own = flat(row.text.replace(MACHINE_BLOCKS, ' '))
  if (wordCount(own) >= MIN_REQUEST_WORDS) return own
  // "/skill-name do this and that": the words typed after a command are the request; /compact's are a prompt like this one
  const command = /<command-name>\s*\/?([\w:.-]+)\s*<\/command-name>/.exec(row.text)?.[1]
  const args = flat(/<command-args>([\s\S]*?)<\/command-args>/.exec(row.text)?.[1] ?? '')
  return command !== undefined && command !== 'compact' && wordCount(args) >= MIN_REQUEST_WORDS ? args : ''
}

type Touch = { path: string; writes: number; edits: number; reads: number; last: number }

// Every file the session's file tools touched, with what was done to it and when it was last touched
function touches(rows: readonly SessionMessage[]): Touch[] {
  const byPath = new Map<string, Touch>()
  rows.forEach((row, index) => {
    for (const use of row.toolUses) {
      const path = use.input.file_path ?? use.input.notebook_path
      if (typeof path !== 'string' || !path || THROWAWAY.test(path)) continue
      const isWrite = WRITES.test(use.tool)
      if (!isWrite && !READS.test(use.tool)) continue
      const touch = byPath.get(path) ?? { path, writes: 0, edits: 0, reads: 0, last: index }
      if (use.tool === 'Write') touch.writes += 1
      else if (isWrite) touch.edits += 1
      else touch.reads += 1
      touch.last = index
      byPath.set(path, touch)
    }
  })
  return [...byPath.values()].sort((a, b) => b.last - a.last)
}

// What the mod can say of a changed file's state without reading it
function stateOf(touch: Touch): string {
  const parts = [
    touch.writes > 0 && 'written in full',
    touch.edits > 0 && `${touch.edits} edit${touch.edits === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return `${touch.path} (${parts.join(', then ')})`
}

// A reply's prose without its page furniture: a heading becomes a lead-in, a table's rule and a closing
// sign-off line (a few short words between separators, no sentence) are dropped
function prose(text: string): string {
  const lines = text.split('\n').map(line => line.trim())
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  const last = lines.at(-1) ?? ''
  if (last.length <= 40 && /\s[·|•]\s/.test(last) && !/[.?!:]$/.test(last)) lines.pop()
  return lines
    .filter(line => !/^\|?\s*:?-{3,}/.test(line))
    .map(line => line.replace(/^#{1,6}\s+(.*?)[:.]?$/, '$1:').replace(/^[-*]\s+/, ''))
    .join('\n')
}

// The last reply, start and end: the outcome leads it, and what is open or unverified closes it
function standing(text: string): string {
  const all = flat(prose(text))
  if (all.length <= 900) return all
  const tail = all.slice(-450)
  const from = tail.search(/(?<=[.?!] )\S/)
  return `${clipped(all, 400)} [...] ${from > 0 ? tail.slice(from) : tail.slice(tail.indexOf(' ') + 1)}`
}

// What /compact is told to keep, from the session itself: the person's own requests, the assistant's
// last prose and the files its file tools changed or read. No tool call, tool input or tool result is
// copied in. One line, so it travels as a slash command's argument.
export function compactionPrompt(rows: readonly SessionMessage[]): string {
  const requests = rows.map(requestOf).filter(Boolean)
  const first = requests[0] ?? ''
  const recent = requests.slice(1).slice(-MAX_RECENT)
  const replies = rows.filter(row => row.role === 'assistant' && flat(row.text).length > 0)
  const lastProse = replies.filter(row => wordCount(flat(row.text)) >= MIN_REPLY_WORDS).at(-1) ?? replies.at(-1)

  const files = touches(rows)
  // Files that still matter: those touched in the last third of the session, as older ones belong to
  // work that is finished. All of them when none is that recent.
  const recentOf = (all: Touch[], max: number, from: number) => {
    const still = all.filter(f => f.last >= from)
    return (still.length > 0 ? still : all).slice(0, max)
  }
  const late = Math.floor((rows.length * 2) / 3)
  const changed = recentOf(files.filter(f => f.writes + f.edits > 0), MAX_CHANGED, late)
  const read = recentOf(files.filter(f => f.writes + f.edits === 0), MAX_READ, late)

  return [
    'Keep only what is needed to carry on with the task in hand.',
    first && `The task as first given: "${clipped(first, 400)}"`,
    recent.length > 0 &&
      `The most recent requests, oldest first, the last one being the task in hand: ${recent.map((r, i) => `(${i + 1}) "${clipped(r, 400)}"`).join(' ')}`,
    changed.length > 0 &&
      `Key files changed in this session, latest first; keep each path and say what state it is in now: ${changed.map(stateOf).join('; ')}.`,
    'Keep any other file the session changed through shell commands, with its path and state.',
    read.length > 0 && `Files read for reference that still matter, keep their paths: ${read.map(f => f.path).join(', ')}.`,
    'Keep the decisions made and the reason for each, anything the user asked for or ruled out, what is not done or not verified, and the open next steps.',
    lastProse && `Where the work stood in the last reply: "${standing(lastProse.text)}"`,
    'Leave out tool calls, tool output, command logs, file listings and file contents, and work that is finished or was abandoned.',
  ].filter(Boolean).join(' ')
}
