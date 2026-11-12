# Boosting for OpenAI GPT-6.1 Sol

Source: OpenAI GPT-6.1 Sol model card, "Using GPT-6", model-selection, reasoning and caching pages, the Codex Models page, plus the GPT-5.6 Sol prompting page as carried doctrine. Names in brackets are sections of the distillation these rules were taken from. Rules marked "carried over" are GPT-5.6 Sol guidance, because OpenAI has published no GPT-6.1 Sol prompting page. Use this file when the target is GPT-6.1 Sol or GPT-6 Luna, and for legacy Sol requests (GPT-6 Sol, GPT-5.6 Sol, Terra), since the carried doctrine is theirs too. OpenAI's GPT-6 family has no Terra tier and no 6.1 Astra, Luna or Terra. Typical case: a prompt for Hermes Agent, Codex on `gpt-6.1-sol`, or an OpenAI-backed n8n node.

## Posture

OpenAI describes GPT-6.1 Sol as "Near-Astra performance for complex work at a lower cost", one tier below GPT-6 Astra [Naming, Model posture]. It publishes no Sol behaviour profile. The behaviour list on the GPT-6 page is Astra's, so do not boost against Astra's failure modes by default [Model posture]. The working doctrine is carried over from GPT-5.6 Sol: define the outcome, the important constraints, the available evidence and the completion bar, then leave the path to the model. A contradiction destabilises it more than a missing detail. Lean prompts scored 10 to 15 percent higher in internal coding-agent eval runs reported on the GPT-5.6 Sol page, at 41 to 66 percent fewer tokens (carried over) [Lean prompts; Contradictions and absolute language].

The largest difference from the Claude targets: this model runs outside the Claude session, so nothing from that session reaches it. Anything the output must honour goes in the prompt, once (carried over from the earlier Sol references).

## Structure

Map the five parts onto OpenAI's suggested skeleton and keep the labels (carried over) [Suggested prompt structure]:

```text
Goal: [WHY + TASK, user-visible outcome]
Success criteria: [DONE WHEN, what must be true before the final answer]
Constraints: [BOUNDARIES: policy, evidence, side-effect limits, instruction precedence]
Tools: [only if the run has tools; which, when, and what not to use]
Output: [REPORT: sections, length, format]
Stop rules: [when to retry, fall back, ask or stop]
```

Add `Role:` and `Personality:` lines only when the prompt is a system prompt for a product, not a one-off task. Keep every section short, with detail only where it changes behaviour (carried over) [Suggested prompt structure].

## Steering and steps

Outcome, not steps. Describe the destination and what good looks like. Do not add process instructions for behaviour the model already performs reliably, or examples that do not change behaviour (carried over) [Outcome-first prompts and stopping conditions; Lean prompts].

Where correctness depends on prerequisite retrieval, say so once: "Before taking an action, resolve required discovery, retrieval, and validation steps. Do not skip a prerequisite because the intended final state seems obvious." (carried over) [Tool routing]

## Length and tone of the prompt

Cut, do not add. State each instruction once, and sweep the finished prompt for contradictions before delivering it (carried over) [Lean prompts; Contradictions and absolute language].

Reserve ALWAYS, NEVER, must and only for true invariants. For judgement calls, write a decision rule instead (carried over) [Contradictions and absolute language]. Do not add "be concise" by reflex. GPT-5.6's conciseness claim does not transfer and GPT-6.1 Sol's default length is undocumented. When a shorter answer is wanted, say what must survive the cut [Length, personality and collaboration style].

## Constraints and pause conditions

One autonomy policy, in one place, stated once (carried over) [Autonomy and approval boundaries]:

```text
For requests to answer, explain, review, diagnose, or plan, inspect the
relevant materials and report the result. Do not implement changes unless
the request also asks for them.
For requests to change, build, or fix, make the requested in-scope local
changes and run relevant non-destructive validation without asking first.
Require confirmation for external writes, destructive actions, purchases,
or a material expansion of scope.
```

Name the safe local actions explicitly. Never repeat "ask first", "do not mutate" or "wait for approval" in several places (carried over) [Autonomy and approval boundaries]. Where a confirmation is needed, have the model finish the authorised work first so approval is the final step on a concrete, reviewable result [Initiative and follow-through]. If a run stops at a plan or an offer to continue, add OpenAI's follow-through line: "Do not stop at acknowledging capability (e.g. "Yes…"), proposing a plan, or offering to continue." It is a family starter prompt for Astra-observed behaviour, so it is a candidate, not a default [Initiative and follow-through].

State instruction precedence in one line whenever the run loads skills or `AGENTS.md` (Hermes does): "The user's instructions take precedence over guidelines provided in a skill. If explicit user instructions conflict with a skill's instructions, prioritize the user's instructions." [Instruction following and skill precedence]

