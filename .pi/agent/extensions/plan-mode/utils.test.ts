import { extractDoneSteps, extractNaturalDoneSteps, extractTodoItems, markCompletedSteps, cleanStepText, isSafeCommand, normalizeCommand, type TodoItem } from "./utils.js";

// Simple test runner
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${message}`);
	}
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${message}\n  expected: ${e}\n  actual:   ${a}`);
	}
}

// --- extractDoneSteps ---

assertDeepEqual(extractDoneSteps("I completed the task [DONE:1]"), [1], "extractDoneSteps: basic [DONE:1]");
assertDeepEqual(extractDoneSteps("[DONE:3] and [DONE:5]"), [3, 5], "extractDoneSteps: multiple markers");
assertDeepEqual(extractDoneSteps("[done:2]"), [2], "extractDoneSteps: case insensitive");
assertDeepEqual(extractDoneSteps("No markers here"), [], "extractDoneSteps: no markers");
assertDeepEqual(extractDoneSteps("[DONE:0]"), [0], "extractDoneSteps: step 0");

// --- extractNaturalDoneSteps ---

assertDeepEqual(extractNaturalDoneSteps("✅ Step 1"), [1], "natural: checkmark step");
assertDeepEqual(extractNaturalDoneSteps("✅ 3"), [3], "natural: checkmark number only");
assertDeepEqual(extractNaturalDoneSteps("Step 2 is done"), [2], "natural: step N is done");
assertDeepEqual(extractNaturalDoneSteps("Step 4 completed"), [4], "natural: step N completed");
assertDeepEqual(extractNaturalDoneSteps("completed step 5"), [5], "natural: completed step N");
assertDeepEqual(extractNaturalDoneSteps("Finished step 3"), [3], "natural: finished step N");
assertDeepEqual(extractNaturalDoneSteps("Done with step 7"), [7], "natural: done with step N");
assertDeepEqual(extractNaturalDoneSteps("## Step 2: Update the config"), [2], "natural: markdown heading step");
assertDeepEqual(extractNaturalDoneSteps("### Step 1 - Fix the bug"), [1], "natural: heading with dash");
assertDeepEqual(extractNaturalDoneSteps("Step 2 is done and step 3 completed"), [2, 3], "natural: multiple matches");
assertDeepEqual(extractNaturalDoneSteps("No step info here"), [], "natural: no matches");
assertDeepEqual(
	extractNaturalDoneSteps("✅ Step 1 and step 1 is done"),
	[1],
	"natural: deduplicates same step"
);

// --- extractTodoItems (step number preservation) ---

{
	const plan = `Here is my analysis.

**Plan:**
1. Fix the bug in parser
2. Update the tests
3. Add documentation
`;
	const items = extractTodoItems(plan);
	assert(items.length === 3, "extractTodoItems: extracts 3 items");
	assertDeepEqual(items.map((i) => i.step), [1, 2, 3], "extractTodoItems: preserves step numbers 1,2,3");
}

{
	// When items get filtered, step numbers should still match original
	const plan = `**Plan:**
1. First real step here
2. \`x\`
3. Third step description
4. -
5. Fifth step description
`;
	const items = extractTodoItems(plan);
	// Items 2 and 4 should be filtered (backtick, dash, too short)
	assert(items.length === 3, `extractTodoItems filtered: expected 3 items, got ${items.length}`);
	assertDeepEqual(
		items.map((i) => i.step),
		[1, 3, 5],
		"extractTodoItems filtered: preserves original step numbers [1, 3, 5]"
	);
}

// --- markCompletedSteps (combined detection) ---

