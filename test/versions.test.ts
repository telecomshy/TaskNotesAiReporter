import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions: Record<string, string> = JSON.parse(readFileSync("versions.json", "utf8"));

test("package.json 与 manifest.json 版本一致", () => {
	assert.equal(manifest.version, pkg.version);
});

test("versions.json 记录当前 manifest 版本与其 minAppVersion", () => {
	assert.equal(versions[manifest.version], manifest.minAppVersion);
});
