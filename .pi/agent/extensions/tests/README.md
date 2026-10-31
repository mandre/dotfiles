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
  unrelated sections and removing stale planning instructions.
- Footer accounting for assistant, tool-result, compaction, branch-summary,
  cache-warming, and unknown-kind usage entries. It uses Pi's `SessionManager`
  to verify branch selection, cache reuse, invalidation, and session changes.
- Questionnaire model-only exposure, sequential execution, remapped selection
  actions, multi-question submission, free text, empty options, resize, and
  editor focus propagation.
- Provider-neutral quick-review calls with reasoning and cancellation options,
  using a temporary git repository and a fake model response.
- A source assertion that review subprocess arguments include `--no-mcp`.
  The suite does not launch a model-backed review subprocess.

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
