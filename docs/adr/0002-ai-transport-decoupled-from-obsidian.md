# AI HTTP 传输层不静态依赖 Obsidian

`chatCompletion` / `listModels` 的核心逻辑需要单元测试，但真实请求依赖 Obsidian 的 `requestUrl`，而该模块在 Node 测试环境无法加载。决定：`client.ts` 不静态导入 obsidian，而是接受可注入的 `RequestFn`；唯一静态引用 `requestUrl` 的默认实现隔离在 `transport.ts`。代价是多一层间接；收益是请求构造与响应解析可在测试中注入 mock 验证（见 `test/client.test.ts`）。
