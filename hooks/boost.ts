// Prompt boosting: a typed prompt is rewritten for the model that will run it, by Haiku, before the
// session reads it. A boost phrase forces it; while the band's BOOST switch is on, every typed
// prompt of AUTO_MIN_WORDS words or more is boosted too. Reads only this mod's own guidance/ folder.
import type { EngineInterface, On, PromptSubmitInput } from 'claude-code'

export const BOOST_MODEL = 'claude-haiku-5-5'
// Auto boost takes every prompt of this many words or more (words, as dictated prompts often have no full stops)
export const AUTO_MIN_WORDS = 40
// What the band's word picker offers; AUTO_MIN_WORDS is the one in force until a pick is saved
export const WORD_CHOICES = [10, 20, 30, 40, 60, 80, 120] as const
// The mod's own rules (core.md) and one reference per target model, under $.plugin.root
const GUIDANCE = 'guidance'
// $.store: one switch for every session, kept between sessions
const STORE_KEY = 'autoBoost'
const WORDS_KEY = 'autoMinWords'
const SHOW_KEY = 'showBoost'

// The ask must open or close the message, so a prompt that only mentions boosting is left alone.
const PHRASE = String.raw`(?:improve|boost|upgrade|strengthen|rewrite)\s+(?:this|that|my|the)(?:\s+\w+)?\s+prompt|boost\s+this|make\s+this\s+a\s+proper\s+prompt`
const LEAD = String.raw`(?:(?:now|please|ok(?:ay)?|so)[\s,]+)?`
const AIMED = String.raw`(?:\s+(?:for|into)\s+[\w.-]+(?:\s+[\w.-]+)?)?`
const AT_START = new RegExp(String.raw`^\s*(?:${LEAD}(?:${PHRASE})\b|boost:)`, 'i')
const AT_END = new RegExp(String.raw`(?:^|[\s.,;:!?-])${LEAD}(?:${PHRASE})${AIMED}[\s.!?]*$`, 'i')

// The target model: one named in the ask wins, else the session's own (FAMILIES below). Sol before Astra: "gpt-6.1" names both.
// Fable 5.1 only when 5.1 is named; a bare "for fable", "for fable 5.2" or claude-fable-5-2 is Fable 5.2.
const TARGETS = [
  { file: 'gpt-6.1-sol.md', name: 'GPT-6.1 Sol', named: /\b(?:for|into)\s+(?:gpt[-\s]?6\.1|(?:gpt[-\s]?6\s+)?sol|6\.1|luna|terra|hermes|gpt[-\s]?5\.6)\b/i },
  { file: 'gpt-6-astra.md', name: 'GPT-6 Astra', named: /\b(?:for|into)\s+(?:astra|gpt(?:[-\s]?6)?|codex|chatgpt)\b/i },
  // A bare "5.1" / "5.2" counts only straight after the boost phrase ("boost this for 5.2"), so "release notes for 5.1" is not a model.
  { file: 'fable-5.1.md', name: 'Claude Fable 5.1', named: /\bfor\s+(?:claude[-\s]?)?(?:fable|mythos)[-\s,]*5[.-]1\b|\b(?:this|prompt)\s+for\s+5\.1(?!\.?\d)/i },
  { file: 'fable-5.2.md', name: 'Claude Fable 5.2', named: /\bfor\s+(?:claude[-\s]?)?(?:fable|mythos)(?:[-\s]?5[.-]2)?\b(?![-\s,]*5[.-]1)|\b(?:this|prompt)\s+for\s+5\.2(?!\.?\d)/i },
  // Sonnet and Haiku count only straight after the boost phrase itself ("boost this for sonnet", "improve this prompt for haiku"),
  // so a prompt that talks about those models ("then do this for sonnet and haiku too") keeps the session's own reference.
  { file: 'sonnet-5.5.md', name: 'Claude Sonnet 5.5', named: new RegExp(String.raw`(?:${PHRASE})\s+(?:for|into)\s+(?:claude[-\s]?)?sonnet\b`, 'i') },
  { file: 'haiku-5.5.md', name: 'Claude Haiku 5.5', named: new RegExp(String.raw`(?:${PHRASE})\s+(?:for|into)\s+(?:claude[-\s]?)?haiku\b`, 'i') },
  { file: 'opus-5.5.md', name: 'Claude Opus 5.5', named: /\bfor\s+opus\b/i },
]
const byFile = (file: string) => TARGETS.find(t => t.file === file)!

