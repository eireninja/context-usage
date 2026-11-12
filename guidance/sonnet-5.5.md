# Boosting for Claude Sonnet 5.5

Source: Anthropic, "Prompting Claude Sonnet 5.5", what's-new and migration guide, with the retained "Prompting Claude Sonnet 5" patterns (fetched 2026-11-10). Rules marked "carried over" come from the Sonnet 5 page, which Anthropic says remains "a reasonable starting point". Rules marked "adaptation" are this booster's reading: Anthropic ties several fixes to an effort level, which the booster cannot see, so they are triggered here by the kind of task. Use this file when the target model is Sonnet 5.5.

## Posture

Sonnet 5.5 "offers the best combination of speed and intelligence"; for the hardest long-horizon work Anthropic says "an Opus model is the better choice". Sonnet 5 prompts work unchanged. What changes the boosted prompt is scope, in both directions: at lower effort the model "sometimes checks in before the work is done", and at higher effort or on an open-ended request "it can do more than you asked", adding tests, documentation and supporting files. It reads instructions literally (carried over). At low effort it can report a code change as done "without running a check that exercises it". It sometimes answers from training knowledge "when a web search would catch details that have changed". A request to reproduce its reasoning can be refused. The levers are stated scope, a real check on code, and explicit wording.

## Structure

The shared five-part skeleton: WHY, TASK, DONE WHEN, BOUNDARIES, REPORT, as flowing prose. Put the whole spec in one prompt (carried over: "specify the task, intent, and relevant constraints upfront in the first human turn"). State how far each instruction reaches, because the model "does not silently generalize an instruction from one item to another" (carried over): where a rule applies to every file, section or item, write "every". Where the task has several parts, write DONE WHEN as a checklist the report accounts for item by item (booster rule).

Anthropic's Sonnet paragraphs below are written for a system prompt and say "the user". The boosted prompt is the user's own message, so put them in the user's voice ("everything I asked for").

## Steering and steps

No numbered step lists (booster rule; the Sonnet pages are silent on steps).

Do not write "think carefully", "think hard", "think less" or "answer directly". Effort is the thinking control, and "Asking the model in the system prompt to think less doesn't reliably reduce its thinking". One exception, Anthropic's own: when the task is a calculation, a rule to apply or a ranking whose answer must come back as JSON, end the prompt with "Think the problem through before you answer."

Never ask the model to write out, echo or explain its reasoning: such instructions "invite `reasoning_extraction` declines". Ask for "a short explanation of the answer or a summary of the actions taken" where one is wanted.

Never write lines that discourage tool use ("only use tools when strictly necessary", "minimize tool calls") or that hold updates back ("hold all findings for the final response").

State the rules that matter in the prompt itself. Do not rely on "follow the steps in file X" (adaptation: the model is trained to resist instructions that arrive through content it reads during a task).

## Length and tone of the prompt

Keep the prompt short. Sonnet calibrates reply length to the task (carried over), so add a length sentence only when the ask calls for brevity: "Provide concise, focused responses. Skip non-essential context, and keep examples minimal." (carried over).

## Constraints and pause conditions

Choose one scope control by the kind of task (adaptation), and put it in BOUNDARIES:

- **Unattended or multi-part agentic work** (the user is away, or the task has several parts): both of Anthropic's paragraphs. "Keep working until everything the user asked for is done, and only stop to ask when you can't go on without the user or before a risky step." "When the work the user asked for is done and checked, stop and report. Don't add features, tests, files, docs or refactors that weren't asked for. If you think one would help, mention it at the end instead of doing it." Then state the stops the message or the conversation gives, because the paragraph "doesn't replace your own rules about risky or irreversible actions". Add no stop of your own: where the user named none, the paragraph's "before a risky step" is enough.
- **A narrow change where extras are unwelcome:** the second paragraph alone ("When the work the user asked for is done and checked, stop and report. …").
- **An ask for ideas, options or a plan:** "Give me the ideas (or the plan) and stop. Don't start building or changing anything until I say to go ahead." Sonnet 5.5 can start building on an open-ended request.
- **Work the ask wants done with the deepest thoroughness:** "When the work the user asked for is done and its checks pass, stop and report. Don't start extra rounds of review or hardening on your own, and don't launch reviewer sub-agents unless the user asked for a review. If you think a deeper review is worth doing, say so at the end."

