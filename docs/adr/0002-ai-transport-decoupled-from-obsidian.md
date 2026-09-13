# AI HTTP 传输层不静态依赖 Obsidian

`chatCompletion` / `listModels` 的核心逻辑需要单元测试，但真实请求依赖 Obsidian 的 `requestUrl`，而该模块在 Node 测试环境无法加载。决定：`client.ts` 不静态导入 obsidian，而是接受可注入的 `RequestFn`；唯一静态引用 `requestUrl` 的默认实现隔离在 `transport.ts`。代价是多一层间接；收益是请求构造与响应解析可在测试中注入 mock 验证（见 `test/client.test.ts`）。

同一纯度原则下，`client.ts` 的超时用**全局** `setTimeout` / `clearTimeout`（而非 `window.*`），以便在 Node 环境可运行。因此**目录扫描**会报 `obsidianmd/prefer-window-timers` warning，属**有意保留**（超时是后台逻辑、与 popout 无关）；本仓库的 eslint 配置对该文件关闭了此规则（见 `eslint.config.mjs`），故**本地** `npx eslint` 不报，但目录扫描仍会报。
