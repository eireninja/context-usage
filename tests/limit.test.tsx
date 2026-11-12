import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { compactionPrompt, Thresholds, WARN_TOAST } from '../hooks/compact'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const BAND = {
  plugin: 'context-usage',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

// A session with tool noise in it: a command, its output, a file read and a file edit
const TRANSCRIPT: SessionMessage[] = [
  { role: 'user', text: 'Add a retry to the invoice export and keep the CSV format as it is.', toolUses: [] },
  {
    role: 'assistant',
    text: 'I will read the exporter first.',
    toolUses: [
      { tool_use_id: 't1', tool: 'Bash', input: { command: 'grep -rn RETRY_SENTINEL src' }, text: 'TOOL_OUTPUT_LINE_ONE' },
      { tool_use_id: 't2', tool: 'Read', input: { file_path: '/work/src/config.ts' }, text: 'FILE_BODY_OF_CONFIG' },
      { tool_use_id: 't3', tool: 'Edit', input: { file_path: '/work/src/export.ts', old_string: 'OLD_CODE', new_string: 'NEW_CODE' }, text: 'edited' },
    ],
  },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'TOOL_RESULT_BLOCK', isError: false, result: undefined }] },
  { role: 'user', text: 'Use three attempts, not five.', toolUses: [] },
  { role: 'assistant', text: 'Three attempts are in. Next I still need to add the test for a failed upload.', toolUses: [] },
]

type World = { store?: Record<string, unknown>; draft?: string }

