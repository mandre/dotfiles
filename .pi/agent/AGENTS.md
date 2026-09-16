# Personal Instructions

## Conversation Conventions

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

## Filesystem Search Hygiene

- Never run `find`, `locate`, or `grep -r`/`grep -R` rooted at `/` or `$HOME`/`~` without a `-maxdepth` (for `find`) or an otherwise narrow starting subdirectory. Whole-home or whole-disk scans are slow, return mostly irrelevant results, and are almost never necessary.
- Before falling back to a broad filesystem search, try targeted lookups first, e.g.:
  - `which <binary>` / checking `$PATH`
  - `npm root -g` (for globally installed npm packages)
  - `go env GOMODCACHE`, `GOPATH`, or checking `go.sum`/`vendor/modules.txt` (for Go dependencies)
  - `pip show <package>` (for Python packages)
  - the sandboxed `find`/`grep` tools, which are scoped to the project cwd and respect `.gitignore` — prefer these over shelling out to `find`/`grep` via `bash` for anything within the current project.
- If a targeted lookup fails and a broader search is genuinely required, scope it as tightly as possible (specific subdirectory, `-maxdepth`, narrow name pattern) rather than defaulting to `/` or `$HOME`.
- For questions about how a pi feature/extension/tool works or where it lives, check the relevant pi doc (e.g. `docs/extensions.md`, `docs/tui.md`) or the fixed well-known path it documents (e.g. `~/.pi/agent/extensions/`) directly, before falling back to `find`/`grep` against the filesystem or grepping compiled/bundled JS.
- A scoped search returning no results does not prove the target doesn't exist: `find` and pi's sandboxed `find` tool (backed by `fd`) do not follow symlinks during traversal by default, and this setup symlinks directories like `~/.pi/agent/extensions` (to `~/dotfiles/...`). Before concluding something doesn't exist, `ls` the immediate parent directory to check for symlinks, and if one is present, retry with `find -L` or `fd --follow` rather than escalating to a wider unscoped search or unrelated workarounds (e.g. grepping bundled/minified JS).

## Git Rules

- Never run `git push` (or any variant like `git push origin`, `git push --force`, etc.) unless the user explicitly asks to push.
- Never use `git add -A`, `git add --all`, `git add .`, or any other form that stages all changes. Always specify files or paths explicitly (e.g., `git add path/to/file.go path/to/other.go`).
- Exception: when vendoring or equivalent (e.g., after `go mod vendor`), you may `git add` the entire vendored directory (e.g., `git add vendor/`).
- Follow the 50/72 rule for commit messages:
  - Subject line: max 50 characters, capitalized, imperative mood, no trailing period.
  - Blank line separating subject from body.
  - Body: wrap lines at 72 characters.
- When a commit message includes links (URLs), use footnote-style references instead of inline URLs:
  - Place a short reference marker in the body text (e.g., `[1]`).
  - List the full URLs at the end of the message body, one per line, matching their markers (e.g., `[1]: https://example.com/...`).
