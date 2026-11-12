import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import {
  autoMinWords,
  isAutoBoost,
  isShowBoost,
  loadAutoBoost,
  registerBoost,
  setAutoMinWords,
  toggleAutoBoost,
  toggleShowBoost,
  WORD_CHOICES,
} from './boost'
import {
  compactionPrompt,
  contextLimit,
  effectiveLimit,
  isAutoCompact,
  LIMIT_CHOICES,
  limitLabel,
  loadContextLimit,
  setContextLimit,
  Thresholds,
  toggleAutoCompact,
  WARN_TOAST,
} from './compact'
import type { Crossing } from './compact'
import { menuOptions, modelLabel, restoreDefaults } from './switch'
import type { Menu } from './switch'
import {
  CAPTURE_FILE,
  captureRecord,
  mergeWindows,
  parseEndpoint,
  resetLabel,
  USAGE_TTL_MS,
  USAGE_URL,
  usageColor,
} from './usage'
import type { EndpointReading } from './usage'
import { kTokens, limitOf, report, Watch } from './watch'
import type { Reading } from './watch'

const BAR_CELLS = 5
const LABEL_COLOR = 'cyan'

// What can be clicked says so at rest: a switch is in [brackets], a control that opens a row of choices
// ends in ▾. Under the pointer its label is underlined and bold as well.
const MENU = ' ▾'
const lit = (key: string) => ({ scope: `band-${key}`, underline: true, bold: true }) as const

// Module state: a reload starts it over, which re-arms both alerts at worst
const watch = new Watch()
let context: SessionContextUsage | undefined
let engineLimits: readonly SessionRateLimit[] = []
let autoCompactWindow: number | undefined
let endpoint: EndpointReading | undefined
let isFetching = false
let folder = ''
let model = ''
let effort: string | undefined
// A band pick: sent on every main-loop request until /effort is typed. /effort from a plugin is
// refused after a Stop (an Esc interrupt), so the pick never runs the command.
let effortPick: Effort | undefined
let lastCapture = ''
// The second row: a model or effort menu, auto boost's word counts, or the context limits
let menu: Menu | 'words' | 'limit' | undefined
const thresholds = new Thresholds()
// The compaction prompt is held back while the prompt box holds a draft; said once
let isWaitingForBox = false

async function readAutoCompactWindow($: EngineInterface): Promise<number | undefined> {
  const value = await $.settings.read({ key: 'autoCompactWindow' })
  return typeof value === 'number' ? value : undefined
}

const readingAt = (now: number): Reading | undefined =>
  context === undefined ? undefined : { context, windows: mergeWindows(engineLimits, endpoint, now) }

async function refreshUsage($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  if (isFetching || (endpoint !== undefined && now - endpoint.fetchedAt < USAGE_TTL_MS)) return
  isFetching = true
  try {
    const auth = await $.session.authorize()
    if (!auth) return
    const res = await $.http.fetch(USAGE_URL, {
      auth: auth.handle,
      headers: { 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json' },
    })
    const parsed = res.ok ? parseEndpoint(res.text, now) : undefined
    if (parsed) endpoint = parsed
  } finally {
    isFetching = false
  }
}

async function check($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const r = readingAt(now)
  $.ui.invalidate('ui.render')
  if (!r) return
  await capture($, r, now)
  if (r.context.tokens !== undefined) {
    for (const crossing of thresholds.crossings(r.context.tokens, effectiveLimit(r.context.window))) {
      await onCrossing($, crossing).catch(() => undefined)
    }
  }
  for (const alert of watch.alerts(r, now)) {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: alert.note }] } })
    $.ui.toast(alert.toast)
  }
}

// COMPACT switched on, here or in another session, in a session already over its limit: the limit step
// that passed with the switch off is taken again now
async function armCompact($: EngineInterface): Promise<void> {
  thresholds.retry()
  await check($)
}

// The warning is a toast only. At the limit, with COMPACT on, the prompt box gets `/compact` with a prompt
// built from the session, for the person to send: a draft already in the box is never written over, the
// step waits. With COMPACT off nothing happens at the limit.
async function onCrossing($: EngineInterface, crossing: Crossing): Promise<void> {
  if (crossing === 'warn') {
    $.ui.toast(WARN_TOAST, { timeoutMs: 10_000 })
    return
  }
  if (!isAutoCompact()) return
  const box = await $.prompt.read()
  if (box.text.trim()) {
    thresholds.retry()
    if (!isWaitingForBox) $.ui.toast('Context limit reached. Send or clear your draft and the compaction prompt will appear.', { timeoutMs: 12_000 })
    isWaitingForBox = true
    return
  }
  isWaitingForBox = false
  const rows = await $.session.messages()
  const { isFilled } = await $.prompt.fill({ text: `/compact ${compactionPrompt(Array.isArray(rows) ? rows : [])}` })
  $.ui.toast(
    isFilled
      ? 'Context limit reached. A compaction prompt is in the prompt box: press Enter to compact.'
      : 'Context limit reached. Type /compact to compact.',
    { timeoutMs: 12_000 },
  )
}

