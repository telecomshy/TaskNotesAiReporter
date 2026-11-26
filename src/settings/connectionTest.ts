/**
 * 「测试」按钮的请求装配（#111，ADR-0032）：与生成共用同一个装配缝（`assembleChatRequest`），
 * 因此「测试通过 ⇒ 生成可用」更真（带习得条目的自定义行还会发该行解析出的思考参数）。
 *
 * 按钮测的是**连通性**（一次 chat ping），故以 `connectionTest` 命名，与「思考测试」
 * （`thinkingTest`）区分（#111 复查第 4 条）。
 *
 * ping 消息是按钮的装配输入（不再由执行层内置）；守卫（need-url / need-model）与
 * 密钥解析（按供应商认证方式）留在视图侧，本模块只把按钮的输入折成请求。
 *
 * 纯函数，无 obsidian、无 DOM。
 */

import type { ModelProvider, ModelRequest, RequestGlobals } from "../types";
import { assembleChatRequest, resolveModelFacts } from "../ai/modelRequest";

/** 「测试」按钮的装配输入（来自该模型行的输入框与全局设置）。 */
export interface ConnectionTestInput {
	provider: ModelProvider;
	/** 输入框里的模型 ID（已 trim）。 */
	modelId: string;
	/** 输入框里的行级 Max Tokens；未填＝undefined（回落全局）。 */
	maxTokens?: number;
	/** 按供应商认证方式解析出的密钥值（无认证为空串）。 */
	apiKey: string;
	globals: RequestGlobals;
}

/** 按钮的连通性探测消息（#111：ping 归装配输入，不再由执行层内置）。 */
const CONNECTION_TEST_PING = "ping";

/** 装配「测试」按钮的一次对话请求（与生成同源：同一事实解析、同一策略算术）。 */
export function connectionTestRequest(input: ConnectionTestInput): ModelRequest {
	const { provider, modelId, maxTokens, apiKey, globals } = input;
	return assembleChatRequest({
		target: { baseUrl: provider.baseUrl.trim(), apiKey, model: modelId },
		facts: resolveModelFacts(provider, modelId, { maxTokens }),
		messages: [{ role: "user", content: CONNECTION_TEST_PING }],
		globals,
	});
}