{
	const items: TodoItem[] = [
		{ step: 1, text: "Fix the bug", completed: false },
		{ step: 2, text: "Update tests", completed: false },
		{ step: 3, text: "Add docs", completed: false },
	];
	const marked = markCompletedSteps("[DONE:1] and step 3 is done", items);
	assert(marked === 2, `markCompletedSteps combined: expected 2 marked, got ${marked}`);
	assert(items[0].completed === true, "markCompletedSteps combined: step 1 completed via [DONE:1]");
	assert(items[1].completed === false, "markCompletedSteps combined: step 2 still incomplete");
	assert(items[2].completed === true, "markCompletedSteps combined: step 3 completed via natural");
}

{
	// Already-completed items should not be double-counted
	const items: TodoItem[] = [
		{ step: 1, text: "Fix the bug", completed: true },
		{ step: 2, text: "Update tests", completed: false },
	];
	const marked = markCompletedSteps("[DONE:1] [DONE:2]", items);
	assert(marked === 1, `markCompletedSteps already done: expected 1 newly marked, got ${marked}`);
	assert(items[1].completed === true, "markCompletedSteps already done: step 2 now completed");
}

{
	// Step number mismatch: [DONE:4] with no step 4 in items
	const items: TodoItem[] = [
		{ step: 1, text: "First", completed: false },
		{ step: 3, text: "Third", completed: false },
	];
	const marked = markCompletedSteps("[DONE:4]", items);
	assert(marked === 0, "markCompletedSteps mismatch: no step 4, nothing marked");
	assert(items[0].completed === false, "markCompletedSteps mismatch: step 1 unchanged");
	assert(items[1].completed === false, "markCompletedSteps mismatch: step 3 unchanged");
}

// --- cleanStepText ---

assert(cleanStepText("**Bold text**") === "Bold text", "cleanStepText: removes bold");
assert(cleanStepText("`code`") === "Code", "cleanStepText: removes backticks, capitalizes");
assert(cleanStepText("Update the configuration file") === "Configuration file", "cleanStepText: strips action prefix");
assert(
	cleanStepText("A very long step description that exceeds the character limit by quite a bit and keeps going on and on to make absolutely sure we exceed the one hundred and twenty character truncation threshold").length === 120,
	"cleanStepText: truncates to 120 chars"
);

// --- isSafeCommand: gws read-only commands ---

