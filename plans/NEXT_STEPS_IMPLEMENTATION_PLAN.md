# Orderly 下一步建议实现计划（v2026-02-23）

> 计划日期：2026-02-23  
> 输入文档：`docs/NEXT_STEPS.md`、`docs/TECH_SPEC.md`  
> 目标：在已完成 P0/P1 的基础上，完成 P2 能力闭环（检索增强、桌面端自动化、自动打包发布）。

## 0. 当前进度（2026-02-23）

- [x] A1 文档收口（规范升级）
- [x] A2 后端规则测试（Rust）
- [x] A3 CI 质量闸门
- [x] B1 归档事件可视化
- [x] B2 时区策略固化（设置页可配置 `local/utc`）
- [x] B3 发布回归清单
- [x] C1 FTS5 检索升级（`system_name/tech_stack/deliverables/note`）
- [ ] C2 桌面端自动化（tauri-driver）
- [x] C3 自动打包发布（GitHub Actions）

## 1. 当前阶段目标（P2）

| 优先级 | 主题 | 状态 | 目标结果 |
|---|---|---|---|
| P2-1 | FTS5 检索升级 | 已完成 | 深度字段检索可用且有后端测试 |
| P2-2 | 桌面端自动化 | 进行中（待实施） | 覆盖系统级行为，补足 Mock 差距 |
| P2-3 | 自动打包发布 | 已完成 | tag/手动触发可产出 Tauri bundle |

## 2. 下一执行项（C2）

### C2.1 建立 tauri-driver 测试基线
- 任务：
  - 引入 tauri-driver 测试工程（首批 smoke 用例）；
  - 验证应用可启动、主窗口可交互。
- 验收：
  - 本地与 CI（Windows）均可稳定执行 1 条 smoke。

### C2.2 覆盖系统级关键链路
- 任务：
  - 增加“打开目录/文件”可触发验证；
  - 增加“备份导出 zip”验证；
  - 增加“恢复备份”基本路径验证。
- 验收：
  - 桌面端关键命令链路具备自动回归能力。

### C2.3 接入 CI（独立 Job）
- 任务：
  - 新增桌面端自动化 workflow/job；
  - 与现有 `ci.yml` 解耦，避免阻塞前后端快速迭代。
- 验收：
  - 可按需触发，失败信息可直接定位系统级问题。

## 3. 已交付物清单

- 代码：
  - `src-tauri/src/orders.rs`（规则测试、FTS 查询、时区策略）
  - `src-tauri/src/db.rs`（FTS5 表与触发器）
  - `src/App.tsx`（时区策略设置项）
  - `src/lib/mockBackend.ts`（Mock 对齐时区策略与归档事件）
- 工作流：
  - `.github/workflows/ci.yml`
  - `.github/workflows/release-tauri.yml`
- 文档：
  - `docs/TECH_SPEC.md`（v1.2）
  - `docs/NEXT_STEPS.md`
  - `docs/RELEASE_CHECKLIST.md`

## 4. DoD（当前）

- [x] `pnpm exec tsc --noEmit` 通过
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` 通过
- [x] `pnpm test:e2e` 通过
- [x] FTS5 检索与时区策略有测试覆盖
- [x] 自动打包 workflow 已入库
- [ ] tauri-driver 首批系统级自动化用例
