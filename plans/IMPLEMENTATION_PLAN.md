# 实现计划（MVP）

## 里程碑 1：项目骨架
- [x] 初始化 Tauri 项目（Windows 10）
- [x] 前端：React + Vite + shadcn/ui（左右分栏、无深色模式）
- [x] 建立 portable 数据目录：`data/`、`data/orders/`、`data/backups/`
- [x] 初始化 SQLite：`data/orderly.db` + schema DDL（当前内置于 Rust；后续可加 migrations）

## 里程碑 2：核心业务（订单）
- [x] 订单列表：搜索（微信号/用户名/系统名）+ 状态筛选 + 时间筛选（创建/更新时间）
  - [x] 搜索（微信号/用户名/系统名）
  - [x] 状态筛选（待发送/已完成/已取消）
  - [x] 时间筛选（创建时间/最近更新时间，日期范围）
- [x] 新建/编辑订单：系统名、微信号、用户名、GitHub repo URL、技术栈、交付物、备注、初始总金额
  - [x] 新建（系统名/微信号/用户名/repo URL/初始总金额）
  - [x] 新建补齐字段（技术栈/交付物/备注/状态）
  - [x] 编辑（更新订单字段 + updated_at）
- [x] 状态：待发送 / 已完成 / 已取消
  - [x] 默认状态（创建时 pending_send）
  - [x] 状态切换（通过编辑弹窗保存）

## 里程碑 3：金额与流水
- [x] 收款流水：多笔；类型包含“定金/尾款/其他”
- [x] 金额调整：支持多次 delta 记录 + reason
- [x] 展示：总金额（当前）、定金汇总、已收、尾款/多收款

## 里程碑 4：附件（外部编辑）
- [x] 单子目录：一键打开目录
- [x] 附件列表：递归扫描树状显示（允许外部改名/新增/子目录）
- [x] 点击打开附件（系统默认程序）

## 里程碑 5：备份/恢复
- [x] 导出备份：zip（`orderly.db` + `orders/`）
- [x] 导入恢复：先备份当前 `data/` 再替换

## 里程碑 6：前端自动化测试（仅前端）
- [x] Playwright 配置 + 脚本（自动启动 `pnpm dev`）
- [x] Web mock backend（非 Tauri 环境可跑）
- [x] 基础用例：列表加载/新建单子/状态筛选

## 进度记录

| 日期 | 进度 | 备注 |
|---|---|---|
| 2026-02-18 | 需求与技术规范完成（v1） | `docs/TECH_SPEC.md` |
| 2026-02-18 | 工程骨架完成：Tauri + React(shadcn/ui) + Vite + Tailwind | 可运行 `pnpm tauri dev` |
| 2026-02-18 | portable 数据目录与 SQLite schema 初始化完成 | `src-tauri/src/db.rs` |
| 2026-02-18 | 修复 `app.manage` 缺少 trait 导入导致的编译错误 | `src-tauri/src/lib.rs` |
| 2026-02-18 | 后端订单 API（list/get/create/update）打通 + 元(小数)→分 存储方案 | `src-tauri/src/orders.rs`, `src/lib/money.ts` |
| 2026-02-18 | UI 更新：左侧菜单栏 + 中间列表 + 右侧详情（shadcn/ui） | `src/App.tsx` |
| 2026-02-18 | 附件树（含文件夹）+ 点击文件用默认程序打开 + 打开单子目录 | `src-tauri/src/orders.rs`, `src/App.tsx` |
| 2026-02-18 | 订单列表补齐：状态筛选 + 创建/更新时间日期筛选 + GitHub URL 一键打开 | `src/App.tsx` |
| 2026-02-18 | 新建单子改为 shadcn Dialog 弹窗，并补齐字段（状态/技术栈/交付物/备注） | `src/App.tsx`, `src/components/ui/dialog.tsx` |
| 2026-02-18 | 集成 Agentation 开发调试工具栏（仅 DEV） | `src/App.tsx` |
| 2026-02-18 | UI 调整：状态筛选改为下拉框；筛选区布局收敛防止换行溢出 | `src/App.tsx`, `src/components/ui/select.tsx` |
| 2026-02-19 | 编辑单子：Dialog + 保存调用 `order_update` + 自动刷新列表 | `src/App.tsx` |
| 2026-02-19 | 修复 Dialog 内容过高：弹窗内滚动，避免上下贴边 | `src/components/ui/dialog.tsx` |
| 2026-02-19 | 前端 E2E：Playwright + web mock backend + 用例落地并跑通 | `playwright.config.ts`, `tests/e2e/app.spec.ts`, `src/lib/mockBackend.ts` |
| 2026-02-19 | 金额与流水：收款流水/金额调整（CRUD）+ 详情展示计算值 | `src-tauri/src/orders.rs`, `src/App.tsx`, `src/lib/mockBackend.ts` |
| 2026-02-19 | 备份/恢复：导出 zip + 从 zip 恢复（先备份 data/） | `src-tauri/src/backup.rs`, `src/App.tsx`, `src-tauri/src/db.rs` |