// Safe gws commands
assert(isSafeCommand("gws --help"), "gws: top-level --help is safe");
assert(isSafeCommand("gws sheets --help"), "gws: service-level --help is safe");
assert(isSafeCommand("gws drive -h"), "gws: service-level -h is safe");
assert(isSafeCommand("gws schema docs.documents.get"), "gws: schema introspection is safe");
assert(isSafeCommand("gws sheets +read --spreadsheet ID --range \"Sheet1!A1:D10\""), "gws: sheets +read is safe");
assert(isSafeCommand('gws docs documents get --params \'{"documentId":"abc"}\''), "gws: docs documents get is safe");
assert(isSafeCommand('gws drive files list --params \'{"pageSize": 5}\''), "gws: drive files list is safe");
assert(isSafeCommand("gws drive files export --params '{\"fileId\":\"abc\"}'"), "gws: drive files export is safe");
assert(isSafeCommand("gws drive files download --params '{\"fileId\":\"abc\"}'"), "gws: drive files download is safe");
assert(isSafeCommand("gws sheets spreadsheets get --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets spreadsheets get is safe");
assert(isSafeCommand("gws slides presentations get --params '{\"presentationId\":\"abc\"}'"), "gws: slides presentations get is safe");
assert(isSafeCommand("gws drive about get --params '{\"fields\":\"*\"}'"), "gws: drive about get is safe");
assert(isSafeCommand("gws drive drives list"), "gws: drive drives list is safe");
assert(isSafeCommand("gws drive files listLabels --params '{\"fileId\":\"abc\"}'"), "gws: drive files listLabels is safe");
assert(isSafeCommand("gws drive files generateIds"), "gws: drive files generateIds is safe");
assert(isSafeCommand("gws sheets spreadsheets getByDataFilter --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets getByDataFilter is safe");
assert(isSafeCommand("gws drive changes getStartPageToken"), "gws: drive changes getStartPageToken is safe");
assert(isSafeCommand("gws drive permissions list --params '{\"fileId\":\"abc\"}'"), "gws: drive permissions list is safe");
assert(isSafeCommand("gws drive comments list --params '{\"fileId\":\"abc\",\"fields\":\"*\"}'"), "gws: drive comments list is safe");

// Destructive gws commands (must be blocked)
assert(!isSafeCommand("gws sheets +append --spreadsheet ID --range Sheet1 --json '{\"values\": [[\"a\"]]}'"), "gws: sheets +append is blocked");
assert(!isSafeCommand("gws docs +write --document ID --text 'hello'"), "gws: docs +write is blocked");
assert(!isSafeCommand("gws docs documents create --json '{\"title\":\"New Doc\"}'"), "gws: docs documents create is blocked");
assert(!isSafeCommand("gws sheets spreadsheets batchUpdate --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets batchUpdate is blocked");
assert(!isSafeCommand("gws drive files update --params '{\"fileId\":\"abc\"}'"), "gws: drive files update is blocked");
assert(!isSafeCommand("gws drive files delete --params '{\"fileId\":\"abc\"}'"), "gws: drive files delete is blocked");
assert(!isSafeCommand("gws drive files copy --params '{\"fileId\":\"abc\"}'"), "gws: drive files copy is blocked");
assert(!isSafeCommand("gws drive files modifyLabels --params '{\"fileId\":\"abc\"}'"), "gws: drive files modifyLabels is blocked");
assert(!isSafeCommand("gws drive accessproposals resolve --params '{\"fileId\":\"abc\"}'"), "gws: drive accessproposals resolve is blocked");
assert(!isSafeCommand("gws slides presentations create --json '{\"title\":\"New\"}'"), "gws: slides presentations create is blocked");
assert(!isSafeCommand("gws docs documents batchUpdate --params '{\"documentId\":\"abc\"}'"), "gws: docs batchUpdate is blocked");
assert(!isSafeCommand("gws drive drives create --params '{\"requestId\":\"abc\"}'"), "gws: drive drives create is blocked");
assert(!isSafeCommand("gws drive permissions delete --params '{\"fileId\":\"abc\"}'"), "gws: drive permissions delete is blocked");
assert(!isSafeCommand("gws drive drives hide --params '{\"driveId\":\"abc\"}'"), "gws: drive drives hide is blocked");
assert(!isSafeCommand("gws drive channels stop --json '{\"id\":\"abc\"}'"), "gws: drive channels stop is blocked");

// --- normalizeCommand ---

assert(normalizeCommand("git log") === "git log", "normalize: no-op for simple command");
assert(normalizeCommand("cd /path && git log") === "git log", "normalize: strips cd prefix");
assert(normalizeCommand("cd /path && cd /other && git log") === "git log", "normalize: strips multiple cd prefixes");
assert(normalizeCommand('cd "/path with spaces" && git log') === "git log", "normalize: strips quoted cd path");
assert(normalizeCommand("cd /path; git log") === "git log", "normalize: strips cd with semicolon");
assert(normalizeCommand("# comment\ngit log") === "git log", "normalize: strips comment lines");
assert(normalizeCommand("# comment 1\n# comment 2\ngit log") === "git log", "normalize: strips multiple comment lines");
assert(normalizeCommand("/usr/bin/curl -s https://example.com") === "curl -s https://example.com", "normalize: strips /usr/bin/ prefix");
assert(normalizeCommand("/usr/local/bin/python3 -c 'print(1)'") === "python3 -c 'print(1)'", "normalize: strips /usr/local/bin/ prefix");
assert(normalizeCommand("/usr/sbin/ip addr") === "ip addr", "normalize: strips /usr/sbin/ prefix");

// --- isSafeCommand: --help override ---

assert(isSafeCommand("acli jira workitem create --help"), "help: acli destructive with --help is safe");
assert(isSafeCommand("acli jira workitem edit --help 2>&1"), "help: acli edit --help is safe");
assert(isSafeCommand("acli jira workitem delete --help"), "help: acli delete --help is safe");
assert(isSafeCommand("acli jira workitem transition --help"), "help: acli transition --help is safe");
assert(isSafeCommand("acli jira workitem comment create --help"), "help: acli comment create --help is safe");
assert(isSafeCommand("acli jira workitem link create --help"), "help: acli link create --help is safe");
assert(isSafeCommand("acli jira workitem clone --help"), "help: acli clone --help is safe");
assert(isSafeCommand("acli jira workitem assign --help"), "help: acli assign --help is safe");
assert(isSafeCommand("gh pr merge --help"), "help: gh pr merge --help is safe");
assert(isSafeCommand("gh repo delete --help"), "help: gh repo delete --help is safe");
assert(isSafeCommand("rm --help"), "help: rm --help is safe");

// --- isSafeCommand: cd prefix normalization ---

assert(isSafeCommand("cd /home/user/project && git log --oneline -5"), "cd: git log with cd prefix");
assert(isSafeCommand("cd /home/user/project && git diff --name-only HEAD~1"), "cd: git diff with cd prefix");
assert(isSafeCommand("cd /home/user/project && git branch --show-current"), "cd: git branch with cd prefix");
assert(isSafeCommand("cd /home/user/project && git remote -v"), "cd: git remote with cd prefix");
assert(isSafeCommand("cd /home/user/project && grep -r 'pattern' src/"), "cd: grep with cd prefix");
assert(isSafeCommand("cd /home/user/project && ls -la"), "cd: ls with cd prefix");
assert(isSafeCommand("cd /home/user/project && curl -s https://example.com"), "cd: curl with cd prefix");
assert(isSafeCommand("cd /home/user/project && acli jira workitem search --jql 'project = FOO'"), "cd: acli search with cd prefix");
assert(isSafeCommand("cd /home/user/project && gws sheets +read --spreadsheet ID --range Sheet1"), "cd: gws +read with cd prefix");
assert(!isSafeCommand("cd /tmp && rm -rf /"), "cd: destructive command with cd prefix still blocked");
assert(!isSafeCommand("cd /path && git push origin main"), "cd: git push with cd prefix still blocked");

// --- isSafeCommand: comment prefix ---

assert(isSafeCommand("# Check something\ncurl -s https://example.com"), "comment: curl with comment prefix");
assert(isSafeCommand("# First comment\n# Second comment\ngit log --oneline"), "comment: multiple comment lines");
assert(isSafeCommand("# Would tier 1 find it?\nacli jira workitem search --jql 'project = FOO'"), "comment: acli with comment prefix");

// --- isSafeCommand: absolute paths ---

assert(isSafeCommand("/usr/bin/curl -s https://example.com"), "abspath: /usr/bin/curl");
assert(isSafeCommand("/usr/local/bin/python3 --version"), "abspath: /usr/local/bin/python3");

// --- isSafeCommand: git -C / --no-pager ---

assert(isSafeCommand("git -C /home/user/project log --oneline -20"), "git: -C with log");
assert(isSafeCommand("git -C /path diff --stat"), "git: -C with diff");
assert(isSafeCommand("git --no-pager log --oneline"), "git: --no-pager with log");
assert(isSafeCommand("git -C /path --no-pager log --oneline"), "git: -C and --no-pager");
assert(isSafeCommand("git -C /path branch --show-current"), "git: -C with branch");
assert(isSafeCommand("git -C /path ls-files"), "git: -C with ls-files");
assert(isSafeCommand("git --no-pager diff HEAD~1"), "git: --no-pager with diff");
assert(!isSafeCommand("git -C /path push origin main"), "git: -C with push still blocked");

// --- isSafeCommand: new safe commands ---

assert(isSafeCommand("python3 -c 'print(1+1)'"), "new: python3 -c");
assert(isSafeCommand("python3 script.py --builds 5"), "new: python3 script");
assert(isSafeCommand("python3 --version"), "new: python3 --version");
assert(isSafeCommand("gh pr view 790 --json title,state"), "new: gh pr view");
assert(isSafeCommand("gh issue list --label bug"), "new: gh issue list");
assert(isSafeCommand("gh pr diff 123"), "new: gh pr diff");
assert(isSafeCommand("gh pr checks 123"), "new: gh pr checks");
assert(isSafeCommand("gh pr status"), "new: gh pr status");
assert(isSafeCommand("gh run view 12345"), "new: gh run view");
assert(isSafeCommand("gh auth status"), "new: gh auth status");
assert(isSafeCommand("strings /usr/bin/acli"), "new: strings");
assert(isSafeCommand("brave-search 'kudobuilder kuttl'"), "new: brave-search");
assert(isSafeCommand("go list -m -versions github.com/foo/bar"), "new: go list");
assert(isSafeCommand("go version"), "new: go version");
assert(isSafeCommand("go doc fmt.Println"), "new: go doc");
assert(isSafeCommand("go env GOPATH"), "new: go env");
assert(isSafeCommand("go mod graph"), "new: go mod graph");
assert(isSafeCommand("gsutil ls gs://bucket/path"), "new: gsutil ls");
assert(isSafeCommand("gsutil cat gs://bucket/file.txt"), "new: gsutil cat");
assert(isSafeCommand("basename /path/to/file.txt"), "new: basename");
assert(isSafeCommand("dirname /path/to/file.txt"), "new: dirname");
assert(isSafeCommand("tr '[:upper:]' '[:lower:]'"), "new: tr");
assert(isSafeCommand("cut -d: -f1 /etc/passwd"), "new: cut");
assert(isSafeCommand("tac file.txt"), "new: tac");
assert(isSafeCommand("xargs grep -l pattern"), "new: xargs");
assert(isSafeCommand("realpath ./relative/path"), "new: realpath");
assert(isSafeCommand("readlink -f /path/to/link"), "new: readlink");
assert(isSafeCommand("sha256sum file.bin"), "new: sha256sum");
assert(isSafeCommand("md5sum file.bin"), "new: md5sum");
assert(isSafeCommand("hexdump -C file.bin | head"), "new: hexdump");
assert(isSafeCommand("xxd file.bin | head"), "new: xxd");
assert(isSafeCommand("column -t data.txt"), "new: column");

// --- isSafeCommand: acli new subcommands ---

assert(isSafeCommand("acli jira component list -p OCPBUGS"), "acli: component list");
assert(isSafeCommand("acli jira component list -p OCPBUGS --query openstack 2>/dev/null | head -30"), "acli: component list with query and pipe");
assert(isSafeCommand("acli jira auth status"), "acli: auth status");
assert(isSafeCommand("acli jira auth status 2>&1 | head -5"), "acli: auth status with pipe");
assert(isSafeCommand("acli jira version list -p OCPBUGS"), "acli: version list");

// --- isSafeCommand: gh destructive (blocked) ---

assert(!isSafeCommand("gh pr create --title 'test'"), "gh: pr create blocked");
assert(!isSafeCommand("gh pr merge 123"), "gh: pr merge blocked");
assert(!isSafeCommand("gh pr close 123"), "gh: pr close blocked");
assert(!isSafeCommand("gh issue create --title 'bug'"), "gh: issue create blocked");
assert(!isSafeCommand("gh issue close 456"), "gh: issue close blocked");
assert(!isSafeCommand("gh issue edit 456 --add-label fix"), "gh: issue edit blocked");
assert(!isSafeCommand("gh repo delete foo/bar"), "gh: repo delete blocked");
assert(!isSafeCommand("gh repo create my-repo"), "gh: repo create blocked");
assert(!isSafeCommand("gh release create v1.0"), "gh: release create blocked");
assert(!isSafeCommand("gh release delete v1.0"), "gh: release delete blocked");

// --- isSafeCommand: pip/uv read-only commands ---

assert(isSafeCommand("pip list --outdated"), "pip: list --outdated");
assert(isSafeCommand("pip show requests"), "pip: show");
assert(isSafeCommand("pip freeze"), "pip: freeze");
assert(isSafeCommand("pip index versions alembic"), "pip: index versions");
assert(isSafeCommand("pip check"), "pip: check");
assert(isSafeCommand("pip debug"), "pip: debug");
assert(!isSafeCommand("pip install requests"), "pip: install is blocked");
assert(!isSafeCommand("pip uninstall requests"), "pip: uninstall is blocked");

assert(isSafeCommand("uv pip list --outdated"), "uv: pip list --outdated");
assert(isSafeCommand("uv pip show requests"), "uv: pip show");
assert(isSafeCommand("uv pip tree"), "uv: pip tree");
assert(isSafeCommand("uv version"), "uv: version");
assert(isSafeCommand("uv lock --dry-run --upgrade"), "uv: lock --dry-run");
assert(isSafeCommand("uv list"), "uv: list");
assert(isSafeCommand("uv show sqlalchemy"), "uv: show");
assert(isSafeCommand("cd /home/user/project && uv pip list --outdated 2>/dev/null"), "uv: with cd prefix");

// --- isSafeCommand: curl with piped -o flag (bug fix) ---

assert(isSafeCommand("curl -s https://pypi.org/pypi/alembic/json 2>/dev/null | grep -o '\"version\"' | head -1"), "curl: piped grep -o should not trigger curl destructive");
assert(!isSafeCommand("curl -o /home/user/file.txt https://example.com"), "curl: own -o flag is still blocked");
assert(!isSafeCommand("curl --output /home/user/file.txt https://example.com"), "curl: own --output flag is still blocked");
assert(isSafeCommand("curl -o /tmp/test.txt https://example.com"), "curl: -o to /tmp/ is allowed");

// --- isSafeCommand: arrow -> in text should not trigger redirect detection ---

assert(isSafeCommand("python3 -c \"print(f'{a} -> {b}')\" "), "python3: arrow -> in string is not a redirect");

// --- isSafeCommand: combined normalization scenarios ---

assert(isSafeCommand("cd /path && python3 -c 'import json; print(json.dumps({}))'" ), "combined: cd + python3");
assert(isSafeCommand("# Check versions\ncd /path && go version"), "combined: comment + cd + go");
assert(isSafeCommand("/usr/bin/git -C /path log --oneline -5"), "combined: abspath + git -C");
assert(!isSafeCommand("cd /path && gh pr merge 123"), "combined: cd + gh destructive still blocked");

// --- isSafeCommand: sed broadened (safe without -i, blocked with -i) ---

assert(isSafeCommand("sed 's/^var //' /tmp/prowjobs.js"), "sed: substitution to stdout is safe");
assert(isSafeCommand("sed -n '130,170p' /tmp/file.go"), "sed: -n still safe");
assert(isSafeCommand("sed 's/foo/bar/' file.txt | head"), "sed: piped substitution is safe");
assert(!isSafeCommand("sed -i 's/foo/bar/' file.txt"), "sed: -i is blocked");
assert(!isSafeCommand("sed --in-place 's/foo/bar/' file.txt"), "sed: --in-place is blocked");
assert(!isSafeCommand("sed -ni 's/foo/bar/p' file.txt"), "sed: combined -ni is blocked");
assert(!isSafeCommand("sed -Ei 's/foo/bar/' file.txt"), "sed: combined -Ei is blocked");

// --- isSafeCommand: uv run specific tools ---

assert(isSafeCommand("uv run pytest tests/ -v"), "uv run: pytest is safe");
assert(isSafeCommand("uv run flake8 src/"), "uv run: flake8 is safe");
assert(isSafeCommand("uv run mypy src/"), "uv run: mypy is safe");
assert(isSafeCommand("uv run ruff check ."), "uv run: ruff is safe");
assert(isSafeCommand("uv run pylint src/"), "uv run: pylint is safe");
assert(isSafeCommand("uv run black --check src/"), "uv run: black --check is safe");
assert(isSafeCommand("uv run isort --check src/"), "uv run: isort --check is safe");
assert(isSafeCommand("cd /home/user/project && uv run pytest -q 2>&1"), "uv run: pytest with cd prefix");
assert(isSafeCommand("cd /home/user/project && uv run flake8 && uv run pytest -v 2>&1"), "uv run: flake8 && pytest with cd prefix");
assert(!isSafeCommand("uv run python3 -c 'import os; os.remove(\"f\")'" ), "uv run: arbitrary python3 is blocked");
assert(!isSafeCommand("uv run bash -c 'rm -rf /'"), "uv run: arbitrary bash is blocked");
assert(!isSafeCommand("uv run some-random-tool"), "uv run: unknown tool is blocked");

// --- isSafeCommand: uv package management (destructive) ---

assert(!isSafeCommand("uv sync --dev"), "uv: sync is blocked");
assert(!isSafeCommand("uv add requests"), "uv: add is blocked");
assert(!isSafeCommand("uv remove requests"), "uv: remove is blocked");
assert(!isSafeCommand("uv init"), "uv: init is blocked");
assert(!isSafeCommand("uv lock"), "uv: lock is blocked");
assert(isSafeCommand("uv lock --dry-run"), "uv: lock --dry-run is still safe");

// --- isSafeCommand: npx tsx ---

assert(isSafeCommand("npx tsx utils.test.ts"), "npx: tsx is safe");
assert(isSafeCommand("npx tsx utils.test.ts 2>&1"), "npx: tsx with redirect is safe");
assert(!isSafeCommand("npx some-random-package"), "npx: arbitrary package is blocked");
assert(!isSafeCommand("npx rimraf dist/"), "npx: rimraf is blocked");

// --- isSafeCommand: pdftotext ---

assert(isSafeCommand("pdftotext /path/to/doc.pdf -"), "pdftotext: to stdout is safe");
assert(isSafeCommand("pdftotext /path/to/doc.pdf /tmp/out.txt"), "pdftotext: to file is safe");

// --- isSafeCommand: bash -n ---

assert(isSafeCommand("bash -n script.sh"), "bash -n: syntax check is safe");
assert(isSafeCommand("bash -n /path/to/script.sh 2>&1"), "bash -n: with redirect is safe");
assert(!isSafeCommand("bash -c 'rm -rf /'"), "bash -c: arbitrary command is blocked");
assert(!isSafeCommand("bash script.sh"), "bash: running script is blocked");

// --- isSafeCommand: fc-list ---

assert(isSafeCommand("fc-list : family style"), "fc-list: listing fonts is safe");
assert(isSafeCommand("fc-list : family style | grep -i mono"), "fc-list: piped is safe");

// --- isSafeCommand: for loops ---

assert(isSafeCommand("for f in *.yaml; do grep 'pattern' \"$f\"; done"), "for: read-only loop is safe");
assert(isSafeCommand("for d in /path/*/tests/; do ls \"$d\"; done"), "for: ls loop is safe");
assert(!isSafeCommand("for f in *.txt; do rm \"$f\"; done"), "for: destructive body is blocked");
assert(!isSafeCommand("for f in *.txt; do mv \"$f\" /tmp/; done"), "for: mv in body is blocked");

// --- isSafeCommand: oc/kubectl read-only ---

assert(isSafeCommand("oc get pods -n openshift-machine-api"), "oc: get is safe");
assert(isSafeCommand("oc describe node worker-0"), "oc: describe is safe");
assert(isSafeCommand("oc logs pod/api-server -n openshift-kube-apiserver"), "oc: logs is safe");
assert(isSafeCommand("oc version"), "oc: version is safe");
assert(isSafeCommand("oc whoami"), "oc: whoami is safe");
assert(isSafeCommand("oc api-resources"), "oc: api-resources is safe");
assert(isSafeCommand("oc config view"), "oc: config view is safe");
assert(isSafeCommand("oc config get-contexts"), "oc: config get-contexts is safe");
assert(isSafeCommand("kubectl get pods"), "kubectl: get is safe");
assert(isSafeCommand("kubectl describe svc my-service"), "kubectl: describe is safe");
assert(isSafeCommand("kubectl logs deploy/my-app"), "kubectl: logs is safe");
assert(isSafeCommand("kubectl explain pod.spec"), "kubectl: explain is safe");
assert(isSafeCommand("kubectl config current-context"), "kubectl: config current-context is safe");

// --- isSafeCommand: oc/kubectl destructive ---

assert(!isSafeCommand("oc create -f manifest.yaml"), "oc: create is blocked");
assert(!isSafeCommand("oc delete pod my-pod"), "oc: delete is blocked");
assert(!isSafeCommand("oc apply -f manifest.yaml"), "oc: apply is blocked");
assert(!isSafeCommand("oc edit deployment my-app"), "oc: edit is blocked");
assert(!isSafeCommand("oc patch node worker-0 -p '{}'"), "oc: patch is blocked");
assert(!isSafeCommand("oc scale deployment my-app --replicas=3"), "oc: scale is blocked");
assert(!isSafeCommand("oc adm drain worker-0"), "oc: adm is blocked");
assert(!isSafeCommand("oc new-app nodejs~https://github.com/example/app"), "oc: new-app is blocked");
assert(!isSafeCommand("kubectl delete pod my-pod"), "kubectl: delete is blocked");
assert(!isSafeCommand("kubectl apply -f manifest.yaml"), "kubectl: apply is blocked");
assert(!isSafeCommand("kubectl drain node-1"), "kubectl: drain is blocked");
assert(!isSafeCommand("kubectl cordon node-1"), "kubectl: cordon is blocked");
assert(!isSafeCommand("kubectl taint node node-1 key=value:NoSchedule"), "kubectl: taint is blocked");
assert(!isSafeCommand("kubectl rollout restart deployment my-app"), "kubectl: rollout is blocked");

// --- isSafeCommand: podman/docker destructive ---

assert(!isSafeCommand("podman run --rm alpine echo hello"), "podman: run is blocked");
assert(!isSafeCommand("podman build -t my-image ."), "podman: build is blocked");
assert(!isSafeCommand("podman push my-image:latest"), "podman: push is blocked");
assert(!isSafeCommand("podman rm container-id"), "podman: rm is blocked");
assert(!isSafeCommand("podman rmi image-id"), "podman: rmi is blocked");
assert(!isSafeCommand("podman stop container-id"), "podman: stop is blocked");
assert(!isSafeCommand("podman kill container-id"), "podman: kill is blocked");
assert(!isSafeCommand("podman exec container-id ls"), "podman: exec is blocked");
assert(!isSafeCommand("docker run --rm alpine echo hello"), "docker: run is blocked");
assert(!isSafeCommand("docker build -t my-image ."), "docker: build is blocked");
assert(!isSafeCommand("docker push my-image:latest"), "docker: push is blocked");
assert(!isSafeCommand("docker rm container-id"), "docker: rm is blocked");

// --- isSafeCommand: dot (graphviz) ---

assert(!isSafeCommand("dot -Tpng -Gdpi=150 /tmp/diagram.dot -o /path/to/output.png"), "dot: -o writes file is blocked");
assert(!isSafeCommand("dot -Tsvg input.dot -o output.svg 2>&1"), "dot: svg output is blocked");

// --- Summary ---

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
