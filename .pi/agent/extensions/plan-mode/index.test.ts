import assert from "node:assert/strict";
import planModeExtension from "./index.js";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Run with the same jiti package aliases used to load extensions.
function harness(mode = "tui") {
	const handlers = new Map<string, Function[]>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	const messages: any[] = [];
	let active = ["read", "bash", "edit", "write", "codemode", "custom_tool"];
	let branch: any[] = [];
	const theme = { fg: (_color: string, text: string) => text, strikethrough: (text: string) => text };
	const ctx = {
		mode,
		ui: { theme, setStatus() {}, setWidget() {}, notify() {}, setWorkingMessage() {} },
		sessionManager: {
			getBranch: () => branch,
			getEntries: () => { throw new Error("Must use active branch"); },
			getLeafId: () => "leaf",
		},
	} as unknown as ExtensionContext;
	const pi = {
		on(name: string, handler: Function) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
		registerTool(tool: any) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: any) { commands.set(name, command); },
		registerFlag() {}, registerShortcut() {}, getFlag: () => false,
		getActiveTools: () => [...active],
		getAllTools: () => ["read", "bash", "edit", "write", "codemode", "custom_tool"].map((name) => ({ name, exposure: "direct" })),
		setActiveTools(names: string[]) { active = [...names]; },
		appendEntry(customType: string, data: unknown) { branch.push({ type: "custom", customType, data: structuredClone(data) }); },
		sendMessage(message: any) { messages.push(message); }, setLabel() {},
	} as unknown as ExtensionAPI;
	planModeExtension(pi);
	return {
		ctx, tools, messages,
		get active() { return active; },
		get branch() { return branch; },
		set branch(value: any[]) { branch = value; },
		async emit(name: string, event: any = {}) {
			let result: any;
			for (const handler of handlers.get(name) ?? []) result = await handler(event, ctx);
			return result;
		},
		command: (name: string, args = "") => commands.get(name).handler(args, ctx),
		progress: (params: any) => tools.get("plan_progress").execute("call", params, undefined, undefined, ctx),
	};
}

type Harness = ReturnType<typeof harness>;
const boundary = { outcome: "completed", continue: false, context: { canContinue: true } };
const snapshot = (completed = false) => ({
	type: "custom", customType: "plan-mode", data: {
		enabled: false, executing: true,
		todos: [1, 2, 3, 4].map((step) => ({ step, text: `Task ${step}`, completed })),
	},
});
async function executing(): Promise<Harness> {
	const h = harness();
	h.branch = [snapshot()];
	await h.emit("session_start");
	await h.emit("before_agent_start", { systemPrompt: "System" });
	return h;
}
const steps = async (h: Harness) => (await h.progress({ action: "list" })).details.todos;
const complete = (h: Harness, ids: number[]) => h.progress({ action: "complete", updates: ids.map((step) => ({ step, evidence: `Verified step ${step}` })) });

let passed = 0;
async function test(name: string, run: () => Promise<void>) {
	await run();
	passed++;
	console.log(`PASS: ${name}`);
}

await test("session 01a18177: one edit, explicit updates, separate validation", async () => {
	const h = await executing();
	await h.emit("turn_end", {
		message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "reviewer.md" } }] },
		toolResults: [{ toolName: "edit", isError: false }],
	});
	assert((await steps(h)).every((t: any) => !t.completed));
	await complete(h, [1, 2, 3]);
	assert.deepEqual((await steps(h)).map((t: any) => t.completed), [true, true, true, false]);
	const reminder = await h.emit("agent_before_settle", boundary);
	assert.equal(reminder.continue, true);
	assert.match(reminder.entries[0].content, /4\. Task 4/);
	await complete(h, [4]);
	await h.emit("agent_before_settle", boundary);
	await h.emit("agent_before_settle", boundary);
	assert.equal(h.messages.filter((m) => m.customType === "plan-complete").length, 1);
	assert(!h.active.includes("plan_progress"));
});

await test("no inferred completion from failures, markers, headings, or claims", async () => {
	const h = await executing();
	for (const isError of [true, false]) {
		await h.emit("turn_end", {
			message: { role: "assistant", content: [
				{ type: "text", text: "[DONE:1] Step 2: Next action. Step 3 is done. Updated all four steps." },
				{ type: "toolCall", name: "bash", arguments: { command: "make test" } },
			] }, toolResults: [{ toolName: "edit", isError }, { toolName: "bash", isError }],
		});
	}
	assert((await steps(h)).every((t: any) => !t.completed));
});

await test("batch validation is atomic and completion is idempotent", async () => {
	const h = await executing();
	for (const updates of [[], [{ step: 0, evidence: "bad" }], [{ step: 1.5, evidence: "bad" }], [{ step: 1, evidence: "ok" }, { step: 99, evidence: "bad" }], [{ step: 1, evidence: " " }]]) {
		await assert.rejects(h.progress({ action: "complete", updates }));
		assert((await steps(h)).every((t: any) => !t.completed));
	}
	await assert.rejects(h.progress({ action: "complete" }));
	await complete(h, [1, 1]);
	const before = await steps(h);
	await complete(h, [1]);
	assert.deepEqual(await steps(h), before);
	const result = await h.progress({ action: "list" });
	result.details.todos[1].completed = true;
	assert.equal((await steps(h))[1].completed, false);
});

