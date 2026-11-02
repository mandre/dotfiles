import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { EventEmitter, getEventListeners } from "node:events";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

await import("../plan-mode/run-tests.mjs");
const install = join(homedir(), ".pi", "agent", "install");
const packageRoot = process.env.PI_TEST_PACKAGE_ROOT ?? join(install, "releases",
	readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules", "@earendil-works", "pi-coding-agent");
const importFile = (path) => import(pathToFileURL(path).href);
const { loadExtensions } = await importFile(join(packageRoot, "dist/core/extensions/loader.js"));
const { validateToolArguments } = await importFile(join(packageRoot, "../pi-ai/dist/utils/validation.js"));
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
const require = createRequire(join(packageRoot, "package.json"));
const { createJiti } = await importFile(require.resolve("jiti"));
const jiti = createJiti(import.meta.url, { alias: Object.fromEntries([
	"@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui", "typebox",
].map((name) => [name, name === "typebox" ? require.resolve(name) : join(packageRoot, "..", name.split("/")[1], "dist/index.js")])) });
const { GUARD_EXTENSION_SOURCE, ensurePrRef, performReview, runPrReviewSubagent } = await jiti.import(join(extensionsDir, "code-review.ts"));
const { bindChildCancellation, boundedOutput } = await jiti.import(join(extensionsDir, "code-review/support.ts"));
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

// Fresh extension state and Pi's real runner, without provider requests.
async function planHarness(state) {
	const fresh = await loadExtensions([paths[0]], process.cwd());
	assert.deepEqual(fresh.errors, []);
	const manager = SessionManager.inMemory();
	if (state) manager.appendCustomEntry("plan-mode", state);
	let active = ["read", "edit", "codemode"];
	Object.assign(fresh.runtime, {
		getActiveTools: () => [...active], setActiveTools: (names) => { active = [...names]; },
		appendEntry: (type, data) => manager.appendCustomEntry(type, data),
		setLabel: (id, label) => manager.appendLabelChange(id, label),
	});
	const runner = new ExtensionRunner(fresh.extensions, fresh.runtime, process.cwd(), manager, {});
	const errors = [], notifications = [];
	runner.onError((error) => errors.push(error));
	runner.setUIContext({ ...runner.getUIContext(), notify: (...args) => notifications.push(args) }, "tui");
	await runner.emit({ type: "session_start" });
	const preview = async () => ({ contextEntries: [], contextMessages: [], llmMessages: [], pendingMessages: [], canContinue: true });
	return { runner, manager, errors, notifications, preview, fresh };
}

await test("plan reconciliation preserves entries from an earlier extension through Pi's runner", async () => {
	const h = await planHarness({ enabled: false, executing: true, todos: [{ step: 1, text: "Inspect", completed: false }] });
	const prior = { type: "custom", customType: "other-extension", data: { preserved: true } };
	const earlier = { ...h.fresh.extensions[0], handlers: new Map([
		["agent_before_settle", [async () => ({ entries: [prior] })]],
	]) };
	const runner = new ExtensionRunner([earlier, ...h.fresh.extensions], h.fresh.runtime, process.cwd(), h.manager, {});
	runner.setUIContext(undefined, "tui");
	const result = await runner.emitBoundary({ type: "agent_before_settle", outcome: "completed" }, h.preview);
	assert.equal(result.valid, true);
	assert.equal(result.continue, true);
	assert.deepEqual(result.entries[0], prior);
	assert.equal(result.entries[1].customType, "plan-reconciliation");
	assert.equal(result.entries.length, 2);
	assert.deepEqual(h.errors, []);
});

await test("execution keeps prompt/tool transitions intact through Pi's context runner", async () => {
	const h = await planHarness({ enabled: false, executing: true, todos: [{ step: 1, text: "Inspect", completed: false }] });
	const start = await h.runner.emitBeforeAgentStart({ messageType: "user", prompt: "Continue" }, {
		cwd: process.cwd(), sections: { plan_mode: "Stale", other: "Preserve" },
	});
	assert.match(start.systemPromptOptions.sections.plan_execution, /call plan_progress/);
	assert.equal(start.systemPromptOptions.sections.plan_mode, undefined);
	assert.equal(start.systemPromptOptions.sections.other, "Preserve");
	assert.equal(start.messages.length, 1);
	h.manager.appendCustomMessageEntry(start.messages[0].customType, start.messages[0].content, false);
	const initial = { role: "system", content: "Original", sections: { other: "Preserve" },
		toolsAdded: [{ name: "read", description: "Read", parameters: { type: "object" } }], timestamp: 1 };
	const transition = { role: "system", content: "", sections: { plan_execution: start.systemPromptOptions.sections.plan_execution },
		toolsAdded: [{ name: "plan_progress", description: "Progress", parameters: { type: "object" } }], timestamp: 3 };
	const transcript = [initial, { role: "user", content: "Continue", timestamp: 2 }, transition,
		{ role: "custom", ...start.messages[0], timestamp: 4 }];
	for (let i = 0; i < 3; i++) assert.deepEqual(await h.runner.emitContext(transcript), transcript);
	const progress = h.fresh.extensions[0].tools.get("plan_progress").definition;
	const result = await progress.execute("progress", { action: "complete", updates: [{ step: 1, evidence: "Inspected" }] },
		undefined, undefined, h.runner.createContext());
	assert.match(result.content[0].text, /1\. \[x\] Inspect/);
	transcript.push({ role: "toolResult", toolCallId: "progress", toolName: "plan_progress", content: result.content, timestamp: 5 });
	assert.deepEqual(await h.runner.emitContext(transcript), transcript);
	const next = await h.runner.emitBeforeAgentStart({ messageType: "custom", message: {
		customType: "continue", content: "Continue", display: false,
	} }, { cwd: process.cwd(), sections: {} });
	assert.match(next.messages[0].content, /1\. \[x\] Inspect/);
	assert.match(start.messages[0].content, /1\. \[ \] Inspect/);
	assert.deepEqual(h.errors, []);
});

await test("planning defers notices across later continuations and persists only boundary snapshots", async () => {
	const h = await planHarness();
	let continuation = true;
	const later = { ...h.fresh.extensions[0], handlers: new Map([
		["agent_before_settle", [async (event) => ({ entries: [...event.entries,
			{ type: "custom", customType: "later-extension", data: {} }], continue: continuation })]],
	]) };
	const runner = new ExtensionRunner([...h.fresh.extensions, later], h.fresh.runtime, process.cwd(), h.manager, {});
	runner.setUIContext(h.runner.getUIContext(), "tui");
	runner.onError((error) => h.errors.push(error));
	const assistant = (text, stopReason = "stop") => ({ role: "assistant", content: [{ type: "text", text }], stopReason });
	let latest = assistant("Plan:\n1. Intermediate.");
	const preview = async () => ({ ...await h.preview(), contextMessages: [latest] });
	const boundary = async (outcome = "completed") => runner.emitBoundary({ type: "agent_before_settle", outcome }, preview);
	await runner.emit({ type: "agent_end", messages: [latest] });
	assert.equal(h.notifications.length, 0);
	const staged = await boundary();
	assert.equal(staged.continue, true);
	assert.equal(staged.entries[0].customType, "plan-mode");
	assert.equal(staged.entries[1].customType, "later-extension");
	assert.equal(h.notifications.length, 0);
	await runner.emit({ type: "agent_start" });
	latest = assistant("Plan:\n1. Failed attempt.", "error");
	await runner.emit({ type: "agent_end", messages: [latest] });
	await boundary("error");
	await runner.emit({ type: "agent_settled", aborted: false });
	assert.equal(h.notifications.length, 0);
	// Retry succeeds with a different plan. Commit the drafts as AgentSession does.
	continuation = false;
	latest = assistant("Plan:\n1. Final.\n2. Validate.");
	await runner.emit({ type: "agent_start" });
	const finished = await boundary();
	assert.equal(finished.continue, false);
	for (const entry of finished.entries) h.manager.appendCustomEntry(entry.customType, entry.data);
	const count = h.manager.getBranch().length;
	await runner.emit({ type: "agent_settled", aborted: false });
	assert.equal(h.manager.getBranch().length, count);
	assert.equal(h.notifications.length, 1);
	assert.match(h.notifications[0][0], /Plan extracted \(2 steps\)/);
	assert.equal(h.manager.getBranch().filter((entry) => entry.customType === "plan-mode").at(-1).data.todos[0].text, "Final.");
	await boundary();
	await runner.emit({ type: "agent_settled", aborted: true });
	assert.equal(h.notifications.length, 1);
	assert.deepEqual(h.errors, []);
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
		modelRegistry: { isUsingOAuth: () => false }, getContextUsage: () => ({ tokens: 1000, contextWindow: 100000, percent: 1 }),
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
	manager.appendCustomEntry("review-usage", { usage: usage(50, 3) });
	const final = component.render(200).join("\n");
	assert.match(final, /\$3\.000/);
	assert.match(final, /1%\/100k/);
	component.dispose();
});

await test("footer preserves right-hand model/status and checks home path boundaries", async () => {
	let component;
	await footer.handlers.get("session_start")[0]({}, {
		cwd: `${process.env.HOME}-other/${"long/".repeat(20)}`, sessionManager: SessionManager.inMemory(),
		model: { id: "test-model" }, modelRegistry: { isUsingOAuth: () => false }, getContextUsage: () => undefined,
		ui: { setFooter(factory) { component = factory({ requestRender() {} }, theme, {
			onBranchChange: () => () => {}, getGitBranch: () => undefined, getAvailableProviderCount: () => 1,
			getExtensionStatuses: () => new Map([["plan", "PLAN"]]),
		}); } },
	});
	assert(component.render(500)[0].trimStart().startsWith(`${process.env.HOME}-other/`));
	assert(component.render(25)[0].endsWith("test-model"));
	assert(component.render(25)[1].endsWith("PLAN"));
	for (const width of [0, 1, 2, 5, 20]) assert(component.render(width).every((line) => visibleWidth(line) <= width));
	component.dispose();
});

const question = { id: "q", prompt: "Choose a target with a long prompt that wraps at narrow widths", options: [
	{ value: "a", label: "Alpha", description: "A long description that wraps to multiple lines" },
	{ value: "b", label: "Beta" },
] };
const tool = questionnaire.tools.get("questionnaire").definition;
function validateArguments(definition, args) {
	const input = structuredClone(args);
	return validateToolArguments(definition, {
		type: "toolCall", id: "validation-test", name: definition.name,
		arguments: definition.prepareArguments ? definition.prepareArguments(input) : input,
	});
}

await test("real argument validator accepts existing questionnaire, plan and review schemas", async () => {
	const progress = plan.tools.get("plan_progress").definition;
	const codeReview = review.tools.get("code_review").definition;
	for (const [definition, args] of [
		[tool, { questions: [question] }],
		[progress, { action: "list" }],
		[progress, { action: "complete", updates: [{ step: 1, evidence: "Inspected source" }] }],
		[codeReview, {}],
		[codeReview, { scope: "staged", range: "HEAD~1..HEAD", path: "file.ts", focus: "Correctness" }],
		[codeReview, { prUrl: "https://github.com/owner/repo/pull/123" }],
	]) {
		const original = structuredClone(args);
		assert.deepEqual(validateArguments(definition, args), args);
		assert.deepEqual(args, original);
	}
});

await test("real argument validator coerces arguments without mutating stored calls", async () => {
	const progress = plan.tools.get("plan_progress").definition;
	const input = { action: "complete", updates: { step: "2", evidence: "Read source" } };
	assert.deepEqual(validateArguments(progress, input), {
		action: "complete", updates: [{ step: 2, evidence: "Read source" }],
	});
	assert.deepEqual(input.updates, { step: "2", evidence: "Read source" });
	assert.deepEqual(validateArguments(progress, {
		action: "complete", updates: [{ step: 2.8, evidence: "Read source" }],
	}), { action: "complete", updates: [{ step: 2, evidence: "Read source" }] });
	assert.deepEqual(validateArguments(progress, { action: "list", updates: null }), { action: "list" });
	assert.deepEqual(validateArguments(tool, { questions: [{ ...question, allowOther: "false" }] }), {
		questions: [{ ...question, allowOther: false }],
	});
	const rawCall = { type: "toolCall", id: "raw", name: tool.name, arguments: {
		questions: [{ ...question, options: { value: "a", label: "Alpha" }, allowOther: "true" }],
	} };
	const stored = structuredClone(rawCall);
	assert.deepEqual(validateToolArguments(tool, rawCall), { questions: [{ ...question,
		options: [{ value: "a", label: "Alpha" }], allowOther: true,
	}] });
	assert.deepEqual(rawCall, stored);
});

await test("real argument validator rejects missing, invalid and out-of-bounds arguments", async () => {
	const progress = plan.tools.get("plan_progress").definition;
	const codeReview = review.tools.get("code_review").definition;
	for (const [definition, args, path] of [
		[tool, {}, "questions"],
		[tool, { questions: [] }, "questions"],
		[tool, { questions: [{ options: [] }] }, "questions.0.id"],
		[tool, { questions: [{ ...question, options: [{ value: "a" }] }] }, "questions.0.options.0.label"],
		[progress, {}, "action"],
		[progress, { action: "invalid" }, "action"],
		[progress, { action: "complete", updates: [] }, "updates"],
		[progress, { action: "complete", updates: [{ step: 0, evidence: "Read" }] }, "updates.0.step"],
		[progress, { action: "complete", updates: [{ step: "invalid", evidence: "Read" }] }, "updates.0.step"],
		[progress, { action: "complete", updates: [{ step: 1, evidence: "" }] }, "updates.0.evidence"],
		[codeReview, { scope: "invalid" }, "scope"],
	]) {
		assert.throws(() => validateArguments(definition, args), (error) => {
			assert.match(error.message, /Validation failed for tool/);
			assert(error.message.includes(`- ${path}:`), error.message);
			return true;
		}, `${definition.name}: ${JSON.stringify(args)}`);
	}
});

function dialog(questions, signal, rows = 40, keyOverrides = {}) {
	let component;
	let customOptions;
	const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
		"tui.select.up": "k", "tui.select.down": "j",
		"tui.select.confirm": "y", "tui.select.cancel": "q",
		...keyOverrides,
	});
	const result = tool.execute("question", { questions }, signal, undefined, {
		mode: "tui", ui: { custom(factory, options) {
			customOptions = options;
			return new Promise((done) => {
				component = factory({ requestRender() {}, terminal: { rows, columns: 100 } }, theme, keybindings, done);
				component.focused = true;
			});
		} },
	});
	return { component, result, customOptions };
}

