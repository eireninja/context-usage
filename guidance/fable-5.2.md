# Boosting for Claude Fable 5.2

Source: Anthropic, "Prompting Claude Fable 5.2", with the 5.2 What's new, migration and model pages and the cross-model "Prompting best practices". Section marks (§) name sections of the distillation these rules were taken from. Items marked (booster rule) are the booster's own, not Anthropic's. Use this file when the target model is Fable 5.2 (or Mythos 5.2, same model). The 5.1 doctrine is not carried: Anthropic replaced the 5.1 autonomy and leave-out sentences with the finishing and ownership guidance, and did not restate the surgical-edit and quotation sentences or the fresh-context verifier finding for 5.2.

## Posture

Fable 5.2 is built for demanding reasoning and long-horizon agentic work: agent sessions that run for hours, multistep research, analysis carried through to a finished document (guide § Model posture). It applies the text it is given closely. Style rules, approval rules, accumulated cautions and what the prompt says about code ownership all change what it does, so every line of a boosted prompt is applied as written (§ Model posture, § Keep caution from piling up). Four 5.2 deltas change the boosted prompt: it can end a long turn early, more often at `low` and `medium` effort; by default it adds to existing structure and reports nearby problems rather than fixing them; it delegates readily when invited; and prompt lines do not turn its thinking down (§ Finish the whole task, § Say who owns the code, § Subagents, § Effort).

## Structure

The shared five-part skeleton, in order: WHY, TASK, DONE WHEN, BOUNDARIES, REPORT (booster rule). WHY carries the reason behind the request in the user's terms, because Claude generalises from an explanation (§ Brief-writing checklist 1, § Cross-model practices).

## Steering and steps

The booster's no-step-list rule holds (booster rule). Where order or completeness genuinely matters, Anthropic's cross-model advice allows numbered steps, and the booster writes them as DONE WHEN criteria or BOUNDARIES (§ Cross-model practices). Every rule in the prompt states its scope and reason; no bare "never" (§ Review instructions written for earlier models).

Never add what the guide says to remove: standing "delegate" lines, a token budget, "answer directly without deliberating" or "treat that answer as done" lines, or hard style limits such as a words-per-sentence cap (§ Review instructions written for earlier models).

## Length and tone of the prompt

Short: five parts, one to three sentences each (booster rule). Two 5.2 additions earn their place: the finishing sentence where early stops are a risk, and the ownership sentence on coding work where restructuring is wanted. Reply length and tone are set by the prompt, not by effort, so a length requirement goes in REPORT (§ Effort).

## Constraints and pause conditions

State the stops once, in BOUNDARIES: input only the user can supply, deliberate blockers, and risky or irreversible actions, which keep their confirmation (§ Finish the whole task).

Where early stops are a risk (agentic work at `low` or `medium` effort, or a kind of run where the user has already seen them), open BOUNDARIES with a finishing sentence that keeps Anthropic's distinction between ordinary obstacles and deliberate blockers (§ Finish the whole task). In the booster's words: "Keep going until the whole task is done. Diagnose ordinary obstacles such as errors, timeouts, locked files, empty results or failing tools, and work through them by retrying, fixing the request or using another tool or source. Leave deliberate blockers alone, such as a file marked do-not-touch or access that was withheld, say what you found, and finish another safe way." Then the stops. Do not reuse the 5.1 autonomy sentence (§ What changed from Fable 5.1, B).

Approval rules name the exact actions that need the user's go-ahead, never a broad category. Name the steps that need none, such as retrying a call that is safe to repeat. When the ask already approves a step, write that exception into the rule itself, not into a separate line (§ Approvals, § Keep caution from piling up).

Code ownership (§ Say who owns the code):
- On the user's own code, where the structure should improve as the work goes, add one sentence: this codebase is yours, its purpose and design are your call, and you will keep building on it. When it is present, DONE WHEN reviews the diff, not only the closing summary, which tends to omit small changes.
- On client code, or any edit that must change as little as possible, leave it out. A scope-limiting line elsewhere does not cancel it.
- Without the sentence the model already reports nearby problems instead of fixing them, so the 5.1 leave-out sentence is not needed (§ What changed from Fable 5.1, B).

## Agentic and delegation behaviour

No "delegate" line by default. The model delegates readily when invited, and subagents can be a large share of a session's cost (§ Subagents). If the ask genuinely wants work fanned out, say so plainly in TASK (§ Cross-model practices). The guide's cost-first wording belongs in the subagent tool's description, changed only if over-delegation persists, not in the prompt (§ Subagents). Expect self-review subagents at `xhigh` and `max` without asking (§ Subagents). Fable 5.2 plans and orchestrates other models well, so where a dispatch fans out, name the subagent model when cost matters (§ Subagents).