// The session's own model, by family: each Claude family has its own reference. First match wins, so 5.1 sits before Fable.
const FAMILIES = [
  { is: /(?:fable|mythos)[-\s]?5[.-]1\b/i, file: 'fable-5.1.md' },
  { is: /fable|mythos/i, file: 'fable-5.2.md' },
  { is: /sonnet/i, file: 'sonnet-5.5.md' },
  { is: /haiku/i, file: 'haiku-5.5.md' },
  { is: /opus/i, file: 'opus-5.5.md' },
]
// A model with no reference of its own gets this one, and the toast and the request both say so
const FALLBACK = 'opus-5.5.md'
// Every reference a boost can ask for; each must be a file in guidance/
export const TARGET_FILES = [...new Set([...TARGETS.map(t => t.file), ...FAMILIES.map(f => f.file), FALLBACK])]

const CONTRACT = `You are the Prompt Booster, run by a Claude Code mod as a separate model call. The user typed the message in <message> into their Claude Code session. It is boosted before the session reads it, either because they asked for that or because auto boost is on. Your reply replaces that message word for word: the session reads your reply as if the user had typed it, and acts on it.

Follow the rules and the reference above, with these additions:
- The target model is named in the request, and the reference above is the one for it.
- You cannot read files or ask questions. Resolve every slot from the message and the conversation, and state assumptions inside the prompt.
- Keep every fact, name, path and constraint the user gave. Add no task, tool, file or check that the message and the conversation do not support.
- Leave out the boost request itself when there is one ("now improve this prompt", "boost:", "for opus").
- Default (improve-and-run): reply with the boosted prompt alone. No preamble, banner, fence or commentary.
- When the session should not run the boosted prompt as its own task (the user asked to see it first, asked not to run it, or wants it for another model, agent or harness): reply with one line telling the session what to do with it, for example "Show me this boosted prompt for GPT-6 Astra in a fenced block and do not run it.", then a blank line, then the boosted prompt in a fenced block.
- Write in the language of the message, with the spelling (British or American) that the message and the conversation use.`

const BOOSTED_NOTE = 'This prompt was already boosted by the context-usage mod (prompt booster rules). Do not run the meta-prompt-booster skill on it.'

// With the band's PROMPT switch off the transcript keeps the message as typed, and the model is handed the boost beside it
const hiddenBoost = (boosted: string) =>
  `The prompt booster rewrote the message above. The user sees only what they typed. Act on this boosted version as their prompt; where the two differ in intent, their words win.\n<boosted_prompt>\n${boosted}\n</boosted_prompt>`

const original = (text: string) =>
  `Auto boost rewrote the prompt above. This is the message the user typed. Where the two differ in intent, their words win; do not answer it a second time.\n<original_message>\n${text}\n</original_message>`