await test("questionnaire reports blocked input and cleans up after submission, cancellation and abort", async () => {
	for (const finish of ["submit", "cancel", "abort"]) {
		const controller = new AbortController();
		const current = dialog([question], controller.signal);
		assert.deepEqual(current.customOptions, {
			blocked: { kind: "question", message: "Answer questionnaire" },
		});
		assert.equal(getEventListeners(controller.signal, "abort").length, 1);
		if (finish === "abort") controller.abort();
		else current.component.handleInput(finish === "submit" ? "y" : "q");
		assert.equal((await current.result).details.cancelled, finish !== "submit");
		assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		current.component.dispose();
		controller.abort();
	}
});

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

await test("questionnaire hints use injected bindings in options, editor and submission views", async () => {
	const hints = (component) => stripVTControlCharacters(component.render(200).join("\n"));
	const single = dialog([question], undefined, 40, { "tui.select.up": ["k", "ctrl+p"] });
	assert.match(hints(single.component), /k\/ctrl\+p up • j down • y select • q cancel/);
	single.component.handleInput("j");
	single.component.handleInput("k");
	single.component.handleInput("y");
	assert.equal((await single.result).details.answers[0].value, "a");

	const multi = dialog([question, { ...question, id: "q2" }]);
	assert.match(hints(multi.component), /k up • j down • y confirm • q cancel/);
	multi.component.handleInput("y");
	multi.component.handleInput("y");
	assert.match(hints(multi.component), /y submit/);
	multi.component.handleInput("y");
	assert.equal((await multi.result).details.answers.length, 2);

	const custom = dialog([{ ...question, options: [] }], undefined, 40, { "tui.input.submit": "ctrl+s" });
	custom.component.handleInput("y");
	assert.match(hints(custom.component), /ctrl\+s submit • q cancel/);
	custom.component.handleInput("q");
	assert.match(hints(custom.component), /y select • q cancel/);
	custom.component.handleInput("q");
	assert.equal((await custom.result).details.cancelled, true);
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
	await assert.rejects(dialog([{ ...question, options: [], allowOther: false }]).result, /no available answers/);
	await assert.rejects(dialog([question, question]).result, /unique/);
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
				return { result: async () => ({ stopReason: "stop", usage: usage(100, 2), content: [{ type: "text", text: "No issues found." }] }) };
			} },
		});
		assert.equal(calls, 1);
		assert.match(result.content[0].text, /No issues found/);
		assert.deepEqual(result.usage, usage(100, 2));
		assert.equal(result.structuredContent.review, "No issues found.");
		assert.deepEqual(result.structuredContent.skippedPaths, []);
		const source = readFileSync(join(extensionsDir, "code-review.ts"), "utf8");
		assert.match(source, /const piArgs: string\[\] = \[[^\n]*"--no-mcp"/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

await test("review guard gates unknown direct, deferred and nested tools through the real runner", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-guard-test-"));
	try {
		const file = join(dir, "guard.ts");
		writeFileSync(file, GUARD_EXTENSION_SOURCE);
		const guard = await loadExtensions([file], process.cwd());
		assert.deepEqual(guard.errors, []);
		const runner = new ExtensionRunner(guard.extensions, guard.runtime, process.cwd(), SessionManager.inMemory(), {});
		for (const parentToolCallId of [undefined, "codemode/1"]) {
			for (const toolName of ["edit", "write", "bash", "codemode", "deferred_mutation", "mcp__server__delete"]) {
				assert.equal((await runner.emitToolCall({ type: "tool_call", toolCallId: "call", toolName, input: {}, parentToolCallId })).block, true);
			}
			assert.equal(await runner.emitToolCall({ type: "tool_call", toolCallId: "call", toolName: "git_show", input: {}, parentToolCallId }), undefined);
		}
		const output = await boundedOutput("wide text\n".repeat(10000));
		assert.match(output.content[0].text, /Output truncated/);
		assert.equal(readFileSync(output.details.fullOutputPath, "utf8"), "wide text\n".repeat(10000));
		rmSync(dirname(output.details.fullOutputPath), { recursive: true });
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("child cancellation escalates while alive and cleans listeners and timers on close", async () => {
	const controller = new AbortController();
	const proc = new EventEmitter();
	const signals = [];
	proc.kill = (signal) => { signals.push(signal); proc.killed = true; };
	bindChildCancellation(proc, controller.signal, 10);
	controller.abort();
	await sleep(30);
	assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
	proc.emit("close", null);
	assert.equal(getEventListeners(controller.signal, "abort").length, 0);
	const finished = new EventEmitter();
	finished.kill = () => assert.fail("Exited child was killed");
	const other = new AbortController();
	bindChildCancellation(finished, other.signal, 10);
	finished.emit("close", 0);
	other.abort();
	await sleep(20);
	assert.equal(getEventListeners(other.signal, "abort").length, 0);
	// Exercise a real child which deliberately ignores SIGTERM.
	const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"]);
	try {
		await new Promise((resolve) => child.stdout.once("data", resolve));
		const real = new AbortController();
		bindChildCancellation(child, real.signal, 30);
		const exit = new Promise((resolve) => child.once("close", (_code, signal) => resolve(signal)));
		real.abort();
		assert.equal(await exit, "SIGKILL");
	} finally { child.kill("SIGKILL"); }
});

await test("PR refs refresh from the requested repository and never reuse stale origin refs", async () => {
	const calls = [];
	const pi = { exec: async (...args) => { calls.push(args); return { code: 0, stdout: "owner/repo\n" }; } };
	const ref = await ensurePrRef(pi, "owner/repo", 123, process.cwd());
	await ensurePrRef(pi, "owner/repo", 123, process.cwd());
	assert.equal(calls.length, 4);
	assert.deepEqual(calls[1][1], ["fetch", "--no-tags", "https://github.com/owner/repo.git", `+refs/pull/123/head:${ref}`]);
	await assert.rejects(ensurePrRef(pi, "other/repo", 123, process.cwd()), /requires a checkout/);
	assert.equal(await ensurePrRef({ exec: async (name) => name === "gh" ? { code: 0, stdout: "owner/repo" } : { code: 1 } }, "owner/repo", 123, process.cwd()), undefined);
});

await test("questionnaire aborts, validates IDs and bounds tall and tiny layouts", async () => {
	await assert.rejects(dialog([{ ...question, id: " " }]).result, /unique/);
	const controller = new AbortController();
	const tall = dialog([{ ...question, options: Array.from({ length: 50 }, (_, i) => ({ value: String(i), label: `Choice ${i}`, description: "Long description" })) }], controller.signal, 10);
	for (const width of [1, 2, 4, 10, 80]) {
		const lines = tall.component.render(width);
		assert(lines.length <= 8);
		assert(lines.every((line) => visibleWidth(line) <= width));
	}
	for (let i = 0; i < 30; i++) tall.component.handleInput("j");
	assert(tall.component.render(80).some((line) => line.includes("Choice 30")));
	const before = tall.component.render(80).join("\n");
	tall.component.handleInput("\x1b[6~");
	assert.notEqual(tall.component.render(80).join("\n"), before);
	controller.abort();
	assert.equal((await tall.result).details.cancelled, true);
	assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

await test("deep-review subprocess parses complete answers, tool usage and cleans temporary prompts", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-review-process-test-"));
	const originalScript = process.argv[1];
	const originalAgent = process.env.PI_CODING_AGENT_DIR;
	try {
		mkdirSync(join(dir, "agents"));
		writeFileSync(join(dir, "agents/pr-reviewer.md"), "---\ntools: read, git_show, bash\n---\nReview code.\n");
		const fixture = join(dir, "child.cjs");
		const argsFile = join(dir, "args.json");
		writeFileSync(fixture, `const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
const fail = process.argv.includes('test/fail');
console.log(JSON.stringify({type:'compaction_end', result:{usage:${JSON.stringify(usage(10, 1))}}}));
console.log(JSON.stringify({type:'message_end', message:{role:'toolResult', usage:${JSON.stringify(usage(20, 2))}}}));
console.log(JSON.stringify({type:'message_end', message:{role:'assistant', provider:'test', model:fail?'fail':'model', stopReason:fail?'error':'stop', usage:${JSON.stringify(usage(100, 3))}, content:[{type:'text',text:'First'},{type:'text',text:'Second'}]}}));`);
		process.argv[1] = fixture;
		process.env.PI_CODING_AGENT_DIR = dir;
		const result = await runPrReviewSubagent("Review this diff", dir, undefined, { provider: "test", id: "model" }, () => {});
		assert.equal(result.ok, true);
		assert.equal(result.review, "First\nSecond");
		assert.equal(result.usage.input, 130);
		assert.equal(result.usage.cost, 6);
		const args = JSON.parse(readFileSync(argsFile, "utf8"));
		assert.equal(args[args.indexOf("--tools") + 1], "read,git_show");
		assert(!existsSync(args[args.indexOf("--append-system-prompt") + 1]));
		assert.equal((await runPrReviewSubagent("Review", dir, undefined, { provider: "test", id: "fail" }, () => {})).ok, false);
	} finally {
		process.argv[1] = originalScript;
		if (originalAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgent;
		rmSync(dir, { recursive: true, force: true });
	}
});

await test("quick-review budgets omit oversized files and failed responses retain usage", async () => {
	const largeDiff = `diff --git a/large b/large\n${"+large line\n".repeat(20000)}`;
	let prompt;
	let stopReason = "stop";
	const ctx = { model: { id: "test", provider: "test" }, modelRegistry: {
		streamSimple(_model, context) {
			prompt = context.messages[0].content[0].text;
			return { result: async () => ({ stopReason, errorMessage: stopReason === "error" ? "Provider failure" : undefined, usage: usage(50, 2), content: [{ type: "text", text: "Review text" }] }) };
		},
	} };
	assert.equal((await performReview({}, largeDiff, undefined, undefined, ctx)).ok, true);
	assert(Buffer.byteLength(prompt) < 125000);
	assert.match(prompt, /Not reviewed: large/);
	for (const reason of ["error", "aborted", "length"]) {
		stopReason = reason;
		const result = await performReview({}, largeDiff, undefined, undefined, ctx);
		assert.equal(result.ok, false);
		assert.deepEqual(result.usage, usage(50, 2));
	}
});

await test("quick review cancellation and shutdown do not publish stale results", async () => {
	const command = review.commands.get("review-diff");
	const notices = [], entries = [], messages = [];
	let started;
	const ready = new Promise((resolve) => { started = resolve; });
	loaded.runtime.exec = async () => ({ code: 0, stdout: "diff --git a/file b/file\n+after\n", stderr: "" });
	loaded.runtime.appendEntry = (...args) => entries.push(args);
	loaded.runtime.sendMessage = (message) => messages.push(message);
	let signal;
	const ctx = { cwd: process.cwd(), model: { id: "test", provider: "test" }, ui: { notify: (text) => notices.push(text) }, modelRegistry: {
		streamSimple(_model, _context, options) {
			signal = options.signal;
			started();
			return { result: () => new Promise((resolve) => options.signal.addEventListener("abort", () => resolve({ stopReason: "aborted", usage: usage(10), content: [] }), { once: true })) };
		},
	} };
	const running = command.handler("unstaged", ctx);
	await ready;
	await command.handler("unstaged", ctx);
	assert(notices.some((text) => text.includes("already running")));
	await review.handlers.get("session_shutdown")[0]({}, ctx);
	await running;
	assert(signal.aborted);
	assert.equal(messages.length, 0);
	assert.equal(entries[0][0], "review-usage");
});

console.log(`\nPi ${JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version} loader/runtime and component tests: ${passed} passed`);
