# Orderly 下一步建议（当前版本）

> 更新时间：2026-02-23  
> 当前状态：P0/P1 已完成，P2 已完成 C1（FTS5 检索）与 C3（自动打包工作流），核心测试通过（Rust + E2E）。  
> 当前目标：补齐 P2-C2（桌面端自动化），形成“功能 + 规则 + 打包 + 真实端回归”闭环。

---

## 当前已完成（2026-02-23）

- 自动归档、取消归档、归档锁定、归档历史可视化已完整落地。
- 统计页支持按月查看归档与净收入（按收款日期净额，含退款冲减）。
- 后端规则测试已覆盖关键路径（自动归档/锁定/取消归档/月统计/迁移回填）。
- CI 质量闸门已接入（`tsc`、`cargo check`、`cargo test`、`e2e`）。
- 设置页新增“统计时区策略”配置（`local`/`utc`），并写入 `ui_preferences`。
- 检索升级到 FTS5，支持 `system_name / tech_stack / deliverables / note`。
- 新增发布构建工作流：`.github/workflows/release-tauri.yml`（tag/手动触发 `tauri build` 并上传产物）。

---

## 下一步建议（优先级最高）

### P2-C2：桌面端自动化（tauri-driver）

**目标**：覆盖 Web Mock 无法验证的系统级行为，降低“CI 全绿但桌面端异常”的风险。  

**建议范围（首批）**：
- 启动桌面端并验证主窗口可用；
- 验证“打开单子目录 / 打开附件”命令链路可触发；
- 验证“导出备份 -> zip 产物存在”与“恢复备份流程”主链路；
- 至少保留 1 条归档锁定桌面端回归用例。

**验收标准**：
- tauri-driver 用例可在 CI（Windows）稳定执行；
- 首批用例失败时可直接定位到桌面端链路，而不是前端 Mock 链路。

---

## 近期执行顺序（建议）

1. 建立 tauri-driver 基础测试脚手架与最小 smoke case。  
2. 加入“打开路径 + 备份导出”两条系统级测试。  
3. 将桌面端自动化纳入 CI（独立 job，避免阻塞主质量闸门迭代速度）。  
4. 跑一次 tag 构建演练，验证 `release-tauri.yml` 产物可用。  

---

## 运行命令速记

| 命令 | 用途 |
|---|---|
| `pnpm tauri dev` | 桌面端开发运行 |
| `pnpm dev` | 前端开发（Web Mock） |
| `pnpm test:e2e` | 前端端到端测试 |
| `pnpm exec tsc --noEmit` | 前端类型检查 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 后端编译检查 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 后端规则测试 |
