/**
 * 模型行匹配（#112 从 core/thinking 抽出）：`*` 结尾为前缀匹配、`*` 开头为后缀匹配，
 * 否则精确匹配（`*` 单独恒命中）。能力表、策略表与协议表共用同一判定（行键形状同构，
 * ADR-0030 / ADR-0031）。
 *
 * 抽出的唯一原因：`thinkingFor`（#112）要读当前接口协议，而协议表反向需要本判定——
 * 留在 thinking 里会形成 core ↔ core 的环。#114 起 `core/thinking` **不留 re-export**：
 * 三张表与测试一律从这里导入，避免「两条导入路径」把依赖方向又漂回去。
 */
export function matchModelPattern(pattern: string, model: string): boolean {
	if (pattern === "*") return true;
	if (pattern.startsWith("*")) return model.endsWith(pattern.slice(1));
	if (pattern.endsWith("*")) return model.startsWith(pattern.slice(0, -1));
	return pattern === model;
}
