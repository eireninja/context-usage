import type { ModelCompleteInput, ModelCompleteResult, On, PromptSubmitInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { AUTO_MIN_WORDS, isAutoCandidate } from '../hooks/boost'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const answer = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: USAGE })

// The mod reads its own guidance/ folder; keep only the file name of each read.
const file = (path?: string) => path?.split('/guidance/')[1]

// A long prompt with no boost phrase in it
const BRIEF = `Go through the invoices folder and work out which clients have not paid for October. ${'Check each one against the bank export and list the gaps with amounts. '.repeat(4)}Then draft a reminder for each.`

type World = { model?: string; store?: Record<string, unknown>; boost?: ModelCompleteResult }

function world(on: On, { model = 'claude-opus-5-5', store = {}, boost = answer('  BOOSTED PROMPT  ') }: World = {}) {
  const seen = { reads: [] as string[], calls: [] as ModelCompleteInput[], submitted: [] as PromptSubmitInput[], toasts: [] as string[] }
  mock.store(on, store)
  on('session.model', () => ({ value: model }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'earlier message', toolUses: [] },
      { role: 'assistant', text: 'earlier answer', toolUses: [] },
    ],
  }))
  on('fs.read', ($, e) => {
    seen.reads.push(e.path)
    return { value: `contents of ${e.path}` }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', ($, e) => {
    seen.calls.push(e)
    return { value: boost }
  })
  on('prompt.submit', ($, e) => {
    seen.submitted.push(e)
    return { text: e.text, context: e.context }
  })
  return seen
}

const typed = (text: string, extra: Partial<PromptSubmitInput> = {}): PromptSubmitInput => ({ text, wait: false, origin: { kind: 'composer' }, ...extra })

test('a boost phrase is boosted by Haiku from the mod\'s own guidance, with auto boost off', async ($, on) => {
  const seen = world(on)
  await $.prompt.submit(typed('Sort out the RAW inbox.\nNow improve this prompt.'))

  expect(seen.calls.length).toBe(1)
  expect(seen.calls[0]!.model).toBe('claude-haiku-5-5')
  expect(seen.calls[0]!.effort).toBe('medium')
  expect(seen.calls[0]!.prompt).toContain('Sort out the RAW inbox.')
  expect(seen.calls[0]!.prompt).toContain('earlier message')
  expect(seen.reads.map(file)).toEqual(['core.md', 'opus-5.5.md'])
  expect(seen.reads.every(path => path.includes('/context-usage/guidance/'))).toBe(true)
  expect(JSON.stringify(seen.calls[0]!.system)).toContain('guidance/core.md')
  expect(JSON.stringify(seen.calls[0]!.system)).toContain('guidance/opus-5.5.md')
  expect(seen.submitted[0]!.text).toBe('BOOSTED PROMPT')
  expect(seen.submitted[0]!.context?.at(-1)).toContain('already boosted')
})

test('a pasted message wrapped in pasted_content tags is boosted', async ($, on) => {
  const seen = world(on, { boost: answer('BOOSTED') })
  await $.prompt.submit(typed('\n\n<pasted_content id="05e5">\nFix the radar links improve this prompt\n</pasted_content id="05e5">\n'))

  expect(seen.calls.length).toBe(1)
  expect(seen.submitted[0]!.text).toBe('BOOSTED')
})

test('a model named in the ask picks its reference', async ($, on) => {
  const seen = world(on)
  const loads = async (text: string) => {
    await $.prompt.submit(typed(text))
    return file(seen.reads.at(-1))
  }
  expect(await loads('boost this for astra: write the migration plan')).toBe('gpt-6-astra.md')
  expect(await loads('Draft the brief.\nimprove this prompt for gpt-6.1 sol')).toBe('gpt-6.1-sol.md')
  expect(await loads('boost this for fable: write the migration plan')).toBe('fable-5.2.md')
  expect(await loads('Draft the brief.\nimprove this prompt for fable 5.2')).toBe('fable-5.2.md')
  expect(await loads('boost this for claude-fable-5-2: tidy the scope')).toBe('fable-5.2.md')
  expect(await loads('boost this for mythos: draft the plan')).toBe('fable-5.2.md')
  expect(await loads('boost this for 5.2: draft the plan')).toBe('fable-5.2.md')
  expect(await loads('boost this for fable 5.1: write the migration plan')).toBe('fable-5.1.md')
  expect(await loads('boost this for fable, 5.1')).toBe('fable-5.1.md')
  expect(await loads('boost this for claude-fable-5-1: draft the plan')).toBe('fable-5.1.md')
  expect(await loads('Draft the plan.\nboost this for 5.1')).toBe('fable-5.1.md')
  expect(await loads('Plan capacity for 5.1 million users.\nboost this for fable 5.2')).toBe('fable-5.2.md')
  expect(await loads('Write the release notes for 5.1.\nboost this')).toBe('opus-5.5.md')
})

