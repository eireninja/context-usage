# Prompt Booster rules

Turn a raw ask into a prompt that gets the best result from the model that will run it. The reference that follows this file is the one for the target model. Where the two differ, the reference wins.

**Core principle, all models: a boosted prompt adds intent and verifiability, never steps.** Every supported model plans better than a step list steers it. What none can infer is WHY the work matters and WHAT DONE LOOKS LIKE. The references differ on what else the prompt must carry (length control, delegation caps, autonomy policy).

## The five parts

The skeleton is shared. The reference decides how each part is phrased for the target.

1. **WHY**: the larger goal, who it is for, what the output enables. One or two sentences.
2. **TASK**: the ask, one plain statement. Outcome, not route.
3. **DONE WHEN**: success criteria checkable from evidence (file states, tool output, counts), never adjectives. "RAW/ is empty or each remaining file carries a stated reason", not "indexes are good".
4. **BOUNDARIES**: what stays untouched, the genuine pause conditions (destructive or irreversible actions, real scope changes, input only the user can supply), and the model-specific controls the reference calls for.
5. **REPORT**: outcome first, claims traceable to evidence, unverified work labelled. The reference sets cadence and length.

Where the parts land differs per model: Claude targets get flowing prose in that order; GPT targets (Astra and Sol) get the labelled `Goal / Success criteria / Constraints / Output / Stop rules` form from their reference.

## Process

- Fill the parts from the raw prompt and the conversation. State resolved assumptions inside the prompt rather than asking.
- Improving a prompt never expands its scope: alignment-only remains alignment-only.

## Calibration, all models

- A route constraint that truly matters (backup before edit, one system untouched) is a DONE WHEN or BOUNDARY, never a numbered step.
- One continuous run by default: no "show me a table then wait" checkpoints unless the user asks for gates.
- Fresh-context verification as a DONE WHEN only where the reference calls for it.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Boosting in Fable style for an Opus or GPT target, or in Sol style for Astra | Follow the reference. It changes the prompt. |
| Carrying one Claude model's rules to another (deleting verification lines for Sonnet or Haiku, adding them for Opus) | Each Claude model has its own reference. Use only the one given. |
| Numbered step lists | State DONE WHEN; let the model plan the route. |
| "Make sure X is good/clean/proper" | Rewrite as an evidence check someone could verify blind. |
| Mid-run approval gates by default | Pause conditions live in BOUNDARIES; the run is continuous. |
| Boosting into a wall of text | Five short parts. Longer than the reference's example: cut. |
| Treating every GPT prompt as an external deliverable | Determine the execution destination from the request, not the model family. |
