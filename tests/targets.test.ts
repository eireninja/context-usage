// Which reference a boost carries. The references are the real guidance/ files, read through
// tests/guidance.snapshot.ts (a test cannot read the disk): run tests/snapshot-guidance.py after editing one.
import type { ModelCompleteInput, On, PromptSubmitInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { TARGET_FILES } from '../hooks/boost'
import { GUIDANCE } from './guidance.snapshot'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const file = (path: string) => path.split('/guidance/')[1] ?? path

// One rule only that reference holds, so a boost that carries another model's rules shows up
const OWN = {
  'sonnet-5.5.md': ['# Boosting for Claude Sonnet 5.5', "Don't add features, tests, files, docs or refactors", 'run a real check that exercises the change'],
  'haiku-5.5.md': ['# Boosting for Claude Haiku 5.5', "Don't add new features, docs, or refactors", 'run a real check that exercises the change', 'Your training data ends well before'],
  'opus-5.5.md': ['# Boosting for Claude Opus 5.5', 'Delete every', 'announces the next step'],
  'fable-5.2.md': ['# Boosting for Claude Fable 5.2', 'this codebase is yours', 'ordinary obstacles'],
  'fable-5.1.md': ['# Boosting for Claude Fable 5.1', 'You are operating autonomously'],
} as const
type Reference = keyof typeof OWN
const REFERENCES = Object.keys(OWN) as Reference[]

type World = { model: string; store?: Record<string, unknown> }

// One world per test: `seen.model` is the session's model, and a test may change it between prompts
function world(on: On, { model, store = {} }: World) {
  const seen = { model, reads: [] as string[], calls: [] as ModelCompleteInput[], toasts: [] as string[] }
  mock.store(on, store)
  on('session.model', () => ({ value: seen.model }))
  on('session.messages', () => ({ value: [] }))
  on('fs.read', ($, e) => {
    const text = GUIDANCE[file(e.path)]
    // A reference that is not in guidance/ fails the read, as it would on disk
    if (text === undefined) throw new Error(`no such file: ${e.path}`)
    seen.reads.push(file(e.path))
    return { value: text }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', ($, e) => {
    seen.calls.push(e)
    return { value: { isAnswered: true, text: 'BOOSTED', usage: USAGE } }
  })
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  return seen
}

const typed = (text: string): PromptSubmitInput => ({ text, wait: false, origin: { kind: 'composer' } })
// The system blocks as one text. JSON keeps every character of a rule except a double quote, and no rule in OWN holds one.
const systemOf = (call: ModelCompleteInput) => JSON.stringify(call.system)

// The reference a boost carries holds its own rules and none that belong to another Claude model
function expectOnly(system: string, reference: Reference) {
  for (const rule of OWN[reference]) expect(system).toContain(rule)
  for (const other of REFERENCES.filter(r => r !== reference)) {
    for (const rule of OWN[other]) {
      if ((OWN[reference] as readonly string[]).includes(rule)) continue
      expect(system).not.toContain(rule)
    }
  }
}

test('every reference a boost can ask for is a file in guidance/, and guidance/ holds no other', () => {
  for (const name of TARGET_FILES) expect(typeof GUIDANCE[name]).toBe('string')
  expect(Object.keys(GUIDANCE).sort()).toEqual(['core.md', ...TARGET_FILES].sort())
})

test('a Sonnet 5.5 session is boosted with the Sonnet rules and none of the Opus, Fable or Haiku ones', async ($, on) => {
  const seen = world(on, { model: 'claude-sonnet-5-5' })
  for (const model of ['claude-sonnet-5-5', 'claude-sonnet-5-5[1m]', 'sonnet']) {
    seen.model = model
    await $.prompt.submit(typed('Add a retry to the invoice export. Now improve this prompt'))

    expect(seen.reads.slice(-2)).toEqual(['core.md', 'sonnet-5.5.md'])
    expect(seen.calls.at(-1)!.prompt).toContain(`Target model: Claude Sonnet 5.5 (the session model, ${model})`)
    expectOnly(systemOf(seen.calls.at(-1)!), 'sonnet-5.5.md')
    // Sonnet can refuse a reasoning ask, so its reference carries that rule
    expect(systemOf(seen.calls.at(-1)!)).toContain('reasoning_extraction')
    expect(seen.toasts.at(-1)).toBe('Boosted for Claude Sonnet 5.5.')
  }
  expect(seen.calls.length).toBe(3)
})

test('a Haiku 5.5 session is boosted with the Haiku rules and none of the Opus, Fable or Sonnet ones', async ($, on) => {
  const seen = world(on, { model: 'claude-haiku-5-5' })
  for (const model of ['claude-haiku-5-5', 'haiku']) {
    seen.model = model
    await $.prompt.submit(typed('Find every place we call the old billing API. Now improve this prompt'))

    expect(seen.reads.slice(-2)).toEqual(['core.md', 'haiku-5.5.md'])
    expect(seen.calls.at(-1)!.prompt).toContain(`Target model: Claude Haiku 5.5 (the session model, ${model})`)
    expectOnly(systemOf(seen.calls.at(-1)!), 'haiku-5.5.md')
    // Haiku has no refusal for a reasoning ask, and Sonnet has one: that rule must not leak across
    expect(systemOf(seen.calls.at(-1)!)).not.toContain('reasoning_extraction')
    expect(seen.toasts.at(-1)).toBe('Boosted for Claude Haiku 5.5.')
  }
  expect(seen.calls.length).toBe(2)
})

test('Opus and Fable sessions keep their own rules', async ($, on) => {
  const cases: [string, Reference, string][] = [
    ['claude-opus-5-5', 'opus-5.5.md', 'Claude Opus 5.5'],
    ['claude-opus-5-5[1m]', 'opus-5.5.md', 'Claude Opus 5.5'],
    ['claude-fable-5-2', 'fable-5.2.md', 'Claude Fable 5.2'],
    ['claude-fable-5-1', 'fable-5.1.md', 'Claude Fable 5.1'],
  ]
  const seen = world(on, { model: 'claude-opus-5-5' })
  for (const [model, reference, name] of cases) {
    seen.model = model
    await $.prompt.submit(typed('Sort out the inbox. Now improve this prompt'))

    expect(seen.reads.slice(-2)).toEqual(['core.md', reference])
    expect(seen.calls.at(-1)!.prompt).toContain(`Target model: ${name} (the session model, ${model})`)
    expectOnly(systemOf(seen.calls.at(-1)!), reference)
  }
  expect(seen.calls.length).toBe(cases.length)
})

test('Sonnet or Haiku named straight after the boost phrase picks that reference, whatever the session runs', async ($, on) => {
  const seen = world(on, { model: 'claude-fable-5-2' })
  const loads = async (text: string) => {
    await $.prompt.submit(typed(text))
    return seen.reads.at(-1)
  }
  expect(await loads('boost this for sonnet: write the migration plan')).toBe('sonnet-5.5.md')
  expect(await loads('Draft the brief.\nimprove this prompt for sonnet 5.5')).toBe('sonnet-5.5.md')
  expect(await loads('boost this for claude-sonnet-5-5: tidy the scope')).toBe('sonnet-5.5.md')
  expect(await loads('boost this for haiku: list the call sites')).toBe('haiku-5.5.md')
  expect(await loads('Draft the brief.\nmake this a proper prompt for haiku')).toBe('haiku-5.5.md')
  expect(await loads('Draft the brief.\nupgrade this prompt into claude-haiku-5-5')).toBe('haiku-5.5.md')
  expect(seen.calls.at(-1)!.prompt).toContain('Target model: Claude Haiku 5.5 (named in the ask)')
})

test('a prompt that only talks about Sonnet or Haiku keeps the session model\'s reference', async ($, on) => {
  const about = `Compare the cost for sonnet and haiku runs over the last week. ${'Pull the token counts for each session and group them by day. '.repeat(4)}Then write the summary for haiku workers to read.`
  const seen = world(on, { model: 'claude-fable-5-2', store: { autoBoost: true } })
  const alsoFor = `Rewrite the onboarding notes so a new starter can follow them without help. ${'Keep every step that is there now and put them in the order they are done. '.repeat(3)}Then do this for sonnet and haiku too.`
  await $.prompt.submit(typed(about))
  await $.prompt.submit(typed(alsoFor))
  await $.prompt.submit(typed('Write the cost notes for sonnet.\nboost this'))
  await $.prompt.submit(typed('Draft that prompt for haiku workers.\nimprove this prompt'))

  expect(seen.calls.length).toBe(4)
  expect(seen.reads.filter(name => name !== 'core.md')).toEqual(['fable-5.2.md', 'fable-5.2.md', 'fable-5.2.md', 'fable-5.2.md'])
})

test('a model with no reference of its own gets the Opus rules, and the request and the toast both say so', async ($, on) => {
  const seen = world(on, { model: 'some-other-model-1' })
  await $.prompt.submit(typed('Sort out the inbox. Now improve this prompt'))

  expect(seen.reads).toEqual(['core.md', 'opus-5.5.md'])
  expect(seen.calls[0]!.prompt).toContain('Target model: some-other-model-1 (the session model; it has no reference of its own, so the Claude Opus 5.5 reference above is the nearest one)')
  expect(seen.calls[0]!.prompt).not.toContain('Target model: Claude Opus 5.5')
  expect(seen.toasts.at(-1)).toBe('Boosted for some-other-model-1 (no reference of its own: Claude Opus 5.5 rules used).')
})
