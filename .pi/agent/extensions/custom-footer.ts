/**
 * Custom Footer Extension
 *
 * Two-line footer:
 * Line 1: ~/path (branch) • session-name            (provider) model • thinking
 * Line 2: 42%/200k ↑in ↓out R… W… CH…% $cost (sub)         extension statuses
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	let requestRender: (() => void) | undefined;

	pi.on("thinking_level_select", async () => {
		requestRender?.();
	});

	pi.on("model_select", async () => {
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
					const fmt = (n: number) => {
						if (n < 1000) return `${n}`;
						if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
						if (n < 1000000) return `${Math.round(n / 1000)}k`;
						return `${(n / 1000000).toFixed(1)}M`;
					};

					// ── Line 1 left: ~/path (branch) • session-name ──
					const branch = footerData.getGitBranch();
					const home = process.env.HOME || process.env.USERPROFILE || "";
					const displayPath = home && ctx.cwd.startsWith(home)
						? "~" + ctx.cwd.slice(home.length)
						: ctx.cwd;
					let pathStr = theme.fg("dim", displayPath);
					if (branch) {
						pathStr += " " + theme.fg("accent", `(${branch})`);
					}
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) {
						pathStr += theme.fg("dim", " • ") + theme.fg("muted", sessionName);
					}

					// ── Line 1 right: (provider) model • thinking ──
					const modelId = ctx.model?.id || "no-model";
					const thinking = pi.getThinkingLevel();
					const thinkingStr = thinking !== "off"
						? ` ${theme.fg("dim", "•")} ${theme.fg("muted", thinking)}`
						: "";
					let modelStr = theme.fg("dim", modelId) + thinkingStr;
					if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
						const withProvider = theme.fg("dim", `(${ctx.model.provider}) `) + modelStr;
						if (visibleWidth(pathStr) + 2 + visibleWidth(withProvider) <= width) {
							modelStr = withProvider;
						}
					}

					// ── Line 2 left: context + tokens + cache + cost ──
					const ctxUsage = ctx.getContextUsage();
					const contextWindow = ctx.model?.contextWindow || 0;
					const usageRatio = contextWindow > 0 && ctxUsage?.tokens != null
						? ctxUsage.tokens / contextWindow
						: 0;
					const usageColor = usageRatio >= 0.8 ? "error" : usageRatio >= 0.5 ? "warning" : "success";
					const contextStr = contextWindow > 0 && ctxUsage?.tokens != null
						? theme.fg(usageColor, `${Math.round(usageRatio * 100)}%`) +
						  theme.fg("dim", `/${fmt(contextWindow)}`)
						: theme.fg("dim", contextWindow > 0 ? `?/${fmt(contextWindow)}` : "—");

					// Accumulate usage from all sources on the active branch
					let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
					let latestCacheHitRate: number | undefined;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cacheRead += m.usage.cacheRead;
							cacheWrite += m.usage.cacheWrite;
							cost += m.usage.cost.total;
							const promptTokens = m.usage.input + m.usage.cacheRead + m.usage.cacheWrite;
							if (promptTokens > 0) {
								latestCacheHitRate = (m.usage.cacheRead / promptTokens) * 100;
							}
						} else if (e.type === "message" && e.message.role === "toolResult" && (e.message as any).usage) {
							const u = (e.message as any).usage;
							input += u.input || 0;
							output += u.output || 0;
							cacheRead += u.cacheRead || 0;
							cacheWrite += u.cacheWrite || 0;
							cost += u.cost?.total || 0;
						} else if ((e.type === "branch_summary" || e.type === "compaction") && (e as any).usage) {
							const u = (e as any).usage;
							input += u.input || 0;
							output += u.output || 0;
							cacheRead += u.cacheRead || 0;
							cacheWrite += u.cacheWrite || 0;
							cost += u.cost?.total || 0;
						}
					}

					const dimParts: string[] = [];
					if (input) dimParts.push(`↑${fmt(input)}`);
					if (output) dimParts.push(`↓${fmt(output)}`);
					if (cacheRead) dimParts.push(`R${fmt(cacheRead)}`);
					if (cacheWrite) dimParts.push(`W${fmt(cacheWrite)}`);
					if ((cacheRead > 0 || cacheWrite > 0) && latestCacheHitRate !== undefined) {
						dimParts.push(`CH${latestCacheHitRate.toFixed(0)}%`);
					}
					const usingSubscription = ctx.model
						? ctx.model.provider === "kimi-coding" || ctx.modelRegistry.isUsingOAuth(ctx.model)
						: false;
					if (cost || usingSubscription) {
						dimParts.push(`$${cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
					}
					const tokens = contextStr + (dimParts.length > 0 ? " " : "") + theme.fg("dim", dimParts.join(" "));

					// ── Line 2 right: extension statuses ──
					const statuses = footerData.getExtensionStatuses();
					const statusParts: string[] = [];
					for (const [, value] of statuses) {
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
