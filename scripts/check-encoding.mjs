/**
 * Encoding guard: repo text must be UTF-8 without BOM.
 *
 * This machine runs codepage 936 (GBK), so Chinese written through
 * PowerShell's `Set-Content -Encoding UTF8` picks up a BOM, and Chinese
 * round-tripped through a GBK pipe arrives as invalid UTF-8. Both defects
 * are byte-level, so this check reads bytes and never asks the OS what
 * encoding it thinks text is.
 *
 * Usage:
 *   node scripts/check-encoding.mjs staged            # pre-commit: index blobs
 *   node scripts/check-encoding.mjs all               # every tracked file
 *   node scripts/check-encoding.mjs commit-msg <file> # .git/COMMIT_EDITMSG
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Run git and get raw bytes back — never let git pick a console encoding. */
function git(args, input) {
	const res = spawnSync("git", args, {
		// A string input would be converted with `encoding`, which is
		// "buffer" here and is not a valid string encoding — pass bytes.
		input: input === undefined ? undefined : Buffer.from(input),
		encoding: "buffer",
		maxBuffer: 1 << 28,
	});
	if (res.error) throw res.error;
	if (res.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${res.stderr.toString("utf8")}`);
	}
	return res.stdout;
}

/** True when the buffer looks like binary (NUL byte in the head of the file). */
function isBinary(buf) {
	const head = buf.subarray(0, 8000);
	for (const byte of head) if (byte === 0) return true;
	return false;
}

/** True when every byte is ASCII — safe for PowerShell 5.1 without a BOM. */
function isAscii(buf) {
	for (const byte of buf) if (byte > 0x7f) return false;
	return true;
}

/** Return the failures for one buffer, or [] when it is clean. */
function defects(name, buf) {
	if (
		(buf[0] === 0xff && buf[1] === 0xfe) ||
		(buf[0] === 0xfe && buf[1] === 0xff)
	) {
		return [`${name}: starts with a UTF-16 BOM — repo text is UTF-8`];
	}
	// `.ps1` is the one type that *needs* a BOM: Windows PowerShell 5.1 reads a
	// BOM-less script as ANSI, so its own Chinese literals mis-decode at run time.
	if (name.endsWith(".ps1")) {
		if (buf.subarray(0, 3).equals(UTF8_BOM) || isAscii(buf)) return [];
		return [
			`${name}: .ps1 has non-ASCII text but no BOM — PowerShell 5.1 reads it as ANSI (codepage 936)`,
		];
	}
	if (buf.subarray(0, 3).equals(UTF8_BOM)) {
		return [`${name}: starts with a UTF-8 BOM (EF BB BF)`];
	}
	if (isBinary(buf)) return [];
	try {
		utf8.decode(buf);
	} catch {
		return [`${name}: not valid UTF-8 (looks like codepage-936 corruption)`];
	}
	return [];
}

/**
 * Read the *index* blobs, not the working tree: pre-commit must judge what
 * will actually be committed. One `cat-file --batch` call, not N calls.
 */
function indexBlobs(pathspec) {
	const args = ["ls-files", "-s", "-z"];
	if (pathspec.length) args.push("--", ...pathspec);
	const entries = git(args)
		.toString("utf8")
		.split("\0")
		.filter(Boolean);

	const shas = [];
	const names = new Map();
	for (const entry of entries) {
		const tab = entry.indexOf("\t");
		const [, sha] = entry.slice(0, tab).split(" ");
		const path = entry.slice(tab + 1);
		shas.push(sha);
		names.set(sha, path);
	}
	if (!shas.length) return [];

	const out = git(["cat-file", "--batch"], `${shas.join("\n")}\n`);
	const blobs = [];
	let offset = 0;
	while (offset < out.length) {
		const eol = out.indexOf(0x0a, offset);
		if (eol === -1) break;
		const header = out.subarray(offset, eol).toString("utf8");
		const [, type, size] = header.split(" ");
		if (type !== "blob") {
			offset = eol + 1;
			continue;
		}
		const start = eol + 1;
		const buf = out.subarray(start, start + Number(size));
		blobs.push({ name: names.get(header.split(" ")[0]) ?? header, buf });
		offset = start + Number(size) + 1;
	}
	return blobs;
}

function commitEncoding() {
	const res = spawnSync("git", ["config", "--get", "i18n.commitEncoding"], {
		encoding: "utf8",
	});
	return (res.stdout ?? "").trim() || "utf-8";
}

function report(failures) {
	if (!failures.length) return 0;
	console.error(`encoding: ${failures.length} problem(s)\n`);
	for (const failure of failures) console.error(`  - ${failure}`);
	console.error(
		"\nRepo text is UTF-8 without BOM. See CODING_STANDARDS.md and\n" +
			"docs/agents/issue-tracker.md (Windows encoding) for the cause.",
	);
	return 1;
}

const [, , mode, target] = process.argv;

if (mode === "commit-msg") {
	if (!target) {
		console.error("usage: check-encoding.mjs commit-msg <file>");
		process.exit(2);
	}
	if (commitEncoding().toLowerCase().replace("_", "-") !== "utf-8") {
		// The repo declares another commit encoding; git will transcode.
		process.exit(0);
	}
	process.exit(report(defects(target, readFileSync(target))));
}

if (mode === "staged") {
	const staged = git([
		"diff",
		"--cached",
		"--name-only",
		"-z",
		"--diff-filter=ACM",
	])
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	if (!staged.length) process.exit(0);
	const failures = indexBlobs(staged).flatMap(({ name, buf }) =>
		defects(name, buf),
	);
	process.exit(report(failures));
}

if (mode === "all") {
	const blobs = indexBlobs([]);
	const failures = blobs.flatMap(({ name, buf }) => defects(name, buf));
	console.log(`checked ${blobs.length} tracked files`);
	process.exit(report(failures));
}

console.error("usage: check-encoding.mjs <staged|all|commit-msg <file>>");
process.exit(2);