function world(on: On, { store = {}, draft = '' }: World = {}) {
  const seen = { toasts: [] as string[], fills: [] as string[], saved: { ...store } as Record<string, unknown>, draft }
  mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/someone' })
  mock.session(on)
  on('store.get', ($, e) => ({ value: seen.saved[e.key] }))
  on('store.set', ($, e) => {
    seen.saved[e.key] = e.value
    return { value: undefined }
  })
  on('settings.read', () => ({ value: {} }))
  on('session.authorize', () => ({ deny: 'no account in a test' }))
  on('session.messages', () => ({ value: TRANSCRIPT }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: seen.draft, cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return seen
}

// The engine pushes one context reading, as it does after each turn
const reading = ($: Engine, tokens: number) =>
  $.session.measure({ context: { tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) }, rateLimits: [], changed: [] })

test('each step fires once on the way up, for any limit, and arms again after a compaction or a new limit', () => {
  for (const limit of [400_000, 300_000]) {
    const t = new Thresholds()
    expect(t.crossings(limit - 50_001, limit)).toEqual([])
    expect(t.crossings(limit - 50_000, limit)).toEqual(['warn'])
    expect(t.crossings(limit - 10_000, limit)).toEqual([])
    expect(t.crossings(limit, limit)).toEqual(['compact'])
    expect(t.crossings(limit + 20_000, limit)).toEqual([])
    // A compaction brought the context back down: both are armed again
    expect(t.crossings(60_000, limit)).toEqual([])
    expect(t.crossings(limit - 1, limit)).toEqual(['warn'])
    // A new limit arms both for its own levels
    expect(t.crossings(limit - 1, limit + 100_000)).toEqual([])
    expect(t.crossings(limit + 50_000, limit + 100_000)).toEqual(['warn'])
  }
})

test('the compaction prompt keeps the task, the key files and the open steps, and no tool call or result', () => {
  const prompt = compactionPrompt(TRANSCRIPT)

  expect(prompt).toContain('Add a retry to the invoice export and keep the CSV format as it is.')
  expect(prompt).toContain('Use three attempts, not five.')
  expect(prompt).toContain('/work/src/export.ts')
  expect(prompt).toContain('/work/src/config.ts')
  expect(prompt).toContain('Next I still need to add the test for a failed upload.')
  for (const noise of ['RETRY_SENTINEL', 'grep', 'TOOL_OUTPUT_LINE_ONE', 'FILE_BODY_OF_CONFIG', 'OLD_CODE', 'NEW_CODE', 'TOOL_RESULT_BLOCK', 'Bash']) {
    expect(prompt).not.toContain(noise)
  }
  // Laid out to be skimmed: four headed sections, each item on a line of its own
  expect(prompt.split('\n').filter(line => line.startsWith('## '))).toEqual(['## Task in hand', '## Files', '## Keep', '## Where the work stood'])
  expect(prompt).toContain('- First request: "Add a retry to the invoice export and keep the CSV format as it is."\n- Latest requests, oldest first:\n  1. "Use three attempts, not five."')
  // It asks for nothing to be left out, and an empty session still gets the standing sections
  for (const dropped of ['Leave out', 'finished or was abandoned', 'Keep only what is needed']) expect(prompt).not.toContain(dropped)
  expect(compactionPrompt([]).split('\n').filter(line => line.startsWith('## '))).toEqual(['## Files', '## Keep'])
  expect(compactionPrompt([])).toContain('- What was tried or set aside, and why.')
})

test('at the default limit the toast comes once at 350K and the compaction prompt once at 400K', async ($, on) => {
  const seen = world(on)
  for (const tokens of [100_000, 300_000, 349_000]) await reading($, tokens)
  expect(seen.toasts).toEqual([])
  expect(seen.fills).toEqual([])

  for (const tokens of [350_000, 360_000, 399_000]) await reading($, tokens)
  expect(seen.toasts).toEqual([WARN_TOAST])
  expect(seen.fills).toEqual([])

  for (const tokens of [400_000, 410_000, 450_000]) await reading($, tokens)
  expect(seen.fills.length).toBe(1)
  expect(seen.fills[0]!.startsWith('/compact Focus the summary on the work below.')).toBe(true)
  expect(seen.fills[0]).toContain('/work/src/export.ts')
  expect(seen.fills[0]).not.toContain('TOOL_OUTPUT_LINE_ONE')
  expect(seen.toasts.length).toBe(2)
  expect(seen.toasts[1]).toContain('press Enter to compact')
})

test('a saved limit of 300K moves both steps: the toast at 250K, the prompt at 300K', async ($, on) => {
  const seen = world(on, { store: { contextLimit: 300_000 } })
  for (const tokens of [100_000, 249_000]) await reading($, tokens)
  expect(seen.toasts).toEqual([])

  await reading($, 250_000)
  expect(seen.toasts).toEqual([WARN_TOAST])
  expect(seen.fills).toEqual([])

  for (const tokens of [300_000, 320_000]) await reading($, tokens)
  expect(seen.fills.length).toBe(1)
})

test('a draft in the prompt box is never written over: the prompt waits until the box is empty', async ($, on) => {
  const seen = world(on, { store: { contextLimit: 300_000 }, draft: 'half a sentence I am typing' })
  for (const tokens of [100_000, 310_000, 315_000]) await reading($, tokens)
  expect(seen.fills).toEqual([])
  expect(seen.toasts.filter(t => t.includes('Send or clear your draft')).length).toBe(1)

  seen.draft = ''
  await reading($, 320_000)
  expect(seen.fills.length).toBe(1)
})

test('the limit opens a row of choices; a pick shows on the band, is saved and confirmed, and is there after a reload', async ($, on) => {
  const seen = world(on, { store: { contextLimit: 600_000 } })
  // A reload starts the module's memory over; the next reading takes the limit from the store
  await reading($, 120_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const label = async () => (await ui.find({ type: 'Button', text: /^LIMIT / }))?.text
    const pick = surface === 'terminal' ? 500_000 : 300_000
    const before = await label()

    await ui.press({ key: 'limit' })
    const choices = (await ui.findAll({ type: 'Button', text: /^\d+(K|M)( ✔)?$/ })).map(found => found.text)
    await ui.press({ key: `limit-${pick}` })
    const after = await label()
    await ui.unmount()

    expect(before).toBe(surface === 'terminal' ? 'LIMIT 600K ▾' : 'LIMIT 500K ▾')
    expect(choices).toEqual(
      surface === 'terminal'
        ? ['200K', '300K', '400K', '500K', '600K ✔', '800K', '1M']
        : ['200K', '300K', '400K', '500K ✔', '600K', '800K', '1M'],
    )
    expect(after).toBe(surface === 'terminal' ? 'LIMIT 500K ▾' : 'LIMIT 300K ▾')
    expect(seen.saved.contextLimit).toBe(pick)
    expect(seen.toasts.at(-1)).toContain(surface === 'terminal' ? 'Context limit 500K' : 'Context limit 300K')
  }
})
