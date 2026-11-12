import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const BAND = {
  plugin: 'context-usage',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

// A session started in a folder that is no vault: the engine pushes one usage reading
async function measured($: Engine, on: On, store: Record<string, unknown> = {}) {
  const writes: { path: string; text: string }[] = []
  const saved: Record<string, unknown> = { ...store }
  mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: saved[e.key] }))
  on('store.set', ($, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  mock.env(on, { HOME: '/home/someone' })
  mock.session(on)
  on('settings.read', () => ({ value: {} }))
  on('session.authorize', () => ({ deny: 'no account in a test' }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 120_000, window: 1_000_000, percent: 12 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 19, resetsAt: '2026-11-10T14:00:00Z' }],
    changed: [],
  })
  return { writes, saved }
}

test('the usage figures go to ~/.claude/usage-limits.json from any folder', async ($, on) => {
  const { writes } = await measured($, on)

  expect(writes.length).toBe(1)
  expect(writes[0]!.path).toBe('/home/someone/.claude/usage-limits.json')
  expect(JSON.parse(writes[0]!.text).source).toBe('context-usage')
})

test('BOOST shows a red OFF, a click turns it to a green ON and saves it, on every surface', async ($, on) => {
  const { saved } = await measured($, on, { autoBoost: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const state = async () => {
      const found = await ui.find({ type: 'Text', text: /^● (ON|OFF)$/ })
      return `${found?.props.color} ${found?.text}`
    }
    const before = await state()

    await ui.press({ key: 'boost' })
    const after = await state()
    const stored = saved.autoBoost
    await ui.unmount()

    // The switch is one for every surface: the second pass starts from where the first left it
    expect([before, after]).toEqual(surface === 'terminal' ? ['red ● OFF', 'green ● ON'] : ['green ● ON', 'red ● OFF'])
    expect(stored).toBe(surface === 'terminal')
  }
})

test('the word count opens a row of choices, and a pick shows on the band and is saved', async ($, on) => {
  const { saved } = await measured($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const label = async () => (await ui.find({ type: 'Button', text: /\+ WORDS ▾$/ }))?.text
    const pick = surface === 'terminal' ? 20 : 80
    const before = await label()

    await ui.press({ key: 'boost-words' })
    const choices = (await ui.findAll({ type: 'Button', text: /^\d+( ✔)?$/ })).map(found => found.text)
    await ui.press({ key: `words-${pick}` })
    const after = await label()
    const closed = (await ui.findAll({ type: 'Button', text: /^\d+( ✔)?$/ })).length
    await ui.unmount()

    expect(before).toBe(surface === 'terminal' ? '40+ WORDS ▾' : '20+ WORDS ▾')
    expect(choices).toEqual(surface === 'terminal' ? ['10', '20', '30', '40 ✔', '60', '80', '120'] : ['10', '20 ✔', '30', '40', '60', '80', '120'])
    expect(after).toBe(`${pick}+ WORDS ▾`)
    expect(closed).toBe(0)
    expect(saved.autoMinWords).toBe(pick)
  }
})

test('PROMPT starts as a green ON, and a click turns it to a red OFF and saves it', async ($, on) => {
  const { saved } = await measured($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const state = async () => {
    // The band's states in order: BOOST, PROMPT, COMPACT
    const found = (await ui.findAll({ type: 'Text', text: /^● (ON|OFF)$/ }))[1]
    return `${found?.props.color} ${found?.text}`
  }
  const before = await state()
  await ui.press({ key: 'boost-show' })
  const after = await state()
  await ui.press({ key: 'boost-show' })
  const again = await state()
  await ui.unmount()

  expect([before, after, again]).toEqual(['green ● ON', 'red ● OFF', 'green ● ON'])
  expect(saved.showBoost).toBe(true)
})
