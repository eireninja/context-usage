import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { compactionPrompt } from '../hooks/compact'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const BAND = {
  plugin: 'context-usage',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 160, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const said = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const replied = (text: string, uses: [tool: string, path: string][] = []): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses: uses.map(([tool, path], i) => ({ tool_use_id: `t${i}`, tool, input: { file_path: path, content: 'FILE_BODY' }, text: 'TOOL_OUTPUT' })),
})
const LONG_REPLY = `The retry is in and the export keeps its CSV format. ${'The middle of this reply walks through each change in turn and is not what a later reader needs. '.repeat(12)}Two things are open: the upload test is not written, and the staging run is unverified.`

test('a slash command, its output, a reminder and a notice are not the person\'s requests; words typed after a command are', () => {
  const prompt = compactionPrompt([
    said('<command-name>/advisor</command-name>\n<command-message>advisor</command-message>\n<command-args>fable</command-args>'),
    said('<local-command-stdout>Advisor set to Fable 5.1</local-command-stdout>'),
    said('Add a retry to the invoice export.'),
    said('<system-reminder>REMINDER_BODY about hooks</system-reminder>'),
    said('[SYSTEM NOTIFICATION - NOT USER INPUT] a background task finished NOTICE_BODY'),
    said('<command-name>/plugin-authoring</command-name><command-args>make the band show the limit as a button</command-args>'),
    said('<command-name>/compact</command-name><command-args>Keep only what is needed OLD_COMPACT_PROMPT and more words</command-args>'),
    said('<command-name>/reload-plugins</command-name>\n<command-message>reload-plugins</command-message>\n<command-args></command-args>'),
  ])

  expect(prompt).toContain('The task as first given: "Add a retry to the invoice export."')
  expect(prompt).toContain('(1) "make the band show the limit as a button"')
  for (const machine of ['/advisor', 'Advisor set to', 'REMINDER_BODY', 'NOTICE_BODY', 'OLD_COMPACT_PROMPT', 'reload-plugins']) {
    expect(prompt).not.toContain(machine)
  }
})

test('the first request and the latest four are carried, oldest first, each cut at a sentence', () => {
  const long = `Change the limit picker so it also offers 250K. ${'This sentence only pads the request out. '.repeat(20)}`
  const prompt = compactionPrompt([said('First: build the exporter.'), ...['two', 'three', 'four', 'five'].map(n => said(`Request number ${n} here.`)), said(long)])

  expect(prompt).toContain('The task as first given: "First: build the exporter."')
  expect(prompt).not.toContain('Request number two here.')
  expect(prompt).toContain('(1) "Request number three here." (2) "Request number four here." (3) "Request number five here." (4) "Change the limit picker so it also offers 250K.')
  expect(prompt).toContain('the last one being the task in hand')
  expect(prompt).not.toMatch(/pads the request ou[^t]/)
})

test('changed files carry what was done to them, scratch and generated files are dropped, and shell changes are asked for', () => {
  const prompt = compactionPrompt([
    said('Add a retry to the invoice export.'),
    replied('Working.', [
      ['Write', '/work/src/retry.ts'],
      ['Edit', '/work/src/export.ts'],
      ['Edit', '/work/src/export.ts'],
      ['Edit', '/work/src/retry.ts'],
      ['Write', '/private/tmp/session/scratchpad/notes.md'],
      ['Read', '/work/node_modules/lib/index.js'],
      ['Read', '/work/types/api.d.ts'],
      ['Read', '/work/shot.png'],
      ['Read', '/work/src/config.ts'],
    ]),
  ])

  expect(prompt).toContain('/work/src/retry.ts (written in full, then 1 edit); /work/src/export.ts (2 edits).')
  expect(prompt).toContain('Files read for reference that still matter, keep their paths: /work/src/config.ts.')
  expect(prompt).toContain('Keep any other file the session changed through shell commands')
  for (const dropped of ['scratchpad', 'node_modules', 'api.d.ts', 'shot.png', 'FILE_BODY', 'TOOL_OUTPUT']) expect(prompt).not.toContain(dropped)
})

