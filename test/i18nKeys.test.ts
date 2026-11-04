/**
 * 文案键登记测试：源码里用到的键，必须在 en / zh 两本词典里都能解析（#95）。
 *
 * 覆盖两类来源：
 * 1. 静态调用点——被调者名为 `t` 的调用，取第一参数里的字符串字面量（含三元两支、跨行调用）；
 * 2. 动态键——日期口径（模板拼接）、显示矩阵、思考判定这三张映射的值，显式枚举。
 *
 * 断言比对词典的**字符串叶子键集合**，不走翻译器：中文缺失时翻译器会回退英文，
 * 用「t(key) !== key」判断会漏掉中文缺登记。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/i18nKeys.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
	BUNDLES,
	THINKING_VERDICT_NOTICE_KEYS,
	dateFieldLabelKey,
	thinkingDisplayCopy,
} from "../src/i18n";
import { DATE_FIELDS } from "../src/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

interface UsedKey {
	key: string;
	/** 失败定位：`文件:行` 或映射名。 */
	where: string;
}

/** 递归收集 src 下的 .ts 文件。 */
function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return entry.name.endsWith(".ts") ? [full] : [];
	});
}

/** 仓库相对路径（统一用 /，Windows 上失败信息也稳定）。 */
function rel(file: string): string {
	return path.relative(ROOT, file).split(path.sep).join("/");
}

/** 是否翻译器调用：`t(...)` / `ctx.plugin.t(...)` / `this.options.t(...)`。 */
function isTranslatorCallee(expr: ts.Expression): boolean {
	if (ts.isIdentifier(expr)) return expr.text === "t";
	if (ts.isPropertyAccessExpression(expr)) return expr.name.text === "t";
	return false;
}

/**
 * 取单个文件里的静态键。
 * 第一参数的非字面量形态（变量 / 调用 / 元素访问）跳过——它们由动态键枚举兜底；
 * 三元两支递归（`t(open ? "a" : "b")` 两个键都要查）。
 */
function collectFromFile(file: string): UsedKey[] {
	const text = fs.readFileSync(file, "utf8");
	const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const used: UsedKey[] = [];
	const where = (node: ts.Node): string =>
		`${rel(file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;

	const visitArg = (node: ts.Expression): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			used.push({ key: node.text, where: where(node) });
			return;
		}
		if (ts.isParenthesizedExpression(node)) {
			visitArg(node.expression);
			return;
		}
		if (ts.isConditionalExpression(node)) {
			visitArg(node.whenTrue);
			visitArg(node.whenFalse);
		}
	};

	const walk = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && isTranslatorCallee(node.expression)) {
			const arg = node.arguments[0];
			if (arg) visitArg(arg);
		}
		ts.forEachChild(node, walk);
	};

	walk(sourceFile);
	return used;
}

/** 词典的字符串叶子键（数组走 calendarLabels，不算 t 的键）。 */
function stringKeys(value: unknown, prefix = ""): string[] {
	if (Array.isArray(value)) return [];
	if (value && typeof value === "object") {
		return Object.keys(value).flatMap((key) =>
			stringKeys((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key)
		);
	}
	return typeof value === "string" ? [prefix] : [];
}

function assertRegistered(entries: UsedKey[], label: string): void {
	assert.ok(entries.length > 0, `${label}：没有收集到任何键，抽取逻辑失效`);
	for (const lang of ["en", "zh"] as const) {
		const known = new Set(stringKeys(BUNDLES[lang]));
		const missing = entries.filter((entry) => !known.has(entry.key));
		assert.deepEqual(
			missing.map((entry) => `${entry.key} (${entry.where})`),
			[],
			`${label}：${lang} 缺少以下文案键`
		);
	}
}

test("静态 t(\"…\") 用到的键都在中英两本词典里", () => {
	const used = sourceFiles(SRC).flatMap(collectFromFile);
	assert.ok(used.length > 100, `扫描到的调用点太少（${used.length}），抽取逻辑可能失效`);
	assertRegistered(used, "静态调用点");
});

test("动态键（日期口径 / 显示矩阵 / 思考判定）都已登记", () => {
	const entries: UsedKey[] = [
		...DATE_FIELDS.map((field) => ({
			key: dateFieldLabelKey(field),
			where: "DATE_FIELDS",
		})),
		...Object.values(thinkingDisplayCopy).flatMap((copy) => [
			{ key: copy.badge, where: "thinkingDisplayCopy.badge" },
			{ key: copy.footnote, where: "thinkingDisplayCopy.footnote" },
		]),
		...Object.values(THINKING_VERDICT_NOTICE_KEYS).map((key) => ({
			key,
			where: "THINKING_VERDICT_NOTICE_KEYS",
		})),
	];
	assertRegistered(entries, "动态键");
});
