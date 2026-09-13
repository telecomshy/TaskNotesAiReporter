# 界面语言独立于报告语言，用带类型的 TS 字符串表实现

调研（见 `docs/research/obsidian-plugin-i18n.md`）确认 Obsidian 只为插件提供 `getLanguage()`，没有任何插件级 i18n API、字符串目录或加载器。决定：新增 `uiLanguage: "auto" | "zh" | "en"` 设置（默认 `auto`，跟随 `getLanguage()`，`zh`/`zh-TW` → 中文、其余 → 英文），与既有的「报告语言」`settings.language` **严格分离**——前者只决定界面外壳文案，后者决定提示词与报告输出；字符串以带类型的 TS 表存放（`src/i18n/en.ts` 为唯一真源，`src/i18n/zh.ts` 受 `Strings` 类型约束，`src/i18n/index.ts` 为无 Obsidian 依赖的纯运行时），由 esbuild 打包，不引入 i18next、不做运行时 JSON 加载；`getLanguage()` 仅在插件入口调用一次，翻译器经既有 `plugin` 缝合点传给各 UI 模块。代价是新增一个持久化设置、两个需同步维护的目录文件；收益是界面可与报告语言解耦，且 i18n 核心可纯函数单测、无需 mock。

## Considered Options

- **界面语言跟随报告语言**：无法表达「英文界面 + 中文报告」，且报告语言是自由文本、不适宜作界面口径。
- **JSON locale 文件 + `resolveJsonModule`**：需改构建配置；esbuild 本就内联 JSON，运行时读取无收益，且会牺牲 `typeof en` 的编译期校验。
- **i18next**：在仅两种语言、无复数规则库需求的前提下过重。

## Consequences

- `zh-TW`（繁体中文）用户看到简体中文；繁体目录留作后续。
- 报告产物（frontmatter 标题、文件名兜底）与提示词维持中文，不受界面语言影响。
- 切换界面语言后设置页立即刷新；已打开的弹窗在下次打开时生效（与 Obsidian 自身换语言需重启一致）。
