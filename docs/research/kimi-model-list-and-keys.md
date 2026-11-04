# Kimi / Moonshot 模型列表接口与密钥平台差异

> 调研日期：2026-11-04（上游文档当日访问）。触发：#92「kimi 获取模型列表失败」——实为 Kimi For Coding 密钥返回空列表。

## 结论

1. **`GET https://api.moonshot.cn/v1/models` 的标准形态**是 `{ "object": "list", "data": [ { "id": …, "object": "model", "created": …, "owned_by": …, "context_length": …, "supports_image_in": …, "supports_video_in": …, "supports_reasoning": … } ] }`。本插件 `ai/client.listModels` 的解析（`data[]→id`）与之兼容，无需改动。
2. **密钥平台不互通**：`platform.kimi.com`（国内，端点 `api.moonshot.cn`）与 `platform.kimi.ai`（国际，端点 `api.moonshot.ai`）的 Key 不可混用；混用报 401。
3. **Kimi For Coding 套餐密钥没有公开的模型列表 API**（第三方实现注释亦证实）；实测（2026-11-04，用户现场 curl）：

   ```
   GET https://api.moonshot.cn/v1/models   （Bearer <Kimi For Coding 密钥>）
   → HTTP_STATUS:200   {"object":"list","data":[]}
   ```

   即**请求被接受但列表为空**，而非 401/错误。因此「空列表」是该套餐的正常响应，不是网络或解析失败。
4. **插件侧含义**：
   - `model.fetchEmpty` 的语义是「请求成功但该密钥下无可用模型」，措辞必须与「获取模型列表失败」（网络 / HTTP / 解析错误）分开——此前的「未获取到模型列表」把正常空表说成了失败（#92 的误导源）；
   - 这类密钥无法经挑选对话框启用模型（该套餐本身也不提供普通 Chat Completions 能力），属预期的不可用。

## 对当前预设供应商的影响

- `PRESET_PROVIDERS.kimi.baseUrl = https://api.moonshot.cn/v1`：对 platform.kimi.com 的 Key 仍然正确；
- 若持有 platform.kimi.ai 的 Key，应改用自定义供应商指向 `https://api.moonshot.ai/v1`（预设不做双端点）。

## 来源

- Kimi 开放平台「列出模型」文档（platform.kimi.com，2026-11-04 访问；示例模型 `kimi-k3.1-pro`）：https://platform.kimi.com/docs/api/list-models
- Kimi 开放平台（国际，platform.kimi.ai，2026-11-04 访问）：https://platform.kimi.ai/docs/api/list-models
- 第三方实现注释「Kimi For Coding has no public list API」：https://github.com/ashiqrniloy/prism packages/provider-kimi/src/models.ts
- Moonshot 模型响应示例（旧版 `moonshot-v1-*` 形态，含 `data[].id`）：https://moonshot-ai.gitbook.io/moonshot-ai/user-manual
- 用户现场实测（2026-11-04，密钥不入库）：`{"object":"list","data":[]}` / `HTTP_STATUS:200`
