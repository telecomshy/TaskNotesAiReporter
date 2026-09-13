# 用 Obsidian 内部设置 API 跳转到「密钥存储」

「管理密钥」入口要把用户带到 Obsidian 的「密钥存储」设置页，而公开 API 没有提供该跳转。决定：通过内部 API `app.setting.open()` + `app.setting.openTabById("keychain")` 实现（`app.setting` 用最小类型桩断言，不静态依赖其类型）；调用处做特性探测，若内部 API 不可用则退化为一条 `Notice` 提示「请打开 设置 → 密钥存储」。

代价：依赖一个未公开、可能随 Obsidian 版本变动的 API。收益：用户能就近管理/重命名密钥——密钥名是 vault 全局共享的（跨插件引用），重命名与删除归 Obsidian 管，插件不该擅自改。

这与 [ADR-0001](./0001-tasknotes-runtime-public-api.md) 的「只用运行时公开 API」相悖，故在此**显式记录为有意的例外**；降级路径保证即使内部 API 失效，功能也只是少一个便利入口，不会崩。相关术语见 `CONTEXT.md` 的「密钥名（Secret id）」。
