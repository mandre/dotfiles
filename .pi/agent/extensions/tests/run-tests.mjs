import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

await import("../plan-mode/run-tests.mjs");
const install = join(homedir(), ".pi", "agent", "install");
const packageRoot = process.env.PI_TEST_PACKAGE_ROOT ?? join(install, "releases",
	readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules", "@earendil-works", "pi-coding-agent");
const importFile = (path) => import(pathToFileURL(path).href);
const { loadExtensions } = await importFile(join(packageRoot, "dist/core/extensions/loader.js"));
const { ExtensionRunner, SessionManager, initTheme } = await importFile(join(packageRoot, "dist/index.js"));
initTheme("dark", false);
const { KeybindingsManager, TUI_KEYBINDINGS, CURSOR_MARKER, visibleWidth } = await importFile(
	join(packageRoot, "../pi-tui/dist/index.js"));
const extensionsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = ["plan-mode/index.ts", "custom-footer.ts", "questionnaire.ts", "code-review.ts"].map((p) => join(extensionsDir, p));
const loaded = await loadExtensions(paths, process.cwd());
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 4);
const [plan, footer, questionnaire, review] = loaded.extensions;
let passed = 0;
async function test(name, run) {
	await run();
	console.log(`PASS: ${name}`);
	passed++;
}
const theme = {
	fg: (_color, text) => text, bg: (_color, text) => text,
	bold: (text) => text, strikethrough: (text) => text,
};
const usage = (input, cost = 1, cacheRead = 0) => ({
	input, output: 10, cacheRead, cacheWrite: 0, totalTokens: input + cacheRead + 10,
	cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

await test("Pi loader and runner dispatch nested tool gates and structured custom-run prompts", async () => {
	const runner = new ExtensionRunner([plan], loaded.runtime, process.cwd(), SessionManager.inMemory(), {});
	const errors = [];
	runner.onError((error) => errors.push(error));
	runner.setUIContext(undefined, "tui");
	const call = (toolName, input = {}, parentToolCallId) => runner.emitToolCall({
		type: "tool_call", toolCallId: "call", toolName, input, parentToolCallId,
	});
	assert.equal((await call("deferred_mutation", {}, "codemode/1")).block, true);
	assert.equal((await call("bash", { command: "rm file" }, "codemode/1")).block, true);
	assert.equal(await call("read", { path: "file" }, "codemode/1"), undefined);
	assert.equal(await call("codemode", { code: "text('ok')" }), undefined);
	const result = await runner.emitBeforeAgentStart({ messageType: "custom", message: {
		customType: "test", content: "Plan", display: false,
	} }, { cwd: process.cwd(), sections: { other: "Preserve me" } });
	assert.match(result.systemPromptOptions.sections.plan_mode, /PLAN MODE ACTIVE/);
	assert.equal(result.systemPromptOptions.sections.other, "Preserve me");
	assert.equal(result.systemPromptOptions.forceSystemPrompt, undefined);
	assert.deepEqual(errors, []);
});

await test("footer counts all active-branch usage, caches scans, and invalidates on navigation", async () => {
	let manager = SessionManager.inMemory();
	const assistantId = manager.appendMessage({ role: "assistant", content: [], usage: usage(100, 1, 100) });
	manager.appendMessage({ role: "toolResult", content: [], toolCallId: "call", toolName: "test", usage: usage(20, 2) });
	manager.appendCompaction("Summary", assistantId, 200, undefined, false, usage(30, 3));
	manager.branchWithSummary(assistantId, "Branch summary", undefined, false, usage(40, 4));
	manager.appendUsage("cache_warm", "test", "model", usage(0, 5, 500));
	manager.appendUsage("unknown_future_kind", "test", "model", usage(50, 6));
	let scans = 0;
	const track = () => {
		const getBranch = manager.getBranch.bind(manager);
		manager.getBranch = (...args) => { scans++; return getBranch(...args); };
	};
	track();
	let component;
	const ctx = {
		cwd: process.cwd(), get sessionManager() { return manager; },
		model: { id: "test", contextWindow: 200000 },
		modelRegistry: { isUsingOAuth: () => false }, getContextUsage: () => ({ tokens: 1000 }),
		ui: { setFooter(factory) {
			component = factory({ requestRender() {} }, theme, {
				onBranchChange: () => () => {}, getGitBranch: () => undefined,
				getAvailableProviderCount: () => 1, getExtensionStatuses: () => new Map(),
			});
		} },
	};
	loaded.runtime.getThinkingLevel = () => "off";
	await footer.handlers.get("session_start")[0]({}, ctx);
	let text = component.render(200).join("\n");
	// Branching abandoned the tool-result and compaction entries.
	assert.match(text, /↑190/);
	assert.match(text, /R600/);
	assert.match(text, /CH50%/);
	assert.match(text, /\$16\.000/);
	component.render(80);
	assert.equal(scans, 1);
	manager.appendUsage("cache_warm", "test", "model", usage(5, 1));
	assert.match(component.render(200).join("\n"), /\$17\.000/);
	assert.equal(scans, 2);
	manager.branch(assistantId);
	assert.match(component.render(200).join("\n"), /\$1\.000/);
	assert.equal(scans, 3);
	manager.appendMessage({ role: "toolResult", content: [], usage: usage(20, 2) });
	manager.appendCompaction("Summary", assistantId, 200, undefined, false, usage(30, 3));
	assert.match(component.render(200).join("\n"), /\$6\.000/);
	component.invalidate();
	component.render(80);
	assert.equal(scans, 5);
	manager = SessionManager.inMemory();
	track();
	assert.doesNotMatch(component.render(200).join("\n"), /\$6\.000/);
	assert.equal(scans, 6);
	component.dispose();
});

const question = { id: "q", prompt: "Choose a target with a long prompt that wraps at narrow widths", options: [
	{ value: "a", label: "Alpha", description: "A long description that wraps to multiple lines" },
	{ value: "b", label: "Beta" },
] };
const tool = questionnaire.tools.get("questionnaire").definition;
function dialog(questions) {
	let component;
	const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
		"tui.select.up": "k", "tui.select.down": "j",
		"tui.select.confirm": "y", "tui.select.cancel": "q",
	});
	const result = tool.execute("question", { questions }, undefined, undefined, {
		mode: "tui", ui: { custom(factory) {
			return new Promise((done) => {
				component = factory({ requestRender() {}, terminal: { rows: 40, columns: 100 } }, theme, keybindings, done);
				component.focused = true;
			});
		} },
	});
	return { component, result };
}

