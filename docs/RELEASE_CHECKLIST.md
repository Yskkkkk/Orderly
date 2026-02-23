# Orderly 发布回归清单（Release Checklist）

> 版本：v1.1  
> 更新时间：2026-02-23  
> 适用范围：桌面端发布前回归与验收。

## 1. 构建与测试

- [ ] `pnpm exec tsc --noEmit` 通过
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` 通过
- [ ] `pnpm test:e2e` 全部通过

## 2. 数据与迁移

- [ ] 首次启动可自动创建 `data/`、`orderly.db`、`orders/`、`backups/`
- [ ] 启动迁移执行成功（无报错）
- [ ] `status=done && archive_month IS NULL` 的历史数据可自动补归档
- [ ] 不会破坏已有订单、收款、金额调整记录

## 3. 归档与锁定规则

- [ ] 创建时 `status=done` 自动归档到当前月
- [ ] 状态从非 `done` -> `done` 自动归档到当前月
- [ ] 已归档订单禁止编辑/收款/金额调整/删除
- [ ] “取消归档”后恢复可编辑
- [ ] 归档历史（archive/unarchive）记录完整可见

## 4. 统计口径

- [ ] 月净收入按 `paid_at_ms` 所在月统计（含退款冲减）
- [ ] 月定金仅统计 `deposit` 且同月
- [ ] 归档单数按 `archive_month` 统计
- [ ] 设置页可切换“统计时区策略”（`local/utc`）并即时生效

## 5. 备份与恢复

- [ ] 导出备份成功生成 zip
- [ ] 恢复前会备份当前 `data/`（`data.bak.<ts>/`）
- [ ] 恢复后数据完整且可正常打开列表/详情/统计

## 6. 发布产物检查

- [ ] 可执行文件可在目标环境启动
- [ ] 便携目录结构完整（含 `data/` 相关目录）
- [ ] 版本号与发布说明一致
- [ ] 变更说明包含：新增功能、兼容性影响、回滚建议
- [ ] `release-tauri.yml` 构建成功并上传 bundle 产物

## 7. 回滚预案

- [ ] 保留发布前完整备份（程序目录 + 数据目录）
- [ ] 回滚步骤文档可执行（含数据库与文件恢复步骤）
- [ ] 指定回滚负责人和验证人