When the task changes code that can be run, built or type-checked, add Anthropic's verification paragraph (shortened here), as a DONE WHEN or in BOUNDARIES: "When you change code that can be run, built, or type-checked, run a real check that exercises the change before reporting it done: the project's tests, type-checker, or build, or the changed command itself. A syntax-only check, or a check command that failed to start, does not count. Only if no real check can run here, say which one you did not run and why instead of reporting the change as done." Keep it. Removing verification lines is a rule for other models, not for this one.

When the answer depends on details that change (what is allowed, required or charged, prices, versions) and the session can search, add: "Use the search tool to check specifics that may have changed since your training, such as what is allowed, required or charged, even when you feel confident. For researched work such as a report or a comparison, gather current sources rather than writing from your training knowledge."

## Agentic and delegation behaviour

The Sonnet pages give no delegation rule beyond the reviewer sub-agent sentence above, so write no delegation line unless the ask needs one. For the hardest multi-hour work, do not compensate with a longer prompt; that is a model choice, not a prompt matter.

## Reporting

Where the user follows the work, set the cadence in REPORT, because "The model follows instructions like this": a line on what it is about to do before its first tool call, and a short recap at the end. For multi-part work, the report marks each DONE WHEN item done, or open with its blocker (booster rule). Outcome first.

## Effort and reasoning

Effort is a session or agent setting, not a prompt matter, and its levels are recalibrated from Sonnet 5. Never write an effort level into the prompt as an instruction to the model.

## Specific output kinds

- **Review:** never "only high-severity", "be conservative" or "don't nitpick" (carried over: followed literally, recall falls). Use "Report every issue you find, including ones you are uncertain about or consider low-severity", with a confidence and severity per finding.
- **Frontend or UI:** give a concrete visual spec (palette as hex values, typeface, corner radius, layout), or, where the user is present and the design is open, "Before building, propose 4 distinct visual directions tailored to this brief (each as: bg hex / accent hex / typeface, plus a one-line rationale). Ask the user to pick one, then implement only that direction." Generic lines such as "make it clean and minimal" only move the model to another fixed style (carried over).
- **Dense charts and technical drawings:** ask it to crop or zoom into the image, or run code on it, where the session has such tools.
- **JSON answer to a reasoning task:** the think-first line under Steering.

## Failure modes and the fix

| Failure | Fix in the boosted prompt |
| --- | --- |
| Stops to confirm a plan or asks whether to continue | The keep-working pair in BOUNDARIES, then the stops wanted. |
| Adds tests, docs or files nobody asked for | The stop-and-report paragraph. |
| Starts building when only ideas were wanted | The ideas-first sentence. |
| Runs its own review rounds or reviewer sub-agents | The no-extra-review paragraph. |
| Code change reported done with no test or build run | The verification paragraph. |
| Answers from training knowledge on changeable details | The search sentence; remove any line that discourages tools. |
| Applies a rule to the first item only | State the reach: "every section", "each file". |
| Refusal on a reasoning-reproduction ask | Remove the ask; a short explanation or a summary of actions is fine. |
| Wrong or unparseable JSON on a working-out task | "Think the problem through before you answer." |
| Review misses low-severity bugs | "Report every issue you find"; no severity filter. |
| Generic-looking frontend | A concrete visual spec, or four proposed directions first. |

## Example

Raw: "add a retry to the invoice export so a dropped connection doesn't lose the nightly file, three tries max, keep the csv format as it is, I'm out until three"

Boosted:

> I'm making the nightly invoice export survive a dropped connection, so one failed upload no longer loses that night's file. Add a retry to the invoice export. I'm away until three, so this runs without me.
>
> Done when: (1) a failed upload is retried, with three attempts at most, before the export gives up; (2) the CSV the export writes is unchanged, every column and every row; (3) the project's tests pass, including one that covers a failed upload followed by a success.
>
> Boundaries: keep working until everything I asked for is done, and only stop to ask when you can't go on without me or before a risky step. When the work is done and checked, stop and report. Don't add features, files, docs or refactors I didn't ask for; if you think one would help, mention it at the end. Run a real check that exercises the change before reporting it done. A syntax-only check, or a check that failed to start, does not count, and if no real check can run, say which one you did not run and why.
>
> Report: outcome first, then each of the three items as done or open with its blocker, with the test output that shows it.
