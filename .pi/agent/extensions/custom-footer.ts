/**
 * Custom Footer Extension
 *
 * Two-line footer:
 * Line 1: ~/path (branch) • session-name            (provider) model • thinking
 * Line 2: 42%/200k ↑in ↓out R… W… CH…% $cost (sub)         extension statuses
 */

import { sep } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
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
			let cachedUsage: {
				sessionId: string; leafId: string | null;
				input: number; output: number; cacheRead: number; cacheWrite: number; cost: number;
				latestCacheHitRate: number | undefined;
			} | undefined;

			function getUsage() {
				const sessionId = ctx.sessionManager.getSessionId();
				const leafId = ctx.sessionManager.getLeafId();
				// Appending usage or navigating the tree changes the leaf.
				if (cachedUsage?.sessionId === sessionId && cachedUsage.leafId === leafId) {
					return cachedUsage;
				}
				let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
				let latestCacheHitRate: number | undefined;
				for (const entry of ctx.sessionManager.getBranch()) {
					const usage = entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary"
						? entry.usage
						: entry.type === "custom" && entry.customType === "review-usage"
							? (entry.data as { usage?: Usage })?.usage
							: entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")
								? entry.message.usage : undefined;
					if (!usage) continue;
					input += usage.input || 0;
					output += usage.output || 0;
					cacheRead += usage.cacheRead || 0;
					cacheWrite += usage.cacheWrite || 0;
					cost += usage.cost?.total || 0;
					if (entry.type === "message" && entry.message.role === "assistant") {
						const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
						latestCacheHitRate = promptTokens > 0 ? usage.cacheRead / promptTokens * 100 : undefined;
					}
				}
				cachedUsage = { sessionId, leafId, input, output, cacheRead, cacheWrite, cost, latestCacheHitRate };
				return cachedUsage;
			}

			return {
				dispose() {
					unsub();
					requestRender = undefined;
				},
				invalidate() { cachedUsage = undefined; },
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
					const displayPath = home && (ctx.cwd === home || ctx.cwd.startsWith(home + sep))
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
					const contextWindow = ctxUsage?.contextWindow ?? 0;
					const usageRatio = (ctxUsage?.percent ?? 0) / 100;
					const usageColor = usageRatio >= 0.8 ? "error" : usageRatio >= 0.5 ? "warning" : "success";
					const contextStr = contextWindow > 0 && ctxUsage?.tokens != null
						? theme.fg(usageColor, `${Math.round(usageRatio * 100)}%`) +
						  theme.fg("dim", `/${fmt(contextWindow)}`)
						: theme.fg("dim", contextWindow > 0 ? `?/${fmt(contextWindow)}` : "—");

					const { input, output, cacheRead, cacheWrite, cost, latestCacheHitRate } = getUsage();

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
					const align = (left: string, right: string) => {
						if (width < 1) return "";
						const rhs = truncateToWidth(right, width);
						const room = Math.max(0, width - visibleWidth(rhs) - (rhs ? 1 : 0));
						const lhs = truncateToWidth(left, room);
						return lhs + " ".repeat(Math.max(0, width - visibleWidth(lhs) - visibleWidth(rhs))) + rhs;
					};
					const line1 = align(pathStr, modelStr);
					const line2 = align(tokens, statusStr);

					return [line1, line2];
				},
			};
		});
	});
}
