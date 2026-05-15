import { extractDoneSteps, extractNaturalDoneSteps, extractTodoItems, markCompletedSteps, cleanStepText, isSafeCommand, type TodoItem } from "./utils.js";

// Simple test runner
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${message}`);
	}
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${message}\n  expected: ${e}\n  actual:   ${a}`);
	}
}

// --- extractDoneSteps ---

assertDeepEqual(extractDoneSteps("I completed the task [DONE:1]"), [1], "extractDoneSteps: basic [DONE:1]");
assertDeepEqual(extractDoneSteps("[DONE:3] and [DONE:5]"), [3, 5], "extractDoneSteps: multiple markers");
assertDeepEqual(extractDoneSteps("[done:2]"), [2], "extractDoneSteps: case insensitive");
assertDeepEqual(extractDoneSteps("No markers here"), [], "extractDoneSteps: no markers");
assertDeepEqual(extractDoneSteps("[DONE:0]"), [0], "extractDoneSteps: step 0");

// --- extractNaturalDoneSteps ---

assertDeepEqual(extractNaturalDoneSteps("✅ Step 1"), [1], "natural: checkmark step");
assertDeepEqual(extractNaturalDoneSteps("✅ 3"), [3], "natural: checkmark number only");
assertDeepEqual(extractNaturalDoneSteps("Step 2 is done"), [2], "natural: step N is done");
assertDeepEqual(extractNaturalDoneSteps("Step 4 completed"), [4], "natural: step N completed");
assertDeepEqual(extractNaturalDoneSteps("completed step 5"), [5], "natural: completed step N");
assertDeepEqual(extractNaturalDoneSteps("Finished step 3"), [3], "natural: finished step N");
assertDeepEqual(extractNaturalDoneSteps("Done with step 7"), [7], "natural: done with step N");
assertDeepEqual(extractNaturalDoneSteps("## Step 2: Update the config"), [2], "natural: markdown heading step");
assertDeepEqual(extractNaturalDoneSteps("### Step 1 - Fix the bug"), [1], "natural: heading with dash");
assertDeepEqual(extractNaturalDoneSteps("Step 2 is done and step 3 completed"), [2, 3], "natural: multiple matches");
assertDeepEqual(extractNaturalDoneSteps("No step info here"), [], "natural: no matches");
assertDeepEqual(
	extractNaturalDoneSteps("✅ Step 1 and step 1 is done"),
	[1],
	"natural: deduplicates same step"
);

// --- extractTodoItems (step number preservation) ---

{
	const plan = `Here is my analysis.

**Plan:**
1. Fix the bug in parser
2. Update the tests
3. Add documentation
`;
	const items = extractTodoItems(plan);
	assert(items.length === 3, "extractTodoItems: extracts 3 items");
	assertDeepEqual(items.map((i) => i.step), [1, 2, 3], "extractTodoItems: preserves step numbers 1,2,3");
}

{
	// When items get filtered, step numbers should still match original
	const plan = `**Plan:**
1. First real step here
2. \`x\`
3. Third step description
4. -
5. Fifth step description
`;
	const items = extractTodoItems(plan);
	// Items 2 and 4 should be filtered (backtick, dash, too short)
	assert(items.length === 3, `extractTodoItems filtered: expected 3 items, got ${items.length}`);
	assertDeepEqual(
		items.map((i) => i.step),
		[1, 3, 5],
		"extractTodoItems filtered: preserves original step numbers [1, 3, 5]"
	);
}

// --- markCompletedSteps (combined detection) ---

{
	const items: TodoItem[] = [
		{ step: 1, text: "Fix the bug", completed: false },
		{ step: 2, text: "Update tests", completed: false },
		{ step: 3, text: "Add docs", completed: false },
	];
	const marked = markCompletedSteps("[DONE:1] and step 3 is done", items);
	assert(marked === 2, `markCompletedSteps combined: expected 2 marked, got ${marked}`);
	assert(items[0].completed === true, "markCompletedSteps combined: step 1 completed via [DONE:1]");
	assert(items[1].completed === false, "markCompletedSteps combined: step 2 still incomplete");
	assert(items[2].completed === true, "markCompletedSteps combined: step 3 completed via natural");
}

{
	// Already-completed items should not be double-counted
	const items: TodoItem[] = [
		{ step: 1, text: "Fix the bug", completed: true },
		{ step: 2, text: "Update tests", completed: false },
	];
	const marked = markCompletedSteps("[DONE:1] [DONE:2]", items);
	assert(marked === 1, `markCompletedSteps already done: expected 1 newly marked, got ${marked}`);
	assert(items[1].completed === true, "markCompletedSteps already done: step 2 now completed");
}

{
	// Step number mismatch: [DONE:4] with no step 4 in items
	const items: TodoItem[] = [
		{ step: 1, text: "First", completed: false },
		{ step: 3, text: "Third", completed: false },
	];
	const marked = markCompletedSteps("[DONE:4]", items);
	assert(marked === 0, "markCompletedSteps mismatch: no step 4, nothing marked");
	assert(items[0].completed === false, "markCompletedSteps mismatch: step 1 unchanged");
	assert(items[1].completed === false, "markCompletedSteps mismatch: step 3 unchanged");
}

