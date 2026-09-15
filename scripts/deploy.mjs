/**
 * 把构建产物部署到本地 Obsidian 测试 vault。
 *
 * 用法：`npm run deploy`（先 build，再复制 main.js / manifest.json / styles.css）。
 * vault 解析顺序：`$OBSIDIAN_VAULT` → `obsidian.json` 里 open=true 的那个 → 唯一的那个。
 * 只复制这三个产物，**绝不触碰 data.json**。
 *
 * 本文件在 eslint 的 scripts/ 忽略区内，故可安全出现 `.obsidian` 字面量。
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const PLUGIN_ID = "tasknotes-aireporter";

/** Obsidian 的全局配置路径（内含各 vault 的绝对路径）。 */
function obsidianConfigPath() {
	const home = homedir();
	switch (platform()) {
		case "win32":
			return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "obsidian", "obsidian.json");
		case "darwin":
			return join(home, "Library", "Application Support", "obsidian", "obsidian.json");
		default:
			return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "obsidian", "obsidian.json");
	}
}

/** 解析目标 vault 根目录。 */
function resolveVault() {
	if (process.env.OBSIDIAN_VAULT) return resolve(process.env.OBSIDIAN_VAULT);

	const configPath = obsidianConfigPath();
	if (!existsSync(configPath)) {
		throw new Error(
			`找不到 Obsidian 配置：${configPath}\n请设置环境变量 OBSIDIAN_VAULT 指向 vault 根目录。`
		);
	}

	const vaults = Object.values(JSON.parse(readFileSync(configPath, "utf8")).vaults ?? {});
	const paths = vaults.map((vault) => vault.path).filter(Boolean);
	const chosen = vaults.find((vault) => vault.open)?.path ?? (paths.length === 1 ? paths[0] : null);
	if (!chosen) {
		throw new Error(`无法确定 vault（发现 ${paths.length} 个），请设置环境变量 OBSIDIAN_VAULT。`);
	}
	return resolve(chosen);
}

const vault = resolveVault();
const configDir = process.env.OBSIDIAN_CONFIG_DIR ?? ".obsidian";
const destination = join(vault, configDir, "plugins", PLUGIN_ID);

if (!existsSync(destination)) {
	throw new Error(`插件目录不存在：${destination}\n请先在 Obsidian 中启用该插件。`);
}
for (const name of ARTIFACTS) {
	if (!existsSync(name)) throw new Error(`缺少构建产物：${name}（先运行 npm run build）`);
}

for (const name of ARTIFACTS) copyFileSync(name, join(destination, name));
console.log(`已部署 ${ARTIFACTS.join(" / ")} → ${destination}`);
