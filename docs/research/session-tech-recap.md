# 会话技术小结：Issue 类型、GitHub 构建发布、构建产出物

> 本文件是本次开发会话的技术回顾，便于日后查阅。事实性内容以仓库文件、ADR 与 Obsidian 一手文档/应用本体为准。

## 1. Issue 类型（本仓库工作流词汇）

| 名称 | 标签 | 作用 | 正文模板 | 关系 |
| --- | --- | --- | --- | --- |
| **map（地图）** | `wayfinder:map` | 长期/大型工作的伞形索引 | Notes / Decisions-so-far / Fog / 清单 | 父，挂子 ticket |
| **child ticket（子票）** | `wayfinder:<type>` | map 下的决策票 | 视 type | 挂为 map 的 sub-issue |
| **tracer-bullet ticket** | `wayfinder:task` + `ready-for-agent` | 一条**细薄竖切**，独立可验收 | Parent / What to build / Acceptance / Blocked by | 带原生 `blocked_by` |
| **spec issue** | `ready-for-agent` | 一份**设计契约**（一件事） | Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes | 常自包含，可作父 |

- **在 GitHub 上它们都是同一种对象（Issue）**，没有原生类型区分；差异靠**标签 + 正文模板 + 关系（sub-issue / `blocked_by`）**表达。GitHub 另有可选的组织级 **Issue Types**（Task/Bug/Feature），本仓库没用。
- `wayfinder:<type>` 的四种 type：`research`、`prototype`、`grilling`、`task`。
- **triage 标签**（`needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`）是**状态/角色**，与上面的类型正交。
- **流程**：`to-spec`（产出 1 份 spec）→ `to-tickets`（拆成多条带依赖的 tracer-bullet）→ `implement`（内部跑 `tdd`，收尾 `code-review`）。
- "hygiene ticket" 不是正式名词；正式的对应物是普通的 `wayfinder:task` 子票（维护性横切工作，**不算** tracer bullet）。
- 机器可读的操作：`gh issue list --label ...`、`gh api .../sub_issues`、`gh api --method POST .../dependencies/blocked_by -F issue_id=<数据库id>`。

## 2. GitHub 构建 / 发布流程与技巧

- **工作流文件位置**：仓库根部 **`.github/workflows/*.yml`**（GitHub 约定目录；可手建，或用模板/`cargo-dist` 等生成）。本仓库是 `.github/workflows/release.yml`。
- **触发**：`on: push: tags` —— 推 tag 即触发。
- **典型步骤**：`checkout` → `setup-node` → `npm ci && npm run build` → **attest（构建来源证明）** → `gh release create --draft` 附 `main.js`/`manifest.json`/`styles.css`。
- **Runner**：`runs-on: ubuntu-latest` 用的是 **GitHub 托管 runner，无需配置**；自托管 runner 在 **Settings → Actions → Runners**。
- **权限**：需 **Settings → Actions → General → Workflow permissions = Read and write**（本仓库已用 API 设为 `write`）。
- **手动 vs CI**：
  - 手动：网页 **Releases → Draft a new release**（选/建 tag、标题、说明、拖拽上传附件）。
  - CI：只推 tag（`git tag -a X -m X && git push origin X`），由 workflow 建 draft，再去 Releases **Publish**。
  - 注意：网页 Release 里「create new tag on publish」也会生成 tag ref、触发 workflow，可能重复建 release。
- **编译在远程**：编译型语言（Rust 等）在 runner 上 `cargo build --release`；跨平台用 **matrix**（各平台各自 runner）；跨编译用 `cross`；Rust 发布可交由 `cargo-dist` / `release-plz` 生成流水线。
- **密钥**：`GITHUB_TOKEN` 自动注入；自定义机密用 `gh secret set NAME`。

## 3. Obsidian 插件发布机制