// --- cleanStepText ---

assert(cleanStepText("**Bold text**") === "Bold text", "cleanStepText: removes bold");
assert(cleanStepText("`code`") === "Code", "cleanStepText: removes backticks, capitalizes");
assert(cleanStepText("Update the configuration file") === "Configuration file", "cleanStepText: strips action prefix");
assert(
	cleanStepText("A very long step description that exceeds the fifty character limit by quite a bit").length === 50,
	"cleanStepText: truncates to 50 chars"
);

// --- isSafeCommand: gws read-only commands ---

// Safe gws commands
assert(isSafeCommand("gws --help"), "gws: top-level --help is safe");
assert(isSafeCommand("gws sheets --help"), "gws: service-level --help is safe");
assert(isSafeCommand("gws drive -h"), "gws: service-level -h is safe");
assert(isSafeCommand("gws schema docs.documents.get"), "gws: schema introspection is safe");
assert(isSafeCommand("gws sheets +read --spreadsheet ID --range \"Sheet1!A1:D10\""), "gws: sheets +read is safe");
assert(isSafeCommand('gws docs documents get --params \'{"documentId":"abc"}\''), "gws: docs documents get is safe");
assert(isSafeCommand('gws drive files list --params \'{"pageSize": 5}\''), "gws: drive files list is safe");
assert(isSafeCommand("gws drive files export --params '{\"fileId\":\"abc\"}'"), "gws: drive files export is safe");
assert(isSafeCommand("gws drive files download --params '{\"fileId\":\"abc\"}'"), "gws: drive files download is safe");
assert(isSafeCommand("gws sheets spreadsheets get --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets spreadsheets get is safe");
assert(isSafeCommand("gws slides presentations get --params '{\"presentationId\":\"abc\"}'"), "gws: slides presentations get is safe");
assert(isSafeCommand("gws drive about get --params '{\"fields\":\"*\"}'"), "gws: drive about get is safe");
assert(isSafeCommand("gws drive drives list"), "gws: drive drives list is safe");
assert(isSafeCommand("gws drive files listLabels --params '{\"fileId\":\"abc\"}'"), "gws: drive files listLabels is safe");
assert(isSafeCommand("gws drive files generateIds"), "gws: drive files generateIds is safe");
assert(isSafeCommand("gws sheets spreadsheets getByDataFilter --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets getByDataFilter is safe");
assert(isSafeCommand("gws drive changes getStartPageToken"), "gws: drive changes getStartPageToken is safe");
assert(isSafeCommand("gws drive permissions list --params '{\"fileId\":\"abc\"}'"), "gws: drive permissions list is safe");
assert(isSafeCommand("gws drive comments list --params '{\"fileId\":\"abc\",\"fields\":\"*\"}'"), "gws: drive comments list is safe");

// Destructive gws commands (must be blocked)
assert(!isSafeCommand("gws sheets +append --spreadsheet ID --range Sheet1 --json '{\"values\": [[\"a\"]]}'"), "gws: sheets +append is blocked");
assert(!isSafeCommand("gws docs +write --document ID --text 'hello'"), "gws: docs +write is blocked");
assert(!isSafeCommand("gws docs documents create --json '{\"title\":\"New Doc\"}'"), "gws: docs documents create is blocked");
assert(!isSafeCommand("gws sheets spreadsheets batchUpdate --params '{\"spreadsheetId\":\"abc\"}'"), "gws: sheets batchUpdate is blocked");
assert(!isSafeCommand("gws drive files update --params '{\"fileId\":\"abc\"}'"), "gws: drive files update is blocked");
assert(!isSafeCommand("gws drive files delete --params '{\"fileId\":\"abc\"}'"), "gws: drive files delete is blocked");
assert(!isSafeCommand("gws drive files copy --params '{\"fileId\":\"abc\"}'"), "gws: drive files copy is blocked");
assert(!isSafeCommand("gws drive files modifyLabels --params '{\"fileId\":\"abc\"}'"), "gws: drive files modifyLabels is blocked");
assert(!isSafeCommand("gws drive accessproposals resolve --params '{\"fileId\":\"abc\"}'"), "gws: drive accessproposals resolve is blocked");
assert(!isSafeCommand("gws slides presentations create --json '{\"title\":\"New\"}'"), "gws: slides presentations create is blocked");
assert(!isSafeCommand("gws docs documents batchUpdate --params '{\"documentId\":\"abc\"}'"), "gws: docs batchUpdate is blocked");
assert(!isSafeCommand("gws drive drives create --params '{\"requestId\":\"abc\"}'"), "gws: drive drives create is blocked");
assert(!isSafeCommand("gws drive permissions delete --params '{\"fileId\":\"abc\"}'"), "gws: drive permissions delete is blocked");
assert(!isSafeCommand("gws drive drives hide --params '{\"driveId\":\"abc\"}'"), "gws: drive drives hide is blocked");
assert(!isSafeCommand("gws drive channels stop --json '{\"id\":\"abc\"}'"), "gws: drive channels stop is blocked");

// --- Summary ---

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
