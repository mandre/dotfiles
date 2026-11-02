# Extension compatibility tests

Run from the repository root:

```sh
node .pi/agent/extensions/tests/run-tests.mjs
python3 .pi/agent/extensions/tests/pty-smoke.py
```

Both runners use the current managed Pi release. To test another installation,
set `PI_TEST_PACKAGE_ROOT` to the directory containing the installed
`@earendil-works/pi-coding-agent/package.json`.

## Automated coverage

The Node runner includes the plan-mode utility and handler suites, then loads
all four extensions through Pi's real extension loader. It checks:

- Direct and nested tool-call gating, including unapproved deferred/MCP tools,
  Bash validation, tool restoration, and headless modes.
- Structured prompt sections for user and custom-message runs, preserving
  unrelated sections and removing stale planning/execution instructions.
- Reconciliation entry composition across multiple extensions through Pi's real
  boundary runner, preserving earlier drafts.
- Append-only execution snapshots and progress-tool results, preserving separate
  prompt/tool transitions across repeated real-runner context transforms.
- Settlement-aware extraction, deferred notices, incomplete replies, failure and
  cancellation paths, queued work, and continuations requested by later handlers.
  Lifecycle tests drive events without live retries or provider requests.
- Footer accounting for assistant, tool-result, compaction, branch-summary,
  cache-warming, and unknown-kind usage entries. It uses Pi's `SessionManager`
  to verify branch selection, cache reuse, invalidation, and session changes.
- Questionnaire model-only exposure, sequential execution, remapped selection
  actions and injected key hints across options/editor/submit views,
  multi-question submission, free text, empty options, resize, and editor focus
  propagation. Inline dialogs declare blocked-question metadata and release
  abort listeners after submission, cancellation, and abort.
- Real tool-argument validation for questionnaire, plan-progress, and review
  schemas, including argument preparation, numeric strings, integer truncation,
  singleton arrays, optional nulls, invalid inputs, and stored-call immutability.
- Provider-neutral quick-review calls with reasoning and cancellation options,
  using a temporary git repository and a fake model response.
- Generated review guard loading and real-runner rejection of unknown tools,
  including nested and deferred calls; large-output spilling and retrieval.
- Review cancellation and shutdown, abort-listener cleanup, forced termination
  of a real SIGTERM-ignoring child, and rejection of concurrent command reviews.
- A fixture-driven review subprocess, without model requests: selected tools,
  multi-block final answers, nested usage and temporary prompt cleanup.
- Repository identity checks and refreshed PR refs using mocked CLI responses.
- Questionnaire invalid IDs, impossible questions, abort handling, tiny widths,
  bounded terminal height, selection-following and manual viewport scrolling.
- Effective context limits, persisted command-review usage, home-path boundaries
  and right-prioritized narrow footer layouts.

The plan utility tests use table-driven cases for the conservative shell subset.
Old expectations admitting interpreters, test runners, downloads and temporary
output writes have been replaced with explicit rejection cases. The suites do
not make live model requests or fetch remote PRs. Context tests assert transcript
structure; they do not measure provider cache hits, latency, or cost savings.

## Terminal smoke tests

The Python runner requires Linux/Unix PTYs and Python's standard library. It
launches the real CLI in both regular and fullscreen modes, loading the footer,
plan-mode, review, and questionnaire code. A test-only `/smoke` command checks
option selection and free-text answers, including a terminal resize. Each
process must shut down successfully after validating the answers.

The terminal fixture is loaded explicitly, not discovered during normal Pi
startup. Tests use temporary working/config directories, ephemeral sessions,
offline mode, and no model requests. They do not change personal settings or
reload the running Pi session.

PTY tests validate input/rendering lifecycle behavior, not visual appearance or
IME integration. For a visual check after `/reload`, inspect narrow layouts,
remapped key hints, theme changes, and IME candidate placement in both modes.
