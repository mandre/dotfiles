import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import questionnaire from "../questionnaire.js";

// Loaded only by pty-smoke.py, not by extension discovery.
export default function (pi: ExtensionAPI) {
	let tool: ToolDefinition;
	questionnaire({ ...pi, registerTool(definition) { tool = definition; } });
	pi.registerCommand("smoke", {
		handler: async (_args, ctx) => {
			const result = await tool.execute("smoke", { questions: [{
				id: "target", prompt: "SMOKE_TARGET", allowOther: false,
				options: [{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }],
			}] }, undefined, undefined, ctx as any);
			assert.equal((result.details as any).answers[0].value, "beta");
			const custom = await tool.execute("custom", { questions: [{
				id: "custom", prompt: "SMOKE_CUSTOM", options: [],
			}] }, undefined, undefined, ctx as any);
			assert.equal((custom.details as any).answers[0].value, "terminal answer");
			writeFileSync(process.env.PI_SMOKE_RESULT!, "passed\n");
			ctx.shutdown();
		},
	});
}