// The desktop app sends dictated and pasted messages wrapped in <pasted_content id="..."> tags
const PASTE_TAG = /<\/?pasted_content\b[^>]*>/g
const unwrap = (text: string) => text.replace(PASTE_TAG, '')
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} [...]` : text)

export const isBoostAsk = (text: string) => AT_START.test(unwrap(text)) || AT_END.test(unwrap(text))

// The one rule of auto boost: the prompt's own length, whatever it is a reply to
export const isAutoCandidate = (e: Pick<PromptSubmitInput, 'text'>) =>
  unwrap(e.text).trim().split(/\s+/).filter(Boolean).length >= minWords

export function pickTarget(text: string, sessionModel: string) {
  const lines = unwrap(text).trim().split('\n')
  const ask = `${lines[0]}\n${lines.at(-1)}`
  const named = TARGETS.find(t => t.named.test(ask))
  if (named) return { file: named.file, name: named.name, why: 'named in the ask', label: named.name }
  const family = FAMILIES.find(f => f.is.test(sessionModel))
  if (family) {
    const own = byFile(family.file)
    return { file: own.file, name: own.name, why: `the session model, ${sessionModel}`, label: own.name }
  }
  // No reference for this model: say so, in the request and in the toast, and never pass it off as Opus
  const nearest = byFile(FALLBACK).name
  return {
    file: FALLBACK,
    name: sessionModel,
    why: `the session model; it has no reference of its own, so the ${nearest} reference above is the nearest one`,
    label: `${sessionModel} (no reference of its own: ${nearest} rules used)`,
  }
}

// The switch and the word count as this session last read them; the band draws from both
let autoBoost = false
let minWords: number = AUTO_MIN_WORDS
export const isAutoBoost = () => autoBoost
// Whether a boosted prompt replaces the message in the transcript (shown) or rides along unseen
let showBoost = true
export const isShowBoost = () => showBoost
export const autoMinWords = () => minWords

export async function loadAutoBoost($: EngineInterface): Promise<boolean> {
  try {
    autoBoost = (await $.store.get(STORE_KEY)) === true
    showBoost = (await $.store.get(SHOW_KEY)) !== false
    const words = await $.store.get(WORDS_KEY)
    minWords = typeof words === 'number' && Number.isInteger(words) && words > 0 ? words : AUTO_MIN_WORDS
  } catch {
    // an unreadable store leaves the switch as it was
  }
  return autoBoost
}

export async function toggleAutoBoost($: EngineInterface): Promise<void> {
  autoBoost = !autoBoost
  $.ui.invalidate('ui.render')
  await $.store.set(STORE_KEY, autoBoost)
  $.ui.toast(autoBoost ? `Boost on: every prompt of ${minWords}+ words is boosted by Haiku.` : 'Boost off: prompts are sent as typed.')
}

export async function toggleShowBoost($: EngineInterface): Promise<void> {
  showBoost = !showBoost
  $.ui.invalidate('ui.render')
  await $.store.set(SHOW_KEY, showBoost)
  $.ui.toast(showBoost ? 'Prompt on: a boosted prompt replaces your message in the transcript.' : 'Prompt off: the transcript keeps your message as typed, and Claude still gets the boosted prompt.')
}

// The band's word picker: one count for every session, kept between sessions
export async function setAutoMinWords($: EngineInterface, words: number): Promise<void> {
  minWords = words
  $.ui.invalidate('ui.render')
  await $.store.set(WORDS_KEY, words)
  $.ui.toast(`Boost now takes prompts of ${words}+ words${autoBoost ? '' : ' (it is off: click BOOST to turn it on)'}.`)
}

async function sessionRows($: EngineInterface) {
  const rows = await $.session.messages()
  return Array.isArray(rows) ? rows.filter(m => m.text.trim()) : []
}

export function registerBoost(on: On): void {
  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!isTyped || e.command || e.isMeta) return next(e)

    const isForced = isBoostAsk(e.text)
    if (!isForced) {
      // Another session may have flipped the switch since this one last looked
      const was = `${autoBoost} ${minWords} ${showBoost}`
      await loadAutoBoost($)
      if (`${autoBoost} ${minWords} ${showBoost}` !== was) $.ui.invalidate('ui.render')
      if (!autoBoost || !isAutoCandidate(e)) return next(e)
    }

    const sessionModel = await $.session.model()
    const target = pickTarget(e.text, sessionModel)
    let core: string, reference: string
    try {
      core = await $.fs.read(`${$.plugin.root}/${GUIDANCE}/core.md`)
      reference = await $.fs.read(`${$.plugin.root}/${GUIDANCE}/${target.file}`)
    } catch {
      $.ui.toast(`Boost skipped: the mod's ${GUIDANCE}/ files could not be read. Sent your prompt as typed.`, { timeoutMs: 8000 })
      return next(e)
    }

    try {
      $.ui.status(`Boosting prompt for ${target.name} (Haiku 5.5)...`)
      const tail = (await sessionRows($))
        .slice(-8)
        .map(m => `[${m.role}]\n${clip(m.text, 3000)}`)
        .join('\n\n')
      const r = await $.model.complete({
        model: BOOST_MODEL,
        effort: 'medium',
        maxTokens: 16000,
        timeoutMs: 120_000,
        system: [{ text: core }, { text: reference }, { text: CONTRACT, cache: true }],
        prompt: [
          `Target model: ${target.name} (${target.why}).`,
          `The session that reads your reply runs ${sessionModel}.`,
          tail && `<conversation>\n${tail}\n</conversation>`,
          `<message>\n${e.text}\n</message>`,
        ].filter(Boolean).join('\n\n'),
      })

      if (!r.isAnswered || !r.text.trim()) {
        if (!r.isAnswered && r.reason === 'aborted' && next.signal.aborted) return { drop: 'Boost cancelled.' }
        const why = r.isAnswered ? 'empty reply' : r.reason === 'api-error' ? `API ${r.status ?? ''} ${r.error}` : r.reason
        $.ui.toast(`Boost failed (${why}). Sent your prompt as typed.`, { timeoutMs: 8000 })
        return next(e)
      }

      $.ui.toast(`${isForced ? 'Boosted' : 'Auto boosted'} for ${target.label}.`)
      if (!showBoost) return next({ ...e, context: [...(e.context ?? []), BOOSTED_NOTE, hiddenBoost(r.text.trim())] })
      const context = [...(e.context ?? []), BOOSTED_NOTE, ...(isForced ? [] : [original(e.text)])]
      return next({ ...e, text: r.text.trim(), context })
    } finally {
      $.ui.status(undefined)
    }
  })
}
