# OpenCode V2 模型上下文窗口（Model Context Window）配置

调研日期：2026-09-22
主题：为什么所有自定义模型在 OpenCode 里显示被限定为 200000，以及如何配置真实的上下文窗口。

## 结论速览

- **「200000」不是来自用户配置，而是 OpenCode 对未显式声明上下文窗口的自定义 / openai-compatible 模型的默认 `limit.context` 值。**
- 用户模型 `deepseek-v4-flash` 的**真实上下文窗口为 1M（1,000,000 token）**（DeepSeek V4 家族官方能力），200K 是一个保守的默认/显示值。
- 正确配置方式：在 `opencode.jsonc` 的模型定义里加 `limit: { context, output }` 字段，覆盖默认值。

## 上游来源（pinned）

- OpenCode V2 Config 文档：`https://opencode.ai/v2/docs/config`
  - 模型定义支持 `limit: { context, output }`，示例：`"limit": { "context": 200000, "output": 32000 }`
- OpenCode V2 Providers 文档：`https://opencode.ai/v2/docs/providers`
  - 模型可配置项含 `limit`（context / input / output token limits）。
- DeepSeek-V4-Flash 官方上下文：
  - HuggingFace `deepseek-ai/DeepSeek-V4-Flash`：支持 1M-token context window；Think Max 推理模式建议 ≥384K。
  - arXiv 2606.19348《DeepSeek-V4: Towards Highly Efficient Million-Token Context》：V4-Flash（284B / 13B active）支持 1M context。
- 关联 issue：`anomalyco/opencode#27929` —— OpenCode 官方 `opencode/deepseek-v4-flash-free` 上下文曾从 ~1M 被降至 200K（该 issue 针对 OpenCode 托管模型，非本用户内网服务，但印证了 200K 是 OpenCode 侧设定的保守值）。

## 细节

### 1. 200000 从哪来

用户配置 `~/.config/opencode/opencode.jsonc` 中模型定义仅有 `name`：
```jsonc
"models": {
  "deepseek-v4-flash": { "name": "deepseek-v4-flash" }
}
```
未设置 `limit` 时，OpenCode 对自定义 openai-compatible 模型使用统一默认 `context: 200000`。这就是「所有模型都显示 200000」的原因。

### 2. 为什么系统设置里看不到

上下文窗口不是桌面版/TUI 的交互式「系统设置」选项，而是 `opencode.jsonc` 配置文件里 `providers.<id>.models.<modelID>.limit` 的一个字段，需直接编辑配置文件。

### 3. V2 正确配置形状

```jsonc
"providers": {
  "hubei-science": {
    "package": "aisdk:@ai-sdk/openai-compatible",
    "settings": { "baseURL": "http://171.43.197.13:3000/v1" },
    "models": {
      "deepseek-v4-flash": {
        "name": "deepseek-v4-flash",
        "limit": {
          "context": 1000000,   // 真实窗口 1M（按模型能力填写）
          "output": 32000       // 单次输出上限（按服务/模型填写）
        }
      }
    }
  }
}
```

### 4. 注意 / 风险

- 若 `limit.context` 填得**大于**服务端实际支持，超出部分会被服务端截断或报错。
- 填**小**则会浪费模型真实能力（过早压缩会话）。
- 用户内网服务 `171.43.197.13:3000/v1/models` 需鉴权（返回 `Invalid token`），无法直接拉取元数据确认服务端实际窗口；以模型公开能力 1M 为基准，但建议以服务方实际配置为准。
- 网络访问 opencode.ai / GitHub 需走本地代理 `http://127.0.0.1:7890`。

## 待确认

- 内网网关（171.43.197.13）是否真正开放 1M 窗口，还是也有限制；建议向服务维护方确认后再把 `limit.context` 从 200000 提到更高。
