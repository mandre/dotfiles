/**
 * Custom Footer Extension
 *
 * Two-line footer:
 * Line 1: path (branch)                    model • thinking
 * Line 2: context ↑in ↓out $cost                    plan mode
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	let requestRender: (() => void) | undefined;

	pi.on("thinking_level_select", async () => {
		requestRender?.();
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() {
					unsub();
					requestRender = undefined;
				},
				invalidate() {},
                render(width: number): string[] {
					// ── Shared data ──
					const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);

					// ── Line 1 left: path (branch) ──
					const branch = footerData.getGitBranch();
					const cwd = ctx.cwd.replace(/^\/home\/[^/]+/, "~");
					const shortPath = cwd.split("/").slice(-2).join("/");
					const pathStr = branch
						? theme.fg("dim", `${shortPath} `) + theme.fg("accent", `( ${branch})`)
						: theme.fg("dim", shortPath);

					// ── Line 1 right: model • thinking ──
					const modelName = ctx.model?.name || ctx.model?.id || "no-model";
					const thinking = pi.getThinkingLevel();
					const thinkingStr = thinking !== "off" ? ` ${theme.fg("dim", "•")} ${theme.fg("muted", thinking)}` : "";
					const modelStr = theme.fg("dim", modelName) + thinkingStr;

					// ── Line 2 left: context usage + token stats ──
					const usage = ctx.getContextUsage();
					const contextWindow = ctx.model?.contextWindow || 0;
					const usageRatio = contextWindow > 0 && usage ? usage.tokens / contextWindow : 0;
					const usageColor = usageRatio >= 0.8 ? "error" : usageRatio >= 0.5 ? "warning" : "success";
					const usagePct = contextWindow > 0 && usage
						? theme.fg(usageColor, `${Math.round(usageRatio * 100)}%`)
						: theme.fg("dim", "—");

					let input = 0, output = 0, cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cost += m.usage.cost.total;
						}
					}
					const tokens = usagePct + theme.fg("dim", ` ↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}`);

					// ── Line 2 right: extension statuses ──
					const statuses = footerData.getExtensionStatuses();
					const statusParts: string[] = [];
					for (const [key, value] of statuses) {
						if (value) statusParts.push(value);
					}
					const statusStr = statusParts.join(theme.fg("dim", " │ "));

					// ── Layout ──
					const line1pad = " ".repeat(Math.max(1, width - visibleWidth(pathStr) - visibleWidth(modelStr)));
					const line1 = truncateToWidth(pathStr + line1pad + modelStr, width);

					const line2pad = " ".repeat(Math.max(1, width - visibleWidth(tokens) - visibleWidth(statusStr)));
					const line2 = truncateToWidth(tokens + line2pad + statusStr, width);

					return [line1, line2];
				},
			};
		});
	});
}