test('the session model picks the reference when none is named', async ($, on) => {
  const on52 = world(on, { model: 'claude-fable-5-2' })
  await $.prompt.submit(typed('Sort out the RAW inbox. Now improve this prompt'))
  expect(file(on52.reads.at(-1))).toBe('fable-5.2.md')
  expect(on52.calls.at(-1)!.prompt).toContain('Target model: Claude Fable 5.2 (the session model, claude-fable-5-2)')
})

test('a Fable 5.1 session keeps the Fable 5.1 reference', async ($, on) => {
  const seen = world(on, { model: 'claude-fable-5-1' })
  await $.prompt.submit(typed('Sort out the RAW inbox. Now improve this prompt'))
  expect(file(seen.reads.at(-1))).toBe('fable-5.1.md')
})

test('with auto boost off, a long prompt goes through as typed and no model is called', async ($, on) => {
  const seen = world(on, { store: { autoBoost: false } })
  await $.prompt.submit(typed(BRIEF))
  await $.prompt.submit(typed('Why does the improve this prompt mod skip short messages?'))

  expect(seen.calls.length).toBe(0)
  expect(seen.reads.length).toBe(0)
  expect(seen.submitted.map(s => s.text)).toEqual([BRIEF, 'Why does the improve this prompt mod skip short messages?'])
  expect(seen.submitted[0]!.context).toBeUndefined()
})

test('with auto boost on, every long prompt is boosted in one Haiku call, and the original rides along', async ($, on) => {
  const seen = world(on, { store: { autoBoost: true }, model: 'claude-fable-5-2' })
  await $.prompt.submit(typed(BRIEF))
  // A reply typed while a turn is running is boosted just the same: length is the only rule
  await $.prompt.submit(typed(BRIEF, { turnId: 'turn-1' }))

  expect(seen.calls.length).toBe(2)
  expect(seen.calls.every(call => call.model === 'claude-haiku-5-5' && call.effort === 'medium')).toBe(true)
  expect(file(seen.reads.at(-1))).toBe('fable-5.2.md')
  expect(seen.submitted.map(s => s.text)).toEqual(['BOOSTED PROMPT', 'BOOSTED PROMPT'])
  expect(seen.submitted[0]!.context?.some(c => c.includes('already boosted'))).toBe(true)
  expect(seen.submitted[0]!.context?.at(-1)).toContain(BRIEF)
  expect(seen.toasts.at(-1)).toContain('Auto boosted for Claude Fable 5.2')
})

test('with auto boost on, a prompt under the word count goes through as typed', async ($, on) => {
  const seen = world(on, { store: { autoBoost: true } })
  await $.prompt.submit(typed('fix the failing test'))

  expect(seen.calls.length).toBe(0)
  expect(seen.submitted.map(s => s.text)).toEqual(['fix the failing test'])
  expect(isAutoCandidate({ text: Array(AUTO_MIN_WORDS).fill('word').join(' ') })).toBe(true)
  expect(isAutoCandidate({ text: Array(AUTO_MIN_WORDS - 1).fill('word').join(' ') })).toBe(false)
  expect(isAutoCandidate({ text: `<pasted_content id="1">${Array(AUTO_MIN_WORDS).fill('word').join(' ')}</pasted_content id="1">` })).toBe(true)
})

test('a failed boost sends the prompt as typed', async ($, on) => {
  const seen = world(on, { boost: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } })
  await $.prompt.submit(typed('Sort out the RAW inbox. Now improve this prompt'))

  expect(seen.calls.length).toBe(1)
  expect(seen.submitted[0]!.text).toBe('Sort out the RAW inbox. Now improve this prompt')
  expect(seen.submitted[0]!.context).toBeUndefined()
})

test('the word count saved from the band sets what auto boost takes', async ($, on) => {
  const twelve = 'please tidy the notes folder and then list what you moved where'
  const seen = world(on, { store: { autoBoost: true, autoMinWords: 10 } })
  await $.prompt.submit(typed(twelve))
  await $.prompt.submit(typed('fix the failing test'))

  expect(seen.calls.length).toBe(1)
  expect(seen.submitted.map(s => s.text)).toEqual(['BOOSTED PROMPT', 'fix the failing test'])
})

test('with show prompt off, the message stays as typed and the boosted prompt rides along unseen', async ($, on) => {
  const seen = world(on, { store: { autoBoost: true, showBoost: false } })
  await $.prompt.submit(typed(BRIEF))
  await $.prompt.submit(typed('Sort out the RAW inbox. Now improve this prompt'))

  expect(seen.calls.length).toBe(2)
  expect(seen.submitted.map(s => s.text)).toEqual([BRIEF, 'Sort out the RAW inbox. Now improve this prompt'])
  for (const sent of seen.submitted) {
    expect(sent.context?.some(c => c.includes('already boosted'))).toBe(true)
    expect(sent.context?.at(-1)).toContain('<boosted_prompt>\nBOOSTED PROMPT\n</boosted_prompt>')
  }
})
