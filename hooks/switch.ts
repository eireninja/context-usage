// The band's model and effort menus: what each lists, and how a pick's output reads

export type Menu = 'model' | 'effort'

export type MenuOption = { value: string; label: string; isCurrent: boolean }

// /model's aliases for the current models, in the order /model lists them
export const MODELS = [
  { alias: 'opus', label: 'OPUS 5.5' },
  { alias: 'fable', label: 'FABLE 5.2' },
  { alias: 'sonnet', label: 'SONNET 5.5' },
  { alias: 'haiku', label: 'HAIKU 5.5' },
] as const

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

// claude-opus-5-5[1m] reads as OPUS 5.5, upper-case as the status bar had it
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return (m && m[1] ? `${m[1]} ${m[2]}.${m[3]}` : id).toUpperCase()
}

export function menuOptions(menu: Menu, model: string, effort: string | undefined): MenuOption[] {
  if (menu === 'model') {
    const current = modelLabel(model)
    return MODELS.map(m => ({ value: m.alias, label: m.label, isCurrent: m.label === current }))
  }
  return EFFORTS.map(level => ({ value: level, label: level.toUpperCase(), isCurrent: level === effort }))
}

// The user settings keys /model and /effort save a pick under
const DEFAULT_KEYS = ['model', 'effortLevel', 'modelSettings'] as const

// The settings text with those keys put back as they were before the command, or undefined when
// the command left them alone. Every other key stays as it is now, so a concurrent edit survives.
export function restoreDefaults(beforeText: string, afterText: string): string | undefined {
  const before = JSON.parse(beforeText) as Record<string, unknown>
  const after = JSON.parse(afterText) as Record<string, unknown>
  const moved = DEFAULT_KEYS.filter(key => JSON.stringify(after[key]) !== JSON.stringify(before[key]))
  if (moved.length === 0) return undefined
  for (const key of moved) {
    if (before[key] === undefined) delete after[key]
    else after[key] = before[key]
  }
  return `${JSON.stringify(after, null, 2)}\n`
}
