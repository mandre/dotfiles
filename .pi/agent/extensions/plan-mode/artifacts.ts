import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_MEMBER_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const MAX_OUTPUT_BYTES = 32 * 1024;

export interface ArtifactInput {
	repository: string;
	artifactId: number;
	member?: string;
	offset?: number;
	limit?: number;
}

function safeMember(name: string): boolean {
	return name.length > 0 && name.length <= 512 && !/[\\\x00-\x1f\x7f:]/.test(name) &&
		!name.startsWith("/") && !name.split("/").some((part) => part === ".." || part === ".");
}

export function validateArtifactInput(input: ArtifactInput): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(input.repository) || input.repository.length > 200)
		throw new Error("repository must be owner/repo");
	if (!Number.isSafeInteger(input.artifactId) || input.artifactId < 1) throw new Error("Invalid artifact ID");
	if (input.member !== undefined && !safeMember(input.member)) throw new Error("Invalid member path");
	if (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 1 || input.offset > MAX_MEMBER_BYTES))
		throw new Error("Invalid offset");
	if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1000))
		throw new Error("limit must be between 1 and 1000");
}

export async function downloadArtifact(input: ArtifactInput, cwd: string, signal?: AbortSignal): Promise<Buffer> {
	validateArtifactInput(input);
	signal?.throwIfAborted();
	const result = await execFileAsync("gh", ["api", "--hostname", "github.com",
		`repos/${input.repository}/actions/artifacts/${input.artifactId}/zip`], {
		cwd, signal, timeout: 60000, maxBuffer: MAX_ARCHIVE_BYTES, encoding: "buffer",
		env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
	});
	return result.stdout;
}

/** Keep both structured and rendered JSON within the output budget. */
function fitText(text: string): { text: string; truncated: boolean } {
	if (Buffer.byteLength(JSON.stringify(text)) <= MAX_OUTPUT_BYTES / 2) return { text, truncated: false };
	let low = 0, high = text.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (Buffer.byteLength(JSON.stringify(text.slice(0, mid))) <= MAX_OUTPUT_BYTES / 2) low = mid;
		else high = mid - 1;
	}
	// Avoid splitting a UTF-16 surrogate pair.
	if (low && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
	return { text: text.slice(0, low), truncated: true };
}