test('in a long session only the files touched lately are listed', () => {
  const early = Array.from({ length: 12 }, (_, i) => replied('Early work.', [['Edit', `/work/old/changed-${i}.ts`], ['Read', `/work/old/read-${i}.ts`]]))
  const filler = Array.from({ length: 40 }, () => replied('Thinking it through.'))
  const late = replied('Late work.', [['Edit', '/work/new/a.ts'], ['Edit', '/work/new/b.ts'], ['Write', '/work/new/c.ts'], ['Read', '/work/new/r1.ts'], ['Read', '/work/new/r2.ts'], ['Read', '/work/new/r3.ts']])
  const prompt = compactionPrompt([said('Rework the exporter module.'), ...early, ...filler, late])

  for (const kept of ['/work/new/a.ts', '/work/new/b.ts', '/work/new/c.ts', '/work/new/r1.ts', '/work/new/r3.ts']) expect(prompt).toContain(kept)
  expect(prompt).not.toContain('/work/old/')
})

test('where the work stood is the last full reply, start and end, not a note made in passing', () => {
  const prompt = compactionPrompt([said('Add a retry to the invoice export.'), replied(LONG_REPLY), replied('Checking one more thing.')])

  expect(prompt).toContain('Where the work stood in the last reply: "The retry is in and the export keeps its CSV format.')
  expect(prompt).toContain('Two things are open: the upload test is not written, and the staging run is unverified."')
  expect(prompt).not.toContain('Checking one more thing.')
  expect(prompt).toContain('what is not done or not verified, and the open next steps')
  expect(prompt.length).toBeLessThan(2500)
})

type World = { store?: Record<string, unknown> }

