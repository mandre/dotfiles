import type { ChildProcess } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { truncateHead } from "@earendil-works/pi-coding-agent";

export const REVIEW_TOOLS = ["read", "grep", "find", "ls", "git_diff", "git_show", "git_log", "git_blame"];

/** Escalate only while the process is alive; release listeners on every exit path. */
export function bindChildCancellation(proc: ChildProcess, signal?: AbortSignal, delay = 5000): () => void {
	let exited = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cleanup = () => {
		exited = true;
		if (timer) clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		proc.removeListener("close", cleanup);
		proc.removeListener("error", cleanup);
	};
	const abort = () => {
		if (exited) return;
		proc.kill("SIGTERM");
		timer = setTimeout(() => { if (!exited) proc.kill("SIGKILL"); }, delay);
		timer.unref();
	};
	proc.once("close", cleanup);
	proc.once("error", cleanup);
	if (signal?.aborted) abort();
	else signal?.addEventListener("abort", abort, { once: true });
	return cleanup;
}

/** Bound model-facing output and retain the complete text for follow-up reads. */
export async function boundedOutput(output: string) {
	const truncation = truncateHead(output);
	if (!truncation.truncated) return { content: [{ type: "text" as const, text: output }], details: {} };
	const directory = await mkdtemp(join(tmpdir(), "pi-review-output-"));
	const fullOutputPath = join(directory, "output.txt");
	await writeFile(fullOutputPath, output, { encoding: "utf8", mode: 0o600 });
	return {
		content: [{ type: "text" as const, text: `${truncation.content}\n\n[Output truncated. Full output: ${fullOutputPath}]` }],
		details: { fullOutputPath, truncation },
	};
}