- 提交走 **`community.obsidian.md`**（不再 fork `obsidian-releases`/PR）；`community-plugins.json` 由每小时（`:17`）的镜像 workflow 生成。
- 条目要求：公开仓库 + `README.md` + `LICENSE` + 合法 `manifest.json`；**tag 必须等于 `manifest.version`**（无 `v` 前缀）；release 附 `main.js` / `manifest.json` / `styles.css`；`versions.json` 映射「插件版本 → 最低 Obsidian 版本」。
- `version` 只需 **SemVer `x.y.z`，没有从 `1.0.0` 起步的要求**。
- 自动扫描分区：**Manifest / Releases / Source code / Build verification**，每条为 **Error / Warning / Recommendation / Pass**；**Error 阻断**，Warning 不阻断。触发：`… → Check for new releases` / `Request review`；预览：`Review branch`。
- **Build verification**：目录会重编一次，与 release 的 `main.js` 逐字节比对（我们显示 Pass）。
- 列表同步有延迟（镜像每小时）；客户端可能需要重载/重启。
- 本地预检：官方 **`eslint-plugin-obsidianmd`**（`eslint.config.mjs` + `npm run lint`）。

## 4. SecretStorage 与密钥

- 密钥值存 Obsidian **SecretStorage**（vault 全局、可跨插件复用）；插件设置只存**密钥名（Secret id）**。
- 公开 API：`app.secretStorage.getSecret/setSecret/listSecrets`；UI 组件 `SecretComponent`（自 1.11.1，`setValue`/`onChange` 自 1.11.4）。
- **重命名归 Obsidian 管**：Obsidian「设置 → 密钥存储」每行有编辑（铅笔，可改 id 与值）与删除；插件侧选择弹窗只有「选中 + 删除」。
- 跳转到密钥存储用了**内部 API** `app.setting.open()` + `openTabById("keychain")`，已记入 **ADR-0008**（带特性探测 + 降级 `Notice`）。

## 5. 工程技巧与坑

- **`NODE_ENV=production`** 会让 `npm install` 跳过 devDependencies；需 `npm install --include=dev`。
- **PowerShell 下 `git commit -m "中文"` 会把提交信息变成乱码**；用 `git commit -F <UTF-8 文件>`（`gh issue comment --body-file` 同理）。
- **ADR-0002**：`client.ts` 保持无 Obsidian 依赖、可在 Node 跑；为此超时用全局计时器 → 目录扫描会报 `prefer-window-timers`（有意保留，本地 eslint 对该文件关闭该规则）。
- **CSS lint**：目录扫描要求移除 `!important`，用**提高选择器优先级**替代（双类技巧 `.tah-hidden.tah-hidden`、复合类 `.modal.tah-modal-root`）；取舍是主题里带 `!important` 的声明会赢过我们（`.tah-*` 不被主题针对，可接受）。

## 6. 构建产出物的标准叫法

- **通用最标准：`artifact`（制品 / 构建产物）**。CI/CD 与供应链安全领域通称 **build artifact**，配套 **build provenance / attestation**（来源证明，SLSA 标准；GitHub 用 `actions/attest`）。
- **GitHub Release 语境特称：`release asset`（发布资产）** —— 官方术语，即挂在某个 release 下的文件（本插件就是 `main.js`/`manifest.json`/`styles.css`）。也可说 *release artifact* / *binary*。
- **Obsidian 插件语境**：这些就是插件的 **release assets**；而源码侧 `main.js` 是 esbuild 把 TS 打成的 **bundle**（打包产物）。
- 其它近义：*build output*、*deliverable*（偏项目管理）、*package*。
- 一句话：**「产出物」= artifact；挂到 GitHub Release 上的就专称 release asset。**

## 7. 本次会话产出的文档 / ADR

- `docs/research/obsidian-plugin-community-submission.md`（社区目录提交流程，一手来源）
- `docs/adr/0008-internal-settings-api-for-secret-management.md`（内部设置 API 例外）
- `docs/adr/0002-...md`（补充计时器纯度取舍）
- `CONTEXT.md`（新增「密钥（Secret）」「密钥名（Secret id）」等术语）
