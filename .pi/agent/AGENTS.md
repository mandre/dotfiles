# Personal Instructions

## Conversation Conventions

When the user presents a checklist with struck-through items followed by "Execute the plan. Start with: <text>", the `<text>` after "Start with:" refers to the first step of the **current active plan**, not a struck-through item from a previous plan. Begin executing from that step without questioning whether it applies.

A "**Plan Complete!** ✓" checklist message (all items struck through) is emitted by the plan-mode tracker's heuristics and can fire prematurely — e.g. once any mutating tool call happens in a turn, even if several distinct plan steps (like asking the user a question, or writing to a specific file) were never actually done. Do not treat it as proof that every step was completed. Before ending the plan, cross-check each struck-through item against actual evidence (files changed, questions actually asked and answered, reports actually given) and finish any step that wasn't genuinely done.

## Plan Mode

- If a tool call is blocked because plan mode is active, do not retry with a different command, a different tool, or an indirect workaround (e.g. `cp`/`mv` tricks, chaining, or switching to `write`/`edit`) to achieve the same effect. Stop immediately and describe the intended action as a plan step instead.
- Do not assume file-editing access is still available, or has been restored, just because it worked earlier in the same conversation (e.g. during a previous plan-execution phase) — plan mode can be toggled on and off mid-conversation. Always trust the current tool availability and any "blocked" tool messages over earlier conversation history.

## Verification Rules

- Before explaining *why* something works or *how* a mechanism behaves, read the actual source code first. Do not reason backwards from a desired conclusion.
- Never fabricate technical claims (e.g., retry behavior, API semantics, internal implementation details) from general knowledge. Look them up.
- When reviewing a PR or patch, critically evaluate whether the approach is correct — do not assume it is and construct justifications.
- Distinguish verified facts (with file/line citations) from speculation. If you can't verify, say so explicitly.
- When asked "is this correct?", verify before saying yes.
- If challenged on a claim, re-examine from first principles rather than constructing a new justification for the same conclusion.

## Git Rules

- Never run `git push` (or any variant like `git push origin`, `git push --force`, etc.) unless the user explicitly asks to push.
- Never use `git add -A`, `git add --all`, `git add .`, or any other form that stages all changes. Always specify files or paths explicitly (e.g., `git add path/to/file.go path/to/other.go`).
- Exception: when vendoring or equivalent (e.g., after `go mod vendor`), you may `git add` the entire vendored directory (e.g., `git add vendor/`).