export async function inspectArtifact(buffer: Buffer, input: ArtifactInput, signal?: AbortSignal) {
	validateArtifactInput(input);
	signal?.throwIfAborted();
	if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("Artifact exceeds 32 MiB compressed limit");
	const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(buffer,
		{ lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
		(error, file) => error ? reject(error) : resolve(file!)));
	const entries: Entry[] = [];
	const seen = new Set<string>();
	let totalBytes = 0;
	try {
		await new Promise<void>((resolve, reject) => {
			const abort = () => { zip.close(); reject(new Error("Artifact inspection aborted")); };
			const cleanup = () => signal?.removeEventListener("abort", abort);
			signal?.addEventListener("abort", abort, { once: true });
			zip.once("error", (error) => { cleanup(); reject(error); });
			zip.once("end", () => { cleanup(); resolve(); });
			zip.on("entry", (entry: Entry) => {
				try {
					signal?.throwIfAborted();
					const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
					if (!safeMember(entry.fileName) || seen.has(entry.fileName) || (mode !== 0 && mode !== 0x8000 && mode !== 0x4000))
						throw new Error("Unsafe, duplicate, or special archive member");
					if ((entry.generalPurposeBitFlag & 1) !== 0 || ![0, 8].includes(entry.compressionMethod))
						throw new Error("Encrypted or unsupported archive member");
					totalBytes += entry.uncompressedSize;
					if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES || entries.length >= MAX_ENTRIES)
						throw new Error("Artifact exceeds entry count or expanded-size limit");
					entries.push(entry); seen.add(entry.fileName); zip.readEntry();
				} catch (error) { cleanup(); zip.close(); reject(error); }
			});
			if (signal?.aborted) abort(); else zip.readEntry();
		});
		const offset = input.offset ?? 1;
		if (input.member === undefined) {
			const page = entries.slice(offset - 1, offset - 1 + Math.min(input.limit ?? 50, 50))
				.map((entry) => ({ name: entry.fileName, bytes: entry.uncompressedSize }));
			while (Buffer.byteLength(JSON.stringify(page)) > MAX_OUTPUT_BYTES / 2) page.pop();
			return { entries: page, totalEntries: entries.length, nextOffset: offset + page.length <= entries.length ? offset + page.length : null };
		}
		const entry = entries.find((entry) => entry.fileName === input.member);
		if (!entry || entry.fileName.endsWith("/")) throw new Error("Text member not found");
		if (entry.uncompressedSize > MAX_MEMBER_BYTES) throw new Error("Member exceeds 8 MiB expanded limit");
		const stream = await new Promise<import("node:stream").Readable>((resolve, reject) =>
			zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!)));
		const abort = () => stream.destroy(new Error("Artifact inspection aborted"));
		signal?.addEventListener("abort", abort, { once: true });
		const chunks: Buffer[] = [];
		let size = 0;
		try {
			if (signal?.aborted) abort();
			for await (const chunk of stream) {
				size += chunk.length;
				if (size > MAX_MEMBER_BYTES) throw new Error("Member exceeds 8 MiB expanded limit");
				chunks.push(chunk);
			}
		} finally { signal?.removeEventListener("abort", abort); stream.destroy(); }
		const data = Buffer.concat(chunks);
		if (data.includes(0)) throw new Error("Member is binary, not UTF-8 text");
		const lines = new TextDecoder("utf-8", { fatal: true }).decode(data).split("\n");
		const selected = lines.slice(offset - 1, offset - 1 + (input.limit ?? 200));
		const fitted = fitText(selected.join("\n"));
		const linesReturned = fitted.text ? fitted.text.split("\n").length : 0;
		return { member: entry.fileName, text: fitted.text, offset, linesReturned, totalLines: lines.length,
			truncated: fitted.truncated || offset - 1 + selected.length < lines.length,
			nextOffset: fitted.truncated ? offset + Math.max(0, linesReturned - 1) : offset + selected.length <= lines.length ? offset + selected.length : null };
	} finally { zip.close(); }
}

export function registerArtifactTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "github_artifact", label: "Inspect GitHub artifact",
		description: "List ZIP members or read one UTF-8 member from a GitHub Actions artifact on github.com. No disk extraction. Limits: 32 MiB archive, 8 MiB selected member, 10000 entries, 256 MiB declared expansion, 32 KiB JSON output. offset is 1-based: entries for listing, lines for reading. Listing returns at most 50 entries; reading at most 1000 lines. Oversized lines may require another log source.",
		promptSnippet: "List CI artifact members or read a selected text log without extracting files",
		annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
		outputSchema: Type.Union([
			Type.Object({ entries: Type.Array(Type.Object({ name: Type.String(), bytes: Type.Number() })),
				totalEntries: Type.Number(), nextOffset: Type.Union([Type.Number(), Type.Null()]) }),
			Type.Object({ member: Type.String(), text: Type.String(), offset: Type.Number(), linesReturned: Type.Number(),
				totalLines: Type.Number(), truncated: Type.Boolean(), nextOffset: Type.Union([Type.Number(), Type.Null()]) }),
		]),
		parameters: Type.Object({
			repository: Type.String({ description: "owner/repo on github.com" }),
			artifactId: Type.Integer({ minimum: 1 }),
			member: Type.Optional(Type.String({ description: "Exact ZIP member path; omit to list" })),
			offset: Type.Optional(Type.Integer({ minimum: 1 })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
		}),
		async execute(_id, input, signal, _onUpdate, ctx) {
			const data = await downloadArtifact(input, ctx.cwd, signal);
			const result = await inspectArtifact(data, input, signal);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, structuredContent: result };
		},
	});
}