// Every session keeps ~/.claude/usage-limits.json fed, from any folder; a write happens only when a figure moved
async function capture($: EngineInterface, r: Reading, now: number): Promise<void> {
  const body = captureRecord(r.windows, '')
  if (body === undefined || body === lastCapture) return
  const home = await $.env.get('HOME')
  if (!home) return
  lastCapture = body
  await $.fs.write(`${home}/${CAPTURE_FILE}`, captureRecord(r.windows, new Date(now).toISOString()) ?? body)
}

// The status bar's effort colours
const EFFORT_COLORS: Record<string, string> = { low: 'green', medium: 'cyan', high: 'yellow', xhigh: 'magenta', max: 'red' }

const EFFORT_LEVELS = /^(low|medium|high|xhigh|max)$/
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// Each session's own effort before its first request: the --effort it was launched with, else the
// default it started from. Every request then reports the live value (turn.step), and /effort sets it.
async function initialEffort($: EngineInterface): Promise<string | undefined> {
  const id = await $.session.id()
  const { stdout } = await $.process.run([
    '/bin/sh',
    '-c',
    'f=$(grep -l "\\"sessionId\\":\\"$1\\"" "$HOME"/.claude/sessions/*.json 2>/dev/null | head -1); ' +
      '[ -n "$f" ] && ps -o command= -p "$(basename "$f" .json)"',
    'sh',
    id,
  ])
  const flag = /--effort[= ]([a-z]+)/.exec(stdout)?.[1]
  if (flag && EFFORT_LEVELS.test(flag)) return flag
  const fromEnv = await $.env.get('CLAUDE_CODE_EFFORT_LEVEL')
  if (fromEnv && EFFORT_LEVELS.test(fromEnv)) return fromEnv
  const { effortLevel } = await $.settings.read()
  return typeof effortLevel === 'string' && EFFORT_LEVELS.test(effortLevel) ? effortLevel : undefined
}

function toggleMenu($: EngineInterface, which: Menu | 'words' | 'limit'): void {
  menu = menu === which ? undefined : which
  $.ui.invalidate('ui.render')
}

// An effort pick applies from the next request, mid-turn included. A model pick runs /model for
// this session alone. The engine saves it as the default for new sessions, so the defaults in the
// user settings file are put back as they were. A toast says so, and a notice under the engine's
// line keeps it on record (ctrl+o shows it).
async function choose($: EngineInterface, command: Menu, args: string, isWorking: boolean): Promise<void> {
  menu = undefined
  $.ui.invalidate('ui.render')
  if (command === 'effort' && EFFORT_LEVELS.test(args)) {
    effortPick = args as Effort
    effort = args
    $.ui.invalidate('ui.render')
    $.ui.toast(`${args.toUpperCase()} for this session, from the next request.`)
    return
  }
  if (isWorking) {
    $.ui.toast(`Claude is working: pick ${args.toUpperCase()} again once this turn ends`)
    return
  }
  const path = `${(await $.env.get('HOME')) ?? ''}/.claude/settings.json`
  const before = await $.fs.read(path)
  try {
    await $.command.run({ command, args })
  } catch {
    // Refused after a Stop (an Esc interrupt) until the next prompt: the person's own Enter runs it
    await $.prompt.fill({ text: `/${command} ${args}` })
    $.ui.toast(`Press Enter to run /${command} ${args} (the band can't run it right after an interrupt).`)
    return
  }
  const restored = restoreDefaults(before, await $.fs.read(path))
  if (restored !== undefined) await $.fs.write(path, restored)
  if (command === 'model') model = await $.session.model()
  else effort = args
  $.ui.invalidate('ui.render')
  if (restored === undefined) return
  const picked = command === 'model' ? modelLabel(model) : args.toUpperCase()
  const kept = `${picked} is for this session only: new sessions still start on your saved default.`
  $.ui.toast(kept)
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: kept }] } })
}

