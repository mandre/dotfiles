import assert from "node:assert/strict";
import { completeSteps, extractTodoItems, cleanStepText, isSafeCommand, normalizeCommand, type TodoItem } from "./utils.js";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`PASS: ${name}`); }

for (const header of ["Plan:", "Plan", "## Plan:", "### **Plan:**", "# Plan", "**Plan:**", "Plan (updated, reflecting progress so far):", "Understood, updated plan:", "Here's my updated plan:"]) {
	for (const prefix of ["", "### "]) {
		test(`extract ${header} / ${prefix}`, () => {
			const items = extractTodoItems(`Intro\n\n${header}\n${prefix}1. First step description\n${prefix}3. Third step description\n`);
			assert.deepEqual(items.map((i) => i.step), [1, 3]);
			assert(items.every((i) => !i.completed));
		});
	}
}

test("extract markdown, inline code and filtered items without renumbering", () => {
	const items = extractTodoItems("**Plan:**\n1. `hubtty/file.py` fix the parser\n2. `x`\n3. **Update tests** for behavior\n4. -\n5. ```python is excluded\n6. Update /absolute/path/file.ts\n");
	assert.deepEqual(items.map((i) => i.step), [1, 3, 6]);
	assert.equal(items[0].text, "Hubtty/file.py fix the parser");
	assert.equal(items[1].text, "Update tests for behavior");
});
test("bold numbered steps", () => {
	assert.deepEqual(extractTodoItems("Plan:\n**1.** First real task\n**2.** Second real task\n").map((i) => i.step), [1, 2]);
});
test("non-plan text and steps mentioning plan are not headers", () => {
	for (const text of ["1. First task\n2. Second task", "A plan is useful\n1. First task", "6. Update the plan.yaml file:\n1. Unrelated task", "- Update the plan:\n1. Unrelated task"]) assert.deepEqual(extractTodoItems(text), []);
});
test("clean step formatting", () => {
	assert.equal(cleanStepText("~~**fix**~~ `parser`   behavior"), "Fix parser behavior");
	assert.equal(cleanStepText(""), "");
});

const allowed = [
	"ls -la", "pwd", "cat file.txt", "head -20 file", "tail file", "grep -n 'pattern' src/file", "rg --files", "find src -name '*.ts'", "fd foo", "wc -l file", "sort file", "uniq file", "diff a b", "stat file", "file binary", "du -sh src", "df -h", "tree src",
	"echo 'a; b | c'", "printf '%s' 'hello'", "tr '[:upper:]' '[:lower:]'", "cut -d: -f1 /etc/passwd", "tac file", "column -t data", "basename /a/b", "dirname /a/b", "realpath ./file", "readlink -f link", "getconf ARG_MAX", "sha256sum file", "md5sum file", "hexdump -C file | head", "xxd file | head", "base64 -d", "echo 'dGVzdA==' | base64 -d",
	"git status", "git log --oneline -5", "git diff --stat", "git show HEAD:file", "git branch --show-current", "git remote -v", "git ls-files", "git merge-base main HEAD", "git for-each-ref --format='%(refname:short)' refs/heads", "git rev-parse --show-toplevel", "git stash list", "git stash show -p 'stash@{0}'", "git tag --list 'v*'", "git tag --sort=-v:refname | head", "git config --global --get user.name", "git config --list --show-origin", "git -C /path --no-pager log",
	"cd '/path with spaces' && git status", "cd /path; git diff", "cd /path\ngit status\necho '---'\ngit log", "# code vim sudo in comments\ngit status", "/usr/bin/git log", "/usr/local/bin/python3 --version", "python3 --version", "rm --help", "nvim --version | head -3",
	"gh pr view 123 --json title", "gh issue list", "gh pr diff 123", "gh run view 123", "gh auth status", "gh api repos/foo/bar/pulls/1 --jq '.title'", "curl -s https://example.com | grep title", "gws sheets +read --spreadsheet ID --range Sheet1", "acli jira workitem search --jql 'project = FOO'", "acli jira component list -p OCPBUGS", "acli jira auth status",
	"pip list --outdated", "pip3 show requests", "pip freeze", "uv pip list", "uv pip tree", "uv version", "go list -m all", "go doc fmt.Println", "go env GOPATH", "go mod graph", "gsutil ls gs://bucket", "oc get pods", "oc logs pod/example", "oc config view", "kubectl describe node example", "kubectl explain pod.spec", "rpm -qa | grep package", "rpm --verify package", "tmux list-panes", "tmux capture-pane -p | head", "man -k printf", "sed -n '1,20p' file",
];
for (const command of allowed) test(`allow ${command}`, () => assert.equal(isSafeCommand(command), true));