await test("questionnaire is model-only, honors remapped actions, and resizes without invalidation", async () => {
	assert.equal(tool.exposure, "model-only");
	assert.equal(tool.executionMode, "sequential");
	const { component, result } = dialog([question]);
	component.render(100);
	for (const width of [40, 20, 80]) {
		assert(component.render(width).every((line) => visibleWidth(line) <= width));
	}
	component.handleInput("j");
	component.handleInput("y");
	assert.equal((await result).details.answers[0].value, "b");
	const cancelled = dialog([question]);
	cancelled.component.handleInput("q");
	assert.equal((await cancelled.result).details.cancelled, true);
});

await test("questionnaire handles multi-question submission and propagates editor focus", async () => {
	const multi = dialog([question, { ...question, id: "q2" }]);
	multi.component.handleInput("y");
	multi.component.handleInput("j");
	multi.component.handleInput("y");
	multi.component.handleInput("y");
	assert.deepEqual((await multi.result).details.answers.map((a) => a.value), ["a", "b"]);
	const custom = dialog([{ ...question, options: [] }]);
	custom.component.handleInput("y");
	assert(custom.component.render(80).some((line) => line.includes(CURSOR_MARKER)));
	custom.component.focused = false;
	assert(!custom.component.render(80).some((line) => line.includes(CURSOR_MARKER)));
	custom.component.focused = true;
	custom.component.handleInput("hello");
	custom.component.handleInput("\r");
	assert.equal((await custom.result).details.answers[0].value, "hello");
	const empty = dialog([{ ...question, options: [], allowOther: false }]);
	empty.component.handleInput("y");
	empty.component.handleInput("q");
	assert.equal((await empty.result).details.cancelled, true);
});

await test("quick review uses provider-neutral reasoning and the supplied abort signal", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-extension-test-"));
	try {
		execFileSync("git", ["init", "-q", cwd]);
		writeFileSync(join(cwd, "file.txt"), "before\n");
		execFileSync("git", ["-C", cwd, "add", "file.txt"]);
		writeFileSync(join(cwd, "file.txt"), "after\n");
		const signal = new AbortController().signal;
		let calls = 0;
		const result = await review.tools.get("code_review").definition.execute("review", { scope: "unstaged" }, signal, undefined, {
			cwd, model: { id: "test", provider: "test" }, modelRegistry: { streamSimple(model, context, options) {
				calls++;
				assert.equal(model.id, "test");
				assert.match(context.messages[0].content[0].text, /after/);
				assert.equal(options.reasoning, "high");
				assert.equal(options.signal, signal);
				return { result: async () => ({ content: [{ type: "text", text: "No issues found." }] }) };
			} },
		});
		assert.equal(calls, 1);
		assert.match(result.content[0].text, /No issues found/);
		const source = readFileSync(join(extensionsDir, "code-review.ts"), "utf8");
		assert.match(source, /const piArgs: string\[\] = \[[^\n]*"--no-mcp"/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

console.log(`\nPi ${JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version} loader/runtime and component tests: ${passed} passed`);
