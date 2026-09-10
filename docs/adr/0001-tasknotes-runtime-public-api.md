# 通过 TaskNotes 运行时公开 API 读取任务

本插件需要读取任务数据，但不依赖、也不修改 TaskNotes 的源码与类型。决定：仅在运行时访问 `app.plugins.plugins["tasknotes"].api` 暴露的公开 API，并用本插件自己的最小类型桩描述用到的字段。代价是字段类型需自行维护、TaskNotes 未启用时只能降级提示；收益是 TaskNotes 内部重构或升级不会使本插件编译失败。
