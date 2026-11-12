# Boosting for OpenAI GPT-6 Astra

Source: OpenAI, "Using GPT-6 Astra", model card and "Prompt engineering", with GPT-5.6 Sol prompt-contract doctrine carried where OpenAI published no Astra restatement. Use this file when the target model is GPT-6 Astra (`gpt-6-astra`). Typical case: a prompt the user will paste into Codex or ChatGPT running Astra, or a direct Responses API call.

## Posture

Astra is OpenAI's most capable and most aligned model. It fills routine gaps from context and asks focused questions when the answer could change the outcome, which means it stops to ask where Sol would have assumed and persisted. It follows long instructions well and is more sensitive to everything in context, including skill files and `AGENTS.md`, so a contradiction now costs an early pause rather than drift. It defaults to lists, tables and recurring phrases, may delegate less than wanted, and tests more thoroughly than small changes need.

As with Sol, this model runs outside the Claude session, so nothing from that session reaches it. Anything the output must honour goes in the prompt, once.

## Structure

Map the five parts onto OpenAI's skeleton and keep the labels:

```text
Goal: [WHY + TASK, user-visible outcome]
Success criteria: [DONE WHEN, what must be true before the final answer]
Constraints: [BOUNDARIES: the autonomy policy, precedence, evidence and side-effect limits]
Tools: [only if the run has tools; which, when, and whether to delegate]
Output: [REPORT: prose form, length, what survives a cut]
Stop rules: [when to retry, fall back, ask or stop]
```

Add `Role:` and `Personality:` only for a product system prompt, not a one-off task. Every section short; detail only where it changes behaviour.

## Steering and steps

Outcome, not steps. Describe the destination and what good looks like; the model plans and tracks its own work. Do not add process instructions for behaviour it already performs reliably.

## Length and tone of the prompt

Cut, do not add. State each instruction once and sweep for contradictions before delivering; Astra's sensitivity to context makes a conflict an early stop. Reserve ALWAYS, NEVER, must and only for true invariants; write decision rules for judgement calls. Do not write "be concise"; say what must survive the cut.

## Constraints and pause conditions

One autonomy policy in Constraints, in OpenAI's Astra form, condensed: infer intent and scope from the prompt and bias towards action; persist until the intended goal is complete; reversible actions, read-only actions, reviews and fixes need no permission; before asking anything, complete the authorised work so the user approves a concrete, reviewable result; confirmation is required only for external writes, destructive or irreversible actions, spend, or a material expansion of scope. Add "Do not introduce unsolicited warnings, disclaimers, approval flows, or safety/compliance checklists due to hypothetical risk" when the task is one Astra might over-caution on.

State precedence once when the run loads skills or an `AGENTS.md`: "The user's instructions take precedence over guidelines provided in a skill." Add the transparency rule when diagnosing pauses: name the exact skill file, quote the instruction, separate requirement from interpretation.

Always include success criteria and a stop rule; both are on the keep-list.

## Agentic and delegation behaviour

If the work divides into independent workstreams, say so and say how much to delegate: "If at any point you can parallelize work by delegating tasks to another agent … you should do so using collaboration tools if it could save time or improve quality." Unsaid, Astra delegates less than wanted. Ask that inter-agent messages and the final answer be legible.

Coding: name the validation that matters and calibrate it: no tests for reversible low-impact changes that mirror the implementation; once required checks pass, broaden or repeat only when new changes or failures justify it. Say what to do if validation cannot run. Visual artefacts: render and inspect before finalising.

## Reporting

Output names prose: "Default to using clear, concise paragraphs, each developing one main idea. Use lists only when the information is genuinely parallel, sequential, or easier to compare." Add OpenAI's slop list when the output is for a reader ("delve", "leverage", "it's worth noting", "Bottom Line:", "This isn't about X. It's about Y.", hyphenated compound descriptors, concluding summary statements). Lead with the conclusion, then the evidence, any material caveat and the next action.

Grounding as for Sol: define what needs support; absence of evidence is not a factual "no"; label inference; never invent names, metrics, dates or capabilities.

## Effort and reasoning

`reasoning.effort` (`low` to `max`, no `none`) is an API setting, not prompt text. Do not write "think harder". Before raising effort to fix a bad output, check the prompt for a missing success criterion, dependency rule or stop rule.

## Failure modes and the fix

| Failure | Fix in the boosted prompt |
| --- | --- |
| Stops to ask where it should have assumed | The bias-to-action policy; "treat 'can you…' as an instruction to do the work". |
| Asks before doing the authorised work | "Complete the work already authorized … the user should be approving a concrete, reviewable result." |
| Pauses citing a skill or AGENTS.md | Precedence sentence; transparency rule to find the offending file. |
| Lists and tables where prose was wanted | The paragraph-first Output sentence. |
| Recurring stock phrases | The slop list. |
| Works serially on parallelisable work | The delegation sentence in Tools. |
| Over-tests a small change | The testing calibration sentence. |
| Unstable behaviour | Find the contradiction; state each rule once. |

## Example

Raw: "get codex to add a /health endpoint to the command center server and make sure it doesn't break anything"

Boosted:

> Goal: add a `GET /health` endpoint to the Command Center server in `server/` returning `200 {"status":"ok","uptime":<seconds>}`, so the LXC watchdog can poll it.
>
> Success criteria: the endpoint responds as specified; existing routes and tests are unchanged and pass; the change is limited to the server router and one focused test.
>
> Constraints: infer scope from this request and carry it to completion. Read files, edit in-scope server code and run the test suite without asking. Before asking me anything, finish the work so I am approving a concrete diff. Confirmation is needed only before touching config, dependencies or anything outside `server/`. Do not add auth, rate limiting or other features, and no disclaimers about hypothetical risk.
>
> Output: paragraphs, no tables. Lead with whether the criteria are met, then the diff summary, the test command run and its result, and any caveat.
>
> Stop rules: if the test suite cannot run, say why and give the next best check instead of guessing.