Fresh-context verification as a DONE WHEN: the 5.2 material does not restate the 5.1 finding that separate verifiers beat self-critique (§ What changed from Fable 5.1, C). Keep a verifier criterion only where the user's ask requires one (booster rule).

On multi-agent runs or runs that load long notes, keep each caution in the prompt scoped and reasoned. A reviewer's stop condition travels with the context and can hold back routine work (§ Keep caution from piling up).

## Reporting

REPORT asks for a report a low-context reader can follow: key points first, self-contained, plain words in full sentences, no terms invented during the work, prose where ideas connect and bullets for separate items (§ Final reports). Outcome first and unverified work labelled are the booster's skeleton (booster rule). Where the user watches live, also ask for a line before starting and a brief update every few tool calls. On unattended runs the closing recap is what matters (§ Progress updates). Never ask the model to explain or write out its reasoning in the response (§ Safeguards and refusals).

## Effort and reasoning

Effort is an API or agent-frontmatter setting, not a prompt instruction. Do not write "think hard" or "answer directly without deliberating": lines that ask for less thinking are ignored at `medium` and above (§ Effort). Defaults: `high` for hard, agentic or unattended work; `medium` for interactive work; `low` for fast, well-specified subagents; `xhigh` only where a gain has been measured (§ Effort). Early stops are likelier at `low` and `medium`, which is when the finishing sentence matters most (§ Effort, § Finish the whole task).

## Failure modes and the fix

| Failure | Fix in the boosted prompt |
| --- | --- |
| Turn closes on a to-do list, an offer to carry on, or a halt at a timeout | The finishing sentence in BOUNDARIES, then the listed stops (§ Finish the whole task) |
| The go-ahead in a follow-up is a bare "continue" or "go" | Give a specific go-ahead naming the action (§ Approvals) |
| Repeats existing code instead of merging it, reports nearby bugs without fixing | The ownership sentence, on the user's own code only (§ Say who owns the code) |
| Unrequested restructuring, tests or docs in client code | Remove the ownership sentence (§ Say who owns the code) |
| More subagents than the task needs | Remove delegate lines; if it persists, the fix is the subagent tool's description, outside the prompt (§ Subagents) |
| Asks for approvals it does not need, or holds back routine work | Name the no-approval steps, write exceptions into the rule, prune stale cautions (§ Keep caution from piling up) |
| Long silent stretches while the user watches | Ask for a line before starting and an update every few tool calls (§ Progress updates) |
| Final report dense or full of invented labels | The low-context-reader REPORT sentence (§ Final reports) |
| Choppy prose | Remove hard style limits (§ Review instructions written for earlier models) |
| Easy request slow or costly | Lower the effort for that run, not a think-less line (§ Effort) |
| `cyber` refusal on security work | No prompt-side fix in the guide: Fable 5.2 blocks most cybersecurity tasks, and the route is Mythos 5.2 through a verification programme or another model (§ Safeguards and refusals) |
| `reasoning_extraction` refusal | Remove any line asking it to echo, transcribe or explain its reasoning (§ Safeguards and refusals) |

## Multi-hour work

Offer it as a `/goal`: the DONE WHEN list is the goal condition, verbatim (booster rule). Fable 5.2 works well on long asynchronous tasks (§ Progress updates), at `high` effort (§ Effort). Add the finishing sentence where early stops are a risk, as under Constraints (§ Finish the whole task).

## Example

Raw: "go through RAW/ and ingest everything into the wiki, fix anything broken you find, make sure the indexes are good"

Boosted:

> I'm clearing the ingestion backlog so wiki lookups stop missing recent material, and the wiki is only useful once RAW/ is empty. Ingest everything in RAW/ into the wiki, fixing what is genuinely broken in the pages you touch.
>
> Done when: (1) every RAW/ file is ingested or listed with a one-line reason it was skipped; (2) every new or updated page is linked from its section index; (3) every wikilink on a touched page resolves to an existing page.
>
> Boundaries: I am not watching this run, so keep going until RAW/ is done. Diagnose ordinary obstacles such as a failed read, an empty result or a locked file, and work through them. Leave deliberate blockers alone, such as a file marked do-not-touch, and report them. Stop only for a client folder you would have to invent, and ask before anything irreversible, such as deleting a page. Fixes stay within the pages you touch for ingestion, and anything else you notice goes in the report as a follow-up.
>
> Report for a reader who has not seen the run: outcome first, then what went where, what was fixed, and what was skipped and why, in plain full sentences with no labels invented during the work. Mark anything unverified as unverified.

The finishing sentence assumes this ingest runs at `medium` effort or that ingest runs have stopped early before; drop it otherwise (§ Finish the whole task). No ownership sentence (this is wiki work, not code), no delegate line, no "think hard": delegation is the model's call (§ Subagents), and effort is set outside the prompt (§ Effort).
