# Boosting for Claude Fable 5.1

Source: Anthropic, "Prompting Claude Fable 5.1", with the retained "Prompting Claude Fable 5" patterns. The `/goal` offer is the booster's own addition, layered on Anthropic's long-horizon claim. Use this file when the target model is Fable 5.1 (or Mythos 5.1, same model).

## Posture

Fable 5.1 "can execute very long tasks without much guidance on methodology, especially when the goal is clear." Anthropic states Fable 5 prompts perform well on it unchanged, so the Fable 5 posture holds: it plans better than a step list steers it, and what it cannot infer is why the work matters and what done looks like. Three 5.1 deltas change the boosted prompt: it narrates less while working, it may end a long asynchronous turn on a stated next step or a permission request for work already authorised, and on open tasks it adds nearby fixes and extra tests unless told what to leave out.

## Structure

The shared five-part skeleton, in order: WHY, TASK, DONE WHEN, BOUNDARIES, REPORT. Open with WHY in the guide's verbatim pattern: "I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request]."

## Steering and steps

Never a numbered step list. A route constraint that matters becomes a DONE WHEN criterion or a BOUNDARY. Prompts and skills written for earlier models are often too prescriptive and degrade output; cut rather than carry.

## Length and tone of the prompt

Short. Five parts, one to three sentences each. Brief instructions steer this model; walls of text dilute them. One 5.1 addition is allowed and earns its place on any asynchronous run: the autonomy sentence below.

## Constraints and pause conditions

State pause conditions once, in BOUNDARIES, in the guide's form: destructive or irreversible actions, real scope changes, input only the user can supply. For work the user will not watch, open BOUNDARIES with the guide's sentence, kept as written: "You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work." Then the stops.

For open-ended tasks add what to leave out, in one sentence: pre-existing bugs and nearby improvements are reported as follow-ups, not fixed; an ambiguous point takes the most direct reading, stated as an assumption; no extra permanent test files. For narrow tasks the Fable 5 sentence still serves: no features, refactors or abstractions beyond the task, validate only at system boundaries.

## Agentic and delegation behaviour

Fable 5.1 dispatches subagents dependably and works on while they run. For sizeable work the prompt may say "delegate independent subtasks and keep working while they run; intervene if a subagent drifts". No cap by default.

Significant builds get a DONE WHEN criterion requiring fresh-context verification by a verifier subagent; separate verifiers outperform self-critique on this model.

When the worker edits files, one BOUNDARY sentence: surgically edit rather than rewrite the file when the result is the same. For research or summary prompts, one REPORT sentence: reproduced source wording is marked as a quotation.

## Reporting

Ask for the recap explicitly; 5.1 writes less between tool calls and its final message may cover only the last step. REPORT slot, near-verbatim from the guide: lead with the outcome; audit each claim against a tool result from this session; label unverified work as unverified; report failing tests with output and skipped steps as skipped; close with a recap a reader who saw nothing else can act on. Never write "hold findings for the final response".

## Effort and reasoning

Effort is an API or agent-frontmatter setting, not a prompt instruction. Do not write "think hard". At `low` the model searches less and answers from memory more, so research prompts destined for a low-effort run say to search names as written. Never instruct the model to echo, transcribe or explain its reasoning: the refusal categories are unchanged from Fable 5 and fall back to a weaker model.

## Failure modes and the fix

| Failure | Fix in the boosted prompt |
| --- | --- |
| Turn ends on "Next, I'll…" or "Shall I apply this?" | The autonomy sentence in BOUNDARIES, kept as written, then the listed stops. |
| Final message covers only the last step | REPORT asks for the standalone recap; delete any hold-findings line. |
| Nearby fixes and extra test files appear | The leave-out sentence for open-ended tasks. |
| Whole file rewritten for a small change | The surgical-edit sentence. |
| Summary reproduces source text unmarked | The quotation sentence in REPORT. |
| Overplanning on an ambiguous task | "When you have enough information to act, act. Give a recommendation, not a survey." |
| Fabricated progress claims | The REPORT slot above. |
| Safety classifier trips on benign security or bio work | Fewer than on Fable 5, and finding vulnerabilities in code is permitted; state the legitimate context in WHY. |

## Multi-hour work

Offer it as a `/goal`: the DONE WHEN list is the goal condition, verbatim. Fable 5.1 holds a goal-directed run for hours; the autonomy sentence keeps it from ending early.

## Example

Raw: "go through RAW/ and ingest everything into the wiki, fix anything broken you find, make sure the indexes are good"

Boosted:

> I'm clearing the ingestion backlog so wiki lookups stop missing recent material. The wiki is only useful if RAW/ is empty. Ingest everything in RAW/ into the wiki, fixing what is genuinely broken as you touch it.
>
> Done when: (1) every RAW/ file is ingested or listed with a one-line reason it was skipped; (2) every new or updated page is linked from its section index; (3) every wikilink on a touched page resolves to an existing page.
>
> Boundaries: you are operating autonomously and I am not watching, so proceed on everything reversible here and stop only for a client folder you would have to invent. Fixes stay within pages you touched for ingestion; anything else you notice goes in the report as a follow-up. Edit pages surgically rather than rewriting them.
>
> Report outcome-first: what went where, what was fixed, what was skipped and why, each claim traceable to this session's tool results, closing with a recap I can act on without reading the run.

No routing table, no frontmatter spec, no wikilink format: a boosted prompt carries intent and checks, not house rules.