Always include success criteria and a stopping condition (carried over). Stopping condition pattern: "Resolve the request in the fewest useful tool loops, but do not let loop minimization outrank correctness, required evidence, calculations, or required citations. After each result, ask whether the core request can now be answered with useful evidence. If yes, answer. If required evidence is still missing, name the missing fact and use the smallest useful fallback." [Outcome-first prompts and stopping conditions]

## Agentic and delegation behaviour

Expose only task-relevant tools and say when each is used. Parallelise independent reads and keep dependent work sequential. On empty or suspiciously narrow results, try one or two meaningful fallbacks before concluding nothing exists (carried over) [Tool routing].

Coding tasks: name the validation that matters (targeted tests, type or lint checks, build, minimal smoke test) and what to do if it cannot run. Visual artefacts: render and inspect before finalising (carried over) [Validation, coding and frontend]. Add OpenAI's testing-calibration prompt only if a Sol run over-tests small changes [Testing and verification].

Programmatic Tool Calling only for a bounded reduction stage, and only with the stage, eligible tools, output schema, retry limit and stop condition named. "use Programmatic Tool Calling efficiently" does not route (carried over) [Programmatic Tool Calling].

Delegation prompts ("parallelize work by delegating tasks to another agent") only where the harness runs multi-agent, which the API now offers to 6.1 Sol in beta, and a run shows under-delegation [Subagent delegation; API-level controls].

## Reporting

Preamble and cadence (carried over) [Preambles and progress updates]: "Before tool calls for a multi-step task, send a one- or two-sentence user-visible update that states the first step. During the task, update only when a major phase begins or a finding changes the plan." Final answer (carried over) [Length, personality and collaboration style]: "Lead with the conclusion. Include the evidence needed to support it, any material caveat, and the next action. Omit secondary detail and repetition."

Grounding (carried over) [Grounding, citations and retrieval budgets]: define what needs support and what to do when evidence is missing. Absence of evidence is not a factual "no". For research, cite only retrieved sources, label inference separately from supported fact, state conflicts, and narrow the answer rather than guess. For drafting, never invent names, metrics, dates or capabilities to strengthen a draft.

State the report's form (prose or structure) in Output. There is no documented Sol formatting tendency to correct [Personality and writing style].

## Effort and reasoning

`reasoning.effort`, `reasoning.mode: "pro"` and `text.verbosity` are API settings, not prompt text. 6.1 Sol accepts `low`, `medium`, `high`, `xhigh` and `max`, with no `none` or `minimal`. The API default is `medium` and the Codex catalogue default is `low`, so name the effort when the surface matters [API-level controls]. Do not write "use pro mode" [API-level controls] or "think harder" (carried over from the earlier Sol references; effort is the lever). Mid-conversation effort changes go through a `configuration_update` item, not the request-level setting [API-level controls]. Before raising effort to fix a bad output, check the prompt for a missing success criterion, dependency rule, tool-routing rule or verification loop (carried over) [API-level controls].

A prompt that will run through Chat Completions cannot use tools on 6.1 Sol. If the boosted prompt relies on tools, it runs on the Responses API [API-level controls].

## Failure modes and the fix

| Failure | Fix in the boosted prompt |
| --- | --- |
| Unstable or inconsistent behaviour | Find and remove the contradiction; state each rule once. (carried over) |
| Needless approval requests | Single autonomy policy; delete repeated "ask first" (carried over); approval only after the prepared result. |
| Stops at a plan or an offer to continue | Follow-through line from Initiative and follow-through, as a candidate. |
| Pauses or drift caused by a loaded skill | Precedence line; ask it to name the skill file and quote the instruction. |
| Over-literal absolutes | Replace ALWAYS/NEVER on judgement calls with decision rules. (carried over) |
| Too brief or too long | No reflex length instruction; state a cap and what must survive. |
| Runs out of scope | Name the current layer and the scope boundary once. (carried over) |
| Guesses when evidence is thin | Grounding rule plus stopping condition with fallback. (carried over) |
| Regression after a rewrite | Change one thing at a time so the cause is attributable. (carried over) |

## Example

Raw: "get hermes to add a /health endpoint to the command center server and make sure it doesn't break anything"

Boosted:

> Goal: add a `GET /health` endpoint to the Command Center server in `server/` that returns `200 {"status":"ok","uptime":<seconds>}`, so the LXC watchdog can poll it.
>
> Success criteria: the endpoint responds as specified; existing routes and tests are unchanged and pass; the change is limited to the server router and one new test.
>
> Constraints: these instructions take precedence over any skill or `AGENTS.md` you load; if one makes you pause or diverge, name the file and quote the instruction. Read files, edit in-scope server code and run the test suite without asking. Require confirmation before touching config, dependencies or anything outside `server/`, and prepare the change fully before asking. Do not add auth, rate limiting or other features.
>
> Output: a diff summary, the test command run and its result, and any caveat. Lead with whether the criteria are met.
>
> Stop rules: if the test suite cannot run, say why and give the next best check instead of guessing.