await test("one reconciliation per prompt, unfinished tasks remain unchecked", async () => {
	const h = await executing();
	assert.equal((await h.emit("agent_before_settle", boundary)).continue, true);
	await h.emit("agent_start");
	assert.equal(await h.emit("agent_before_settle", boundary), undefined);
	assert((await steps(h)).every((t: any) => !t.completed));
	assert.equal(h.messages.length, 0);
	await h.emit("before_agent_start", { systemPrompt: "System" });
	assert.equal((await h.emit("agent_before_settle", boundary)).continue, true);
});

await test("aborts, errors, existing continuations, and invalid contexts do not request reconciliation", async () => {
	for (const overrides of [{ outcome: "aborted" }, { outcome: "error" }, { continue: true }, { context: { canContinue: false } }]) {
		const h = await executing();
		assert.equal(await h.emit("agent_before_settle", { ...boundary, ...overrides }), undefined);
		assert.equal((await h.emit("agent_before_settle", boundary)).continue, true);
	}
});

await test("status and tool instructions are present on every request", async () => {
	const h = await executing();
	assert(h.active.includes("plan_progress"));
	assert.equal(h.tools.get("plan_progress").exposure, "codemode");
	assert.equal(h.tools.get("plan_progress").executionMode, "sequential");
	for (let i = 0; i < 3; i++) {
		const result = await h.emit("context", { messages: [] });
		assert.match(result.messages[0].content, /call plan_progress/);
		assert.match(result.messages[0].content, /codemode/);
		assert.match(result.messages[0].content, /4\. \[ \] Task 4/);
	}
});

await test("planning tools stay restricted and execute restores original tools", async () => {
	const h = harness();
	const original = [...h.active];
	await h.emit("session_start");
	assert(!h.active.includes("edit"));
	assert(!h.active.includes("plan_progress"));
	await assert.rejects(h.progress({ action: "list" }));
	const blocked = await h.emit("tool_call", { toolName: "bash", input: { command: "rm file" } });
	assert.equal(blocked.block, true);
	h.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Plan:\n1. Update **reviewer.md** and validate wording.\n2. Check the referenced session." }] } });
	await h.command("execute");
	assert.deepEqual(h.active, [...original, "plan_progress"]);
	assert.equal((await steps(h))[0].text, "Update reviewer.md and validate wording.");
	await complete(h, [1, 2]);
	await h.emit("agent_before_settle", boundary);
	assert.deepEqual(h.active, original);
});

await test("manual /done uses the same completion path", async () => {
	const h = await executing();
	await h.command("done", "1.5");
	assert.equal((await steps(h))[0].completed, false);
	await h.command("done", "1");
	assert.equal((await steps(h))[0].completed, true);
	await h.command("done", "1");
	for (const id of [2, 3, 4]) await h.command("done", String(id));
	await h.emit("agent_before_settle", boundary);
	assert.equal(h.messages.filter((m) => m.customType === "plan-complete").length, 1);
});

await test("legacy snapshots restore without replaying markers from other plans", async () => {
	const h = harness();
	h.branch = [
		{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "[DONE:1] [DONE:2] [DONE:3] [DONE:4]" }] } },
		snapshot(),
	];
	h.branch[1].data.todos[0].completed = true;
	await h.emit("session_start");
	assert.deepEqual((await steps(h)).map((t: any) => t.completed), [true, false, false, false]);
	await complete(h, [2]);
	const saved = structuredClone(h.branch);
	const resumed = harness();
	resumed.branch = saved;
	await resumed.emit("session_start");
	assert.deepEqual((await steps(resumed)).map((t: any) => t.completed), [true, true, false, false]);
	assert.equal((await steps(resumed))[1].evidence, "Verified step 2");
});

await test("tree changes restore only the active branch and do not mutate snapshots", async () => {
	const h = await executing();
	const previous = h.branch;
	await complete(h, [1]);
	assert.equal(previous[0].data.todos[0].completed, false);
	h.branch = [snapshot()];
	await h.emit("session_tree");
	assert((await steps(h)).every((t: any) => !t.completed));
	h.branch = [];
	await h.emit("session_tree");
	assert(!h.active.includes("plan_progress"));
	assert(!h.active.includes("edit"));
});

await test("non-TUI runs retain full tools and never reconcile", async () => {
	for (const mode of ["json", "print", "rpc"]) {
		const h = harness(mode);
		const original = [...h.active];
		h.branch = [snapshot()];
		await h.emit("session_start");
		assert.deepEqual(h.active, original);
		await assert.rejects(h.progress({ action: "list" }));
		assert.equal(await h.emit("agent_before_settle", boundary), undefined);
		assert.equal(await h.emit("before_agent_start", { systemPrompt: "System" }), undefined);
	}
});

await test("toggling planning during execution removes progress access and restores baseline tools", async () => {
	const h = await executing();
	const baseline = h.active.filter((name) => name !== "plan_progress");
	await h.command("plan");
	assert(!h.active.includes("plan_progress"));
	await assert.rejects(h.progress({ action: "complete", updates: [{ step: 1, evidence: "Stale" }] }));
	await h.command("plan");
	assert.deepEqual(h.active, baseline);
});

await test("a later plan does not inherit completed tasks from an earlier plan", async () => {
	const h = await executing();
	await complete(h, [1, 2, 3, 4]);
	await h.emit("agent_before_settle", boundary);
	await h.command("plan");
	h.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Plan:\n1. Implement a separate task.\n" }] } });
	await h.command("execute");
	assert.deepEqual((await steps(h)).map((t: any) => t.completed), [false]);
});

console.log(`\nExtension tests: ${passed} passed`);
