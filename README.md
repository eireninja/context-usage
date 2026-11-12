# context-usage: a mod for Claude Code

A status band above the prompt box, a prompt booster, and a context-limit helper, in one mod.

## What it does

- **Band:** shows the folder, the model and the effort level (click either to change it for this session), how full the context is against a limit you pick, and your 5-hour and weekly usage windows.
- **BOOST:** rewrites a typed prompt for the model that will run it before the session reads it. The rewrite is done by Claude Opus 5.5 at medium effort from the mod's own guidance files, one per target model: Claude Fable 5.2, Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5, GPT-6 Astra and GPT-6.1 Sol. The target is the session's own model unless the ask names another ("boost this for sonnet").
  - Switch BOOST on and every prompt of 40 words or more is boosted. Click the word count to change it.
  - With BOOST off, end a message with "improve this prompt" or start it with "boost:" to boost that one.
  - PROMPT on: the boosted prompt replaces your message in the transcript. PROMPT off: your message stays as typed and the model is handed the boosted version beside it.
- **COMPACT:** 50K tokens before the limit a toast warns you. At the limit, `/compact` with a prompt built from the session is put in your prompt box for you to send. It never overwrites a draft and never compacts by itself. Switch COMPACT off to stop it.
- **`/ctx`:** prints the context and usage figures.

## Requirements

- Claude Code with mod support (plugins that carry a hooks module). It is in daily use in the Claude desktop app on macOS, and its tests were run with the Claude Code 2.1.314 command line. It has not been run in a terminal session, on Windows or on Linux, and an older build may not load it.
- An account that can call Claude Opus 5.5, which does the boosting. Each boost is one Opus call at medium effort on your account and counts against your Opus usage. To use a cheaper model, change `BOOST_MODEL` in `hooks/boost.ts`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install context-usage --marketplace eireninja/context-usage
```

Answer `y` to add the marketplace, then pick a scope. From a shell, the same thing is:

```bash
claude plugin install context-usage --marketplace eireninja/context-usage
```

In the Claude desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, then Add marketplace with `eireninja/context-usage`, then Add plugin.

Then restart Claude Code, or run `/reload-plugins` in a terminal session. The band appears above the prompt box, and `/ctx` prints the context and usage figures.

### Install from a copy of this folder

This is how the mod's author runs it, and it needs no GitHub access once you have the files.

1. Clone or download this repository to `~/.claude/mods/context-usage`. If that folder already exists, stop and decide what to do with it first.
2. Open `~/.claude/settings.json`. If the file is missing, create it holding `{}`. Keep everything already in it.
3. In its `env` block (add the block if there is none), set `CLAUDE_CODE_PLUGIN_DIRS` so that it includes `~/.claude/mods/context-usage`. If the key already has a value, keep it and add this path after a `:` on macOS and Linux, or a `;` on Windows.
4. Restart Claude Code.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/context-usage"
  }
}
```

To try it for one terminal session without installing:

```bash
claude --plugin-dir ~/.claude/mods/context-usage
```

## What it reads, writes and calls

Everything is under `~/.claude` or in the mod's own folder. It works from any folder Claude is started in and reads no project file.

- Writes `~/.claude/usage-limits.json`, a small file of your usage windows, each time a figure moves.
- Reads `~/.claude/settings.json`. After you pick a model or effort level on the band, it puts the `model`, `effortLevel` and `modelSettings` keys back as they were, so a pick lasts for the session and does not become your default.
- Reads `~/.claude/sessions/*.json` to find the running session's effort level.
- Calls `https://api.anthropic.com/api/oauth/usage` with the session's own sign-in to read your usage windows. Nothing else leaves the machine except the Opus calls for boosts.
- Keeps its switches (BOOST, PROMPT, COMPACT, the word count and the context limit) in the mod's own store, shared by every session.
- It does not change Claude Code's own `autoCompactEnabled` setting.

## Remove it

Uninstall the plugin, or, for a folder install, take the path out of `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` and delete the folder. Then restart Claude Code. `~/.claude/usage-limits.json` can be deleted too.

## Layout

- `hooks/register.tsx`: the band and every hook. `hooks/boost.ts`: the booster. `hooks/compact.ts`: the context limit and the compaction prompt. `hooks/usage.ts`, `hooks/watch.ts`, `hooks/switch.ts`: usage windows and the model and effort menus.
- `guidance/`: the booster's rules as plain text. `core.md` applies to every target, and each other file is the reference for one model, with its sources named at the top.
- `tests/`: the mod's tests.

## Changing it

- `claude plugin test <folder>` runs the tests.
- `claude plugin validate <folder>` checks the manifest and the hooks module.
- The type check (`tsc -p <folder>`) works only after Claude Code has loaded the mod once, because the engine writes the types into `.claude-plugin/types/` on load. That folder is not in the repository.
- After editing a file in `guidance/`, run `python3 tests/snapshot-guidance.py` so the tests read the new text.

## Known limits

- In the desktop app a mod cannot start a compaction itself, which is why COMPACT fills the prompt box and leaves the sending to you.
- A session model with no guidance file of its own is boosted with the Opus 5.5 rules, and the toast says so.
- The guidance files are the author's own distillations of Anthropic's and OpenAI's published prompting pages, with short quotes from them. They are not official documents, and they date from November 2026.

## Licence

MIT. See [LICENSE](LICENSE). The quotes from Anthropic's and OpenAI's published pages inside `guidance/` remain theirs.