function bar(tokens: number, limit: number): string {
  const filled = Math.min(BAR_CELLS, Math.round((tokens / limit) * BAR_CELLS))
  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

export const register: Register = on => {
  registerBoost(on)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ctx',
      description: 'Show context size and usage windows',
      immediate: true,
    })
    folder = (await $.session.root()).split('/').filter(Boolean).pop() ?? ''
    await loadAutoBoost($)
    await loadContextLimit($)
    model = await $.session.model()
    effort ??= await initialEffort($).catch(() => undefined)
    const usage = await $.session.usage()
    context = usage.context
    engineLimits = usage.rateLimits
    autoCompactWindow = await readAutoCompactWindow($).catch(() => undefined)
    $.clock.every(USAGE_TTL_MS, () => {
      void refreshUsage($)
        .then(() => check($))
        .catch(() => undefined)
    })
    void refreshUsage($)
      .then(() => check($))
      .catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'ctx' }, async $ => {
    const usage = await $.session.usage()
    context = usage.context
    engineLimits = usage.rateLimits
    await refreshUsage($).catch(() => undefined)
    autoCompactWindow = await readAutoCompactWindow($).catch(() => autoCompactWindow)
    const now = await $.clock.now()
    return {
      text: report({ context: usage.context, windows: mergeWindows(engineLimits, endpoint, now) }, autoCompactWindow, now),
    }
  })

  // Pushed after each main-thread turn and when a usage window moves
  on('session.measure', async ($, e, next) => {
    context = e.context
    engineLimits = e.rateLimits
    autoCompactWindow = await readAutoCompactWindow($).catch(() => autoCompactWindow)
    await refreshUsage($).catch(() => undefined)
    // Another session may have picked a new limit, or switched COMPACT, since this one last looked
    const wasAuto = isAutoCompact()
    await loadContextLimit($)
    if (!wasAuto && isAutoCompact()) thresholds.retry()
    await check($)
    return next(e)
  })

  // Mid-turn coverage for long autonomous turns: main loop only, after the tool runs
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) {
      void $.session
        .usage()
        .then(usage => {
          context = usage.context
          engineLimits = usage.rateLimits
          return check($)
        })
        .catch(() => undefined)
    }
    return ran
  })

  // /effort <level> changes this session's effort at once
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const ran = await next(e)
    const level = e.args.trim().toLowerCase()
    if (EFFORT_LEVELS.test(level)) {
      effortPick = undefined
      effort = level
      $.ui.invalidate('ui.render')
    }
    return ran
  })

  // /model changes the model shown
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const ran = await next(e)
    model = await $.session.model()
    $.ui.invalidate('ui.render')
    return ran
  })

  // Each main-loop request goes out with the band's effort pick, and is read for the model and effort
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const step = effortPick !== undefined && e.effort !== undefined ? { ...e, effort: effortPick } : e
    model = step.model
    if (step.effort !== undefined) effort = String(step.effort)
    return yield* next(step)
  })

  // The band above the prompt: context against the auto-compact window, and the usage windows
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await $.clock.now()
    const r = readingAt(now)
    if (e.props.hasSurvey || !r) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const tokens = r.context.tokens ?? 0
    const limit = effectiveLimit(r.context.window)
    const ctxColor = usageColor((tokens / limit) * 100)
    const isWorking = e.props.isWorking === true
    const open = menu

    // Laid out as the status bar was: DIR │ MODEL · EFFORT │ BOOST │ PROMPT │ COMPACT │ CTX │ 📊 5HR · WK <model> · WK.
    // The model, the effort and auto boost's word count open their menu on a second row.
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color={LABEL_COLOR}>{folder.toUpperCase()}</Text>
          <Text dimColor>│</Text>
          <Button key="model" plain hover={lit('model')} onPress={() => toggleMenu($, 'model')}>
            <Text color={LABEL_COLOR}>{`${modelLabel(model)}${MENU}`}</Text>
          </Button>
          {effort === undefined ? null : <Text dimColor>·</Text>}
          {effort === undefined ? null : (
            <Button key="effort" plain hover={lit('effort')} onPress={() => toggleMenu($, 'effort')}>
              <Text color={EFFORT_COLORS[effort] ?? 'subtle'}>{`${effort.toUpperCase()}${MENU}`}</Text>
            </Button>
          )}
          <Text dimColor>│</Text>
          <Button
            key="boost"
            plain
            hover={lit('boost')}
            onPress={() => {
              void toggleAutoBoost($).catch((err: unknown) => {
                $.ui.toast(`Boost did not switch: ${String(err)}`)
              })
            }}
          >
            [BOOST]
          </Button>
          {/* A desktop draws a native button and drops the label's colour, so the state is its own coloured text */}
          <Text key="boost-state" bold color={isAutoBoost() ? 'green' : 'red'}>
            {isAutoBoost() ? '● ON' : '● OFF'}
          </Text>
          <Button key="boost-words" plain hover={lit('boost-words')} onPress={() => toggleMenu($, 'words')}>
            {`${autoMinWords()}+ WORDS${MENU}`}
          </Button>
          <Text dimColor>│</Text>
          <Button
            key="boost-show"
            plain
            hover={lit('boost-show')}
            onPress={() => {
              void toggleShowBoost($).catch((err: unknown) => {
                $.ui.toast(`Prompt did not switch: ${String(err)}`)
              })
            }}
          >
            [PROMPT]
          </Button>
          <Text key="boost-show-state" bold color={isShowBoost() ? 'green' : 'red'}>
            {isShowBoost() ? '● ON' : '● OFF'}
          </Text>
          <Text dimColor>│</Text>
          <Button
            key="compact"
            plain
            hover={lit('compact')}
            onPress={() => {
              void toggleAutoCompact($)
                .then(() => (isAutoCompact() ? armCompact($) : undefined))
                .catch((err: unknown) => {
                  $.ui.toast(`Compact did not switch: ${String(err)}`)
                })
            }}
          >
            [COMPACT]
          </Button>
          <Text key="compact-state" bold color={isAutoCompact() ? 'green' : 'red'}>
            {isAutoCompact() ? '● ON' : '● OFF'}
          </Text>
          <Text dimColor>│</Text>
          <Text color={LABEL_COLOR}>CTX</Text>
          <Text color={ctxColor}>{bar(tokens, limit)}</Text>
          <Text>
            <Text color={ctxColor}>{kTokens(tokens)}</Text>
            <Text dimColor>/{kTokens(limit)}</Text>
          </Text>
          <Button key="limit" plain hover={lit('limit')} onPress={() => toggleMenu($, 'limit')}>
            {`LIMIT ${limitLabel(contextLimit())}${MENU}`}
          </Button>
          <Text dimColor>│</Text>
          <Text>📊</Text>
          {r.windows.map((w, i) => (
            <Text key={w.kind}>
              {i > 0 ? <Text dimColor>· </Text> : null}
              <Text color={LABEL_COLOR}>{w.label} </Text>
              <Text color={usageColor(w.percentUsed)}>{`${Math.round(w.percentUsed)}%`}</Text>
              {w.kind === 'five_hour' || w.kind === 'seven_day' ? (
                <Text>
                  <Text dimColor> ↻ </Text>
                  <Text color={LABEL_COLOR}>{resetLabel(w.resetsAt, now)}</Text>
                </Text>
              ) : null}
            </Text>
          ))}
        </Box>
        {open === undefined ? null : (
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {open === 'limit'
              ? LIMIT_CHOICES.map(tokens => (
                  <Button
                    key={`limit-${tokens}`}
                    onPress={() => {
                      menu = undefined
                      void setContextLimit($, tokens).catch((err: unknown) => {
                        $.ui.toast(`The context limit did not change: ${String(err)}`)
                      })
                    }}
                  >
                    {tokens === contextLimit() ? `${limitLabel(tokens)} ✔` : limitLabel(tokens)}
                  </Button>
                ))
              : open === 'words'
              ? WORD_CHOICES.map(words => (
                  <Button
                    key={`words-${words}`}
                    onPress={() => {
                      menu = undefined
                      void setAutoMinWords($, words).catch((err: unknown) => {
                        $.ui.toast(`The word count did not change: ${String(err)}`)
                      })
                    }}
                  >
                    {words === autoMinWords() ? `${words} ✔` : `${words}`}
                  </Button>
                ))
              : menuOptions(open, model, effort).map(o => (
                  <Button
                    key={`${open}-${o.value}`}
                    onPress={() => {
                      void choose($, open, o.value, isWorking).catch((err: unknown) => {
                        $.ui.toast(`/${open} ${o.value} did not run: ${String(err)}`)
                      })
                    }}
                  >
                    <Text color={open === 'effort' ? (EFFORT_COLORS[o.value] ?? 'subtle') : LABEL_COLOR}>
                      {o.isCurrent ? `${o.label} ✔` : o.label}
                    </Text>
                  </Button>
                ))}
            <Button key="menu-close" role="dismiss" dimColor onPress={() => toggleMenu($, open)}>
              ✕
            </Button>
          </Box>
        )}
      </Box>
    )
  })
}