function world(on: On, { store = {} }: World = {}) {
  const seen = { toasts: [] as string[], fills: [] as string[], compactions: [] as (string | undefined)[], saved: { ...store } as Record<string, unknown> }
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/someone' })
  mock.session(on)
  on('store.get', ($, e) => ({ value: seen.saved[e.key] }))
  on('store.set', ($, e) => {
    seen.saved[e.key] = e.value
    return { value: undefined }
  })
  on('settings.read', () => ({ value: {} }))
  on('session.authorize', () => ({ deny: 'no account in a test' }))
  on('session.messages', () => ({ value: [said('Add a retry to the invoice export.'), replied('Working.', [['Edit', '/work/src/export.ts']])] }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  // The mod never compacts by itself: this only records a call that should not come
  on('session.compact', ($, e) => {
    seen.compactions.push(e.instructions)
    return { messages: [said('SUMMARY')] }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return { ...seen, clock, state: seen }
}

const reading = ($: Engine, tokens: number) =>
  $.session.measure({ context: { tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) }, rateLimits: [], changed: [] })

test('the band reads BOOST, PROMPT and COMPACT in that order between bars, with a five-cell context bar', async ($, on) => {
  world(on)
  await reading($, 120_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const buttons = (await ui.findAll({ type: 'Button' })).map(found => found.text).filter(Boolean)
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
    await ui.unmount()

    expect(buttons).toEqual([' ▾', '[BOOST]', '40+ WORDS ▾', '[PROMPT]', '[COMPACT]', 'LIMIT 400K ▾'])
    expect(texts.filter(text => text === '│').length).toBe(6)
    // 120K of 400K on five cells
    expect(texts.filter(text => /^[█░]+$/.test(text))).toEqual(['██░░░'])
    expect([...buttons, ...texts].some(text => /AUTO|SHOW/.test(text))).toBe(false)
  }
})

test('COMPACT shows a red OFF, a click turns it to a green ON and saves it, and it is there after a reload', async ($, on) => {
  const seen = world(on, { store: { autoCompact: false } })
  await reading($, 120_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // The band's states in order: BOOST, PROMPT, COMPACT
  const state = async () => {
    const found = (await ui.findAll({ type: 'Text', text: /^● (ON|OFF)$/ }))[2]
    return `${found?.props.color} ${found?.text}`
  }
  const before = await state()
  await ui.press({ key: 'compact' })
  const after = await state()
  // A reload starts the module's memory over; the next reading takes the switch from the store
  await reading($, 121_000)
  const reloaded = await state()
  await ui.unmount()

  expect([before, after, reloaded]).toEqual(['red ● OFF', 'green ● ON', 'green ● ON'])
  expect(seen.saved.autoCompact).toBe(true)
  expect(seen.toasts.at(-1)).toContain('Compact on')
})

test('every control that can be clicked says so at rest and lights under the pointer; nothing else does', async ($, on) => {
  world(on)
  await reading($, 120_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const buttons = await ui.findAll({ type: 'Button' })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
    // The drawing itself carries each button's hover style beside its props
    const hovers = new Map<string, unknown>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== 'object' || node === null) return
      const el = node as { type?: string; props?: { key?: string }; hover?: unknown; children?: unknown }
      if (el.type === 'Button' && el.props?.key) hovers.set(el.props.key, el.hover)
      walk(el.children)
    }
    walk(await ui.drawn())
    await ui.unmount()

    expect(buttons.map(found => found.key)).toEqual(['model', 'boost', 'boost-words', 'boost-show', 'compact', 'limit'])
    for (const found of buttons) {
      // At rest: a switch in [brackets], a menu ending in ▾
      expect(found.text).toMatch(/^\[[A-Z]+\]$|▾$/)
      // Under the pointer: its own hover group, underlined and bold
      expect(hovers.get(found.key!)).toEqual({ scope: `band-${found.key}`, underline: true, bold: true })
    }
    // The cues belong to the buttons alone: no plain text on the band carries one
    const labels = new Set(buttons.map(found => found.text))
    expect(texts.filter(text => !labels.has(text) && /^\[|▾/.test(text))).toEqual([])
  }
})

test('the last reply is carried as prose: no heading marks, table rules or closing sign-off line', () => {
  const reply = [
    'The retry is in and all the tests pass, so the export can go out with the next release as planned.',
    '',
    '## What changed',
    '',
    '| File | Change |',
    '| --- | --- |',
    '| export.ts | three attempts |',
    '',
    '- **Open:** the staging run is unverified and the upload test is still to be written by someone.',
    '',
    'scr · eli · foc · ref',
  ].join('\n')
  const prompt = compactionPrompt([said('Add a retry to the invoice export.'), replied(reply)])

  expect(prompt).toContain('as planned. What changed: | File | Change | | export.ts | three attempts | Open: the staging run is unverified')
  for (const furniture of ['##', '---', 'scr · eli', '**']) expect(prompt).not.toContain(furniture)
})

test('with COMPACT on, which it is until switched off, the limit puts the compaction prompt in the prompt box once', async ($, on) => {
  const seen = world(on)
  for (const tokens of [100_000, 360_000, 400_000, 420_000]) await reading($, tokens)

  expect(seen.toasts[0]).toBe('Approaching context limit. Prepare for compaction.')
  expect(seen.fills.length).toBe(1)
  expect(seen.fills[0]!.startsWith('/compact Keep only what is needed')).toBe(true)
  expect(seen.fills[0]).toContain('/work/src/export.ts (1 edit)')
  expect(seen.toasts.at(-1)).toContain('press Enter to compact')
  expect(seen.compactions).toEqual([])
})

test('with COMPACT off, nothing happens at the limit; the warning toast still shows', async ($, on) => {
  const seen = world(on, { store: { autoCompact: false } })
  for (const tokens of [100_000, 360_000, 400_000, 420_000]) await reading($, tokens)

  expect(seen.toasts).toEqual(['Approaching context limit. Prepare for compaction.'])
  expect(seen.fills).toEqual([])
  expect(seen.compactions).toEqual([])
})

test('COMPACT switched on in a session already over its limit puts the prompt in the prompt box at once', async ($, on) => {
  const seen = world(on, { store: { autoCompact: false } })
  for (const tokens of [100_000, 600_000]) await reading($, tokens)
  expect(seen.fills).toEqual([])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'compact' })
  await ui.unmount()

  expect(seen.fills.length).toBe(1)
  expect(seen.compactions).toEqual([])
  // Switched off and on again in the same climb, the prompt is offered again
  const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await again.press({ key: 'compact' })
  await again.press({ key: 'compact' })
  await again.unmount()
  expect(seen.fills.length).toBe(2)
})
