import { expect, test } from 'claude-code/testing'

import { menuOptions, restoreDefaults } from '../hooks/switch'
import { captureRecord, mergeWindows, parseEndpoint, usageColor } from '../hooks/usage'
import type { UsageWindow } from '../hooks/usage'
import { limitOf, report, Watch } from '../hooks/watch'

const WINDOW = 1_000_000
const NOW = Date.parse('2026-10-07T18:00:00Z')

const reading = (tokens: number, windows: UsageWindow[] = []) => ({
  context: { tokens, window: WINDOW, percent: Math.round((tokens / WINDOW) * 100) },
  windows,
})
const fiveHour = (percentUsed: number, resetsAt: string): UsageWindow => ({ kind: 'five_hour', label: '5HR', percentUsed, resetsAt })

// A trimmed copy of the endpoint's real response shape (2026-10-08)
const ENDPOINT = JSON.stringify({
  five_hour: { utilization: 19.0, resets_at: '2026-10-07T20:20:00+00:00' },
  seven_day: { utilization: 40.0, resets_at: '2026-10-09T20:00:00+00:00' },
  limits: [
    { kind: 'session', percent: 19, resets_at: '2026-10-07T20:20:00+00:00', scope: null },
    { kind: 'weekly_scoped', percent: 52, resets_at: '2026-10-09T20:00:00+00:00', scope: { model: { display_name: 'Fable' } } },
  ],
})

test('warns once per usage window reset at 90%', () => {
  const watch = new Watch()
  const resetsAt = '2026-10-07T20:00:00Z'

  expect(watch.alerts(reading(10_000, [fiveHour(85, resetsAt)]), NOW).length).toBe(0)

  const first = watch.alerts(reading(10_000, [fiveHour(91, resetsAt)]), NOW)
  expect(first[0]?.note).toContain('5HR usage window is at 91% (resets in 2h 0m)')
  expect(watch.alerts(reading(10_000, [fiveHour(95, resetsAt)]), NOW).length).toBe(0)

  expect(watch.alerts(reading(10_000, [fiveHour(92, '2026-10-08T01:00:00Z')]), NOW).length).toBe(1)
})

test('reads 5H, the model-scoped weekly window and WK from the endpoint, in that order', () => {
  const parsed = parseEndpoint(ENDPOINT, NOW)
  expect(parsed?.windows.map(w => `${w.label} ${w.percentUsed}`)).toEqual(['5HR 19', 'WK FABLE 52', 'WK 40'])
  expect(parseEndpoint('not json', NOW)).toBeUndefined()
})

test('prefers the endpoint, falls back to the engine, and drops windows whose reset has passed', () => {
  const engine = [
    { kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-07T17:00:00Z' },
    { kind: 'seven_day', percentUsed: 36, resetsAt: '2026-10-09T20:00:00Z' },
  ]
  const endpoint = parseEndpoint(ENDPOINT, NOW)

  const merged = mergeWindows(engine, endpoint, NOW)
  expect(merged.map(w => `${w.label} ${w.percentUsed}`)).toEqual(['5HR 19', 'WK FABLE 52', 'WK 40'])

  const engineOnly = mergeWindows(engine, undefined, NOW)
  expect(engineOnly.map(w => `${w.label} ${w.percentUsed}`)).toEqual(['WK 36'])

  const expired = mergeWindows(engine, endpoint, NOW + 2 * 3_600_000)
  expect(expired.map(w => w.label)).toEqual(['WK'])
})

test('grades every percentage on the status bar scale', () => {
  expect(usageColor(39)).toBe('#34d399')
  expect(usageColor(40)).toBe('#fbbf24')
  expect(usageColor(60)).toBe('#fb923c')
  expect(usageColor(80)).toBe('#f43f5e')
})

test('writes the usage capture in the shape Command Center reads, and nothing without a reading', () => {
  const windows = parseEndpoint(ENDPOINT, NOW)?.windows ?? []
  const record = JSON.parse(captureRecord(windows, '2026-10-07T18:00:00.000Z') ?? '{}')
  expect(record.rateLimits.five_hour).toEqual({ used_percentage: 19, resets_at: Date.parse('2026-10-07T20:20:00Z') / 1000 })
  expect(record.rateLimits.seven_day.used_percentage).toBe(40)
  expect(captureRecord([], '2026-10-07T18:00:00.000Z')).toBeUndefined()
})

test('the model and effort menus list the choices and tick the current one', () => {
  const models = menuOptions('model', 'claude-opus-5-5[1m]', 'high')
  expect(models.map(o => o.value)).toEqual(['opus', 'fable', 'sonnet', 'haiku'])
  expect(models.filter(o => o.isCurrent).map(o => o.label)).toEqual(['OPUS 5.5'])
  // Each current model ticks its own row, so every label carries the version that model reports
  const ticked = (id: string) => menuOptions('model', id, 'high').filter(o => o.isCurrent).map(o => o.label)
  expect(ticked('claude-fable-5-2')).toEqual(['FABLE 5.2'])
  expect(ticked('claude-sonnet-5-5')).toEqual(['SONNET 5.5'])
  expect(ticked('claude-haiku-5-5')).toEqual(['HAIKU 5.5'])

  const efforts = menuOptions('effort', 'claude-opus-5-5', 'xhigh')
  expect(efforts.map(o => o.label)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'XHIGH', 'MAX'])
  expect(efforts.filter(o => o.isCurrent).map(o => o.value)).toEqual(['xhigh'])
})

test('puts back the saved defaults a pick wrote, and keeps every other change', () => {
  const before = { model: 'opus', theme: 'dark', modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } }
  const after = { model: 'sonnet', theme: 'light', modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low' } } }
  const restored = restoreDefaults(JSON.stringify(before), JSON.stringify(after))
  expect(restored).toBe(`${JSON.stringify({ ...before, theme: 'light' }, null, 2)}\n`)

  expect(restoreDefaults(JSON.stringify(before), JSON.stringify({ ...before, theme: 'light' }))).toBe(undefined)
  expect(restoreDefaults('{}', JSON.stringify({ model: 'sonnet' }))).toBe('{}\n')
})

test('the context bar fills towards the auto-compact window, else the model window', () => {
  expect(limitOf(reading(100_000).context, 400_000)).toBe(400_000)
  expect(limitOf(reading(100_000).context, undefined)).toBe(WINDOW)
  expect(limitOf(reading(100_000).context, 2_000_000)).toBe(WINDOW)
  expect(report(reading(120_000), 400_000, NOW).split('\n')[0]).toBe('Context: 120K of 1000K (12%) · auto-compacts at 400K')
  expect(report(reading(120_000), undefined, NOW).split('\n')[0]).toBe('Context: 120K of 1000K (12%)')
})

test('no alert ever names a handoff', () => {
  const watch = new Watch()
  const notes = watch.alerts(reading(950_000, [fiveHour(95, '2026-10-07T20:00:00Z')]), NOW).map(a => a.note).join(' ')
  expect(notes).toContain('5HR usage window is at 95%')
  expect(notes.includes('handoff')).toBe(false)
})