const blocked = [
	"rm file", "mkdir directory", "cp a b", "mv a b", "touch file", "sudo ls", "chmod 777 file", "git push origin main", "git -C /path reset --hard", "git branch new", "git remote add test URL", "git stash", "git stash pop", "git tag v1", "git tag -a v1", "git config user.name value",
	"echo --help; rm file", "echo --version && unknown_mutator", "ls; unknown_mutator", "ls | unknown_mutator", "ls\nunknown_mutator", "ls &", "ls $(unknown_mutator)", "ls `unknown_mutator`", "echo \"$(unknown_mutator)\"", "cat <(unknown_mutator)", "cat < file", "echo value > file", "echo value >> /tmp/file", "cd /path 2>&1; git log", "git log 2>/dev/null", "echo \"unterminated", "echo \\\nrm file",
	"python3 -c 'print(1)'", "python3 script.py", "node script.js", "npx tsx test.ts", "uv run pytest", "uv run flake8", "uv lock --dry-run", "awk 'BEGIN { system(\"anything\") }'", "xargs grep pattern", "env python3 script.py", "for f in *.txt; do cat $f; done", "bash -n script.sh", "ansible-lint", "pdftotext input.pdf /tmp/out", "openssl x509 -in cert.pem", "sed 's/a/b/' file", "sed -i 's/a/b/' file", "sed -n '1w /tmp/file' file",
	"find . -exec unknown_mutator '{}' ';'", "find . -delete", "find . -fprint /tmp/output", "fd --exec unknown_mutator", "rg --pre unknown_mutator text", "sort -o/tmp/file input", "git diff --output=/tmp/file", "jq --run-tests file", "curl -o /tmp/file https://example.com", "curl --output=/tmp/file URL", "curl -X POST URL", "curl -d body URL", "curl --config file", "gh pr review 1", "gh run download 1 --dir /tmp/out", "gh api endpoint -f key=value", "gh api endpoint --method=POST", "go env -w GOPATH=/tmp", "go vet ./...", "npm audit --fix", "oc project new", "oc apply -f file", "kubectl delete pod name", "docker run image", "rpm -i package.rpm", "tmux send-keys ls Enter", "gh pr merge --help; rm file",
];
for (const command of blocked) test(`block ${command}`, () => assert.equal(isSafeCommand(command), false));

test("legacy command normalization remains stable", () => {
	assert.equal(normalizeCommand("# comment\ncd /path 2>&1; /usr/bin/git log"), "git log");
	assert.equal(normalizeCommand("cd '/path with spaces' && git status"), "git status");
});
test("completion is atomic, requires evidence and is idempotent", () => {
	const items: TodoItem[] = [1, 3].map((step) => ({ step, text: `Task ${step}`, completed: false }));
	assert.throws(() => completeSteps(items, []));
	assert.throws(() => completeSteps(items, [{ step: 1, evidence: "ok" }, { step: 2, evidence: "missing" }]));
	assert(items.every((i) => !i.completed));
	assert.throws(() => completeSteps(items, [{ step: 1, evidence: " " }]));
	assert.equal(completeSteps(items, [{ step: 1, evidence: " Verified tests " }]), 1);
	assert.equal(items[0].evidence, "Verified tests");
	assert.equal(completeSteps(items, [{ step: 1, evidence: "again" }]), 0);
	assert.equal(items[0].evidence, "Verified tests");
	assert.equal(completeSteps(items, [{ step: 3, evidence: "Verified file" }]), 1);
});
console.log(`\nPlan utility tests: ${passed} passed`);
