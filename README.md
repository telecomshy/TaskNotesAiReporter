---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '30095df3-9bd2-48ec-881d-b565e2700e3d'
  PropagateID: '30095df3-9bd2-48ec-881d-b565e2700e3d'
  ReservedCode1: '47ffad8f-dc66-48e6-98d4-509556ff5697'
  ReservedCode2: '47ffad8f-dc66-48e6-98d4-509556ff5697'
---

# TaskNotes AI Reporter

为 [TaskNotes](https://github.com/callumalpass/tasknotes) 生成 AI 周报 / 月报 / 年报的独立辅助插件。

- 自定义任意 **OpenAI 兼容** 大模型（DeepSeek、通义千问、豆包、Kimi、OpenAI 等）
- 按日期自动筛选 TaskNotes 任务，支持在界面中**手动添加 / 删除**任务
- 日历区间选择 + 本周 / 本月 / 本年等快捷方式
- 生成结果写入 vault 内新笔记，不覆盖历史

## 前置依赖

- Obsidian 需已启用 **TaskNotes** 插件（本插件通过其公开 API 读取任务数据，不改其源码）。

## 安装

1. 构建（或直接使用已构建产物）：

   ```bash
   npm install
   npm run build
   ```

2. 将以下文件复制到你的 vault 的 `.obsidian/plugins/tasknotes-aireporter/` 目录：

   - `manifest.json`
   - `main.js`
   - `styles.css`

3. 在 Obsidian 的「第三方插件」中启用 **TaskNotes AI Reporter**。

## 配置

打开「设置 → 社区插件 → TaskNotes AI Reporter」：

1. **AI 模型配置**：填写 Base URL、API Key、模型名称，点「测试连接」验证。
   - 示例（DeepSeek）：Base URL `https://api.deepseek.com/v1`，模型 `deepseek-chat`
2. **报告输出目录**：默认 `TaskNotes/Reports`。
3. **日期口径**：勾选参与自动筛选的日期字段（完成 / 到期 / 计划 / 创建时间）。
4. **报告板块**：勾选需要 AI 生成的板块。

## 使用

1. 点击左侧 Ribbon 的 ✨ 按钮，或命令面板执行「生成任务报告」。
2. 在弹窗左侧选择时间范围（快捷按钮或日历点选区间）。
3. 右侧查看自动筛选出的任务，可「移除」或「+ 添加任务」（搜索任意任务，含未填日期的）。
4. 点击「生成报告」，AI 生成后在预览中确认，点「保存」写入 vault。

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 开发监听构建
npm run build      # 生产构建（含 tsc 类型检查）
npm test           # 运行单元测试
```

核心纯函数（日期范围、任务筛选、文件名、提示词）位于 `src/core/`，均有单元测试覆盖。

> AI生成