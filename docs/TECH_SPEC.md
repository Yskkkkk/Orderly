# Orderly（接单记录）技术规范 v1

## 0. 背景与目标

你需要一个 **Windows 10** 可用的轻量桌面程序，用于记录接到的单子（订单/项目），并把“系统需求/附件”以文件形式存放在每个单子的目录中。程序要求：

- **直接点击使用**：解压到一个文件夹后即可运行（便携式/portable）。
- **体积小、内存小**：避免 Electron；本地离线运行。
- **本地存储**：使用本地数据库（SQLite），不做云端/服务器。

已确认：UI 使用 **React + shadcn/ui（左右分栏、无深色模式）**。

## 1. 方案对比（Phase 3）

| 方案 | 描述 | 优点 | 代价/风险 | 适用 |
|---|---|---|---|---|
| A（保守/稳定） | Tauri + SQLite；附件不入库，打开单子时扫描目录；普通索引检索 | 最少复杂度、最稳、可便携 | 搜索不包含附件内容；目录文件很多时打开会稍慢 | 个人用、追求稳定 |
| B（激进/高性能） | 在 A 基础上增加：FTS5 全文检索、附件索引表/文件监听、缩略图缓存 | 体验更“强”，搜索更快 | 复杂度上升、更多边界情况；可能增加资源占用 | 单量大、要深度检索 |
| **推荐** | **采用方案 A**，保留未来升级到 B 的扩展点（表结构/命令接口预留） | 满足“体积小/内存小/便携/可靠” | 需要时再迭代增强搜索 | 当前需求最匹配 |

> 已确认：采用推荐做法（A）。

## 2. 技术栈与工程形态（方案 A）

- 桌面框架：**Tauri（Rust 后端 + WebView2 前端）**
- 前端：**React + TypeScript + Vite**
- UI 组件：**shadcn/ui**
- 样式方案：**Tailwind CSS**（浅色主题，不实现深色模式开关）
- 数据库：**SQLite**（单文件 `orderly.db`）
- 打包分发：`tauri build` 产物 + `data/` 目录，一起放在同一文件夹
- 网络：**不依赖网络**（可选：仅在“打开 GitHub 仓库 URL”时调用系统浏览器）

## 3. 数据与目录规范（portable）

### 3.1 根目录布局

程序所在目录（解压后的文件夹）：

```
Orderly/
  Orderly.exe
  data/
    orderly.db
    orders/
      <order_id>/
        (需求文件、原型图、压缩包、任意附件，允许子目录)
    backups/
      (导出备份生成的 zip 可放这里，非必须)
```

### 3.2 order_id 规则

- `order_id` 使用 **UUID v4**（字符串，示例：`c0a8012e-...`）
- 单子目录固定为：`data/orders/<order_id>/`
- 单子“系统名称”可修改，但不影响目录名（避免改名导致路径变化）

### 3.3 附件规则（不入库为主）

- **目录是事实来源**：单子详情页显示该单子目录下的文件（递归扫描）。
- 允许用户在外部任意改名/移动/新增文件（只要仍在该单子目录内）。
- 允许存在子目录；UI 使用**树状展示（含文件夹）**。
- 不对附件内容做解析/索引（v1 不做）。

## 4. 领域模型与计算规则

### 4.1 单子（Order）必填字段

- `system_name`：系统名称（用于搜索/列表显示）
- `wechat`：微信号
- `username`：用户名（微信昵称/备注名）
- `repo_url`：GitHub 仓库 URL（仅 1 个）
- `status`：状态（见 4.3）

### 4.2 金额与收款建模（不含税）

存储统一使用 **分（cents）** 的整数，避免浮点误差。

- `total_base_cents`：初始总金额（分）
- `amount_adjustments`：后续调整（分，可正可负）
- `payments`：收款流水（分，可多笔）

计算：

- `total_current_cents = total_base_cents + SUM(amount_adjustments.delta_cents)`
- `paid_sum_cents = SUM(payments.amount_cents)`
- `deposit_sum_cents = SUM(payments.amount_cents WHERE type='deposit')`（UI 显示“定金”字段）
- `outstanding_cents = total_current_cents - paid_sum_cents`
  - 当 `outstanding_cents < 0`：UI 显示 **“多收款 = -outstanding”**

### 4.3 状态模型

枚举（v1 固定）：

- `pending_send`：待发送
- `done`：已完成
- `canceled`：已取消

规则：

- 默认创建为 `pending_send`
- 列表筛选支持按 `status`

### 4.4 时间字段与“最近更新时间”

时间存储为 **UTC 毫秒时间戳**（INTEGER）。

- `created_at_ms`：创建时间
- `updated_at_ms`：最近更新时间

`updated_at_ms` 在以下操作发生时更新（已确认“都算”）：

- 修改单子字段（系统名称/微信号/用户名/仓库地址/状态/技术栈/交付物/备注等）
- 新增/删除/修改收款流水
- 新增/删除金额调整记录
- 通过软件“拷贝/导入”新增附件（如果 v1 提供该能力）

列表筛选支持按：

- `created_at_ms` 范围
- `updated_at_ms` 范围

## 5. SQLite 数据库设计（v1）

### 5.1 表结构（DDL 级别约束）

#### `orders`

- `id TEXT PRIMARY KEY`（UUID）
- `system_name TEXT NOT NULL`
- `wechat TEXT NOT NULL`
- `username TEXT NOT NULL`
- `repo_url TEXT NOT NULL`
- `status TEXT NOT NULL`（`pending_send|done|canceled`）
- `tech_stack TEXT NOT NULL DEFAULT ''`（v1 使用文本，允许写“Rust,Tauri,SQLite”等）
- `deliverables TEXT NOT NULL DEFAULT ''`（v1 使用文本）
- `note TEXT NOT NULL DEFAULT ''`
- `total_base_cents INTEGER NOT NULL DEFAULT 0`
- `created_at_ms INTEGER NOT NULL`
- `updated_at_ms INTEGER NOT NULL`

索引：

- `idx_orders_wechat`（wechat）
- `idx_orders_username`（username）
- `idx_orders_system_name`（system_name）
- `idx_orders_status`（status）
- `idx_orders_created_at`（created_at_ms）
- `idx_orders_updated_at`（updated_at_ms）

#### `payments`

- `id TEXT PRIMARY KEY`（UUID）
- `order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `amount_cents INTEGER NOT NULL`（允许正/负；负数表示退款）
- `type TEXT NOT NULL`（`deposit|final|other`）
- `paid_at_ms INTEGER NOT NULL`
- `note TEXT NOT NULL DEFAULT ''`
- `created_at_ms INTEGER NOT NULL`

索引：

- `idx_payments_order_id`（order_id）
- `idx_payments_paid_at`（paid_at_ms）

#### `amount_adjustments`

- `id TEXT PRIMARY KEY`（UUID）
- `order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `delta_cents INTEGER NOT NULL`（可正可负）
- `reason TEXT NOT NULL DEFAULT ''`
- `at_ms INTEGER NOT NULL`
- `created_at_ms INTEGER NOT NULL`

索引：

- `idx_adjustments_order_id`（order_id）
- `idx_adjustments_at`（at_ms）

### 5.2 “最近更新时间”一致性（推荐 DB Trigger）

为防止某些路径漏更新 `updated_at_ms`，建议：

- 在 `payments`、`amount_adjustments` 的 INSERT/UPDATE/DELETE 上创建触发器，同步更新 `orders.updated_at_ms = now()`
- 在 `orders` UPDATE 上也统一写入 `updated_at_ms = now()`

## 6. 核心界面与流程（Phase 4：流程图描述）

### 6.1 页面/模块

1) **单子列表页（左侧）**
- 顶部：搜索框（微信号/用户名/系统名称）
- 筛选：状态（待发送/已完成/已取消）、时间范围（创建时间/最近更新时间，日期范围）
- 列表行：系统名称、微信号、用户名、状态、更新时间

2) **单子详情页（右侧）**
- 基本信息：系统名称、微信号、用户名、仓库 URL（可点击打开）
- 支持编辑：修改单子字段后更新 `updated_at`
- 金额卡片：总金额（当前）、定金（deposit 汇总）、已收、尾款/多收
- 收款流水：新增/编辑/删除，支持类型选择（定金/尾款/其他）
- 金额调整：新增/删除（建议填写理由）
- 技术栈、交付物：文本编辑
- 附件区：展示该单子目录下文件；操作：打开文件 / 打开所在文件夹 / 复制相对路径
- 附件点击：使用系统默认程序打开

3) **新建单子弹窗**
- 必填：系统名称、微信号、用户名、仓库 URL、初始总金额
- 可选：技术栈、交付物、备注、状态（默认待发送）

4) **备份/恢复**
- 导出：生成一个 zip（包含 `orderly.db` 与 `orders/`）
- 恢复：选择 zip，解压替换 `data/`（先备份当前 `data/` 再恢复）

## 7. 核心接口定义（Tauri 命令 API）

### 7.1 命令列表（v1）

- `orders_list(filters)` → 列表数据
- `order_create(payload)` → `{ id }`
- `order_get(id)` → `{ order, computed }`
- `order_update(id, patch)` → `ok`
- `order_set_status(id, status)` → `ok`

- `payment_add(order_id, payload)` → `ok`
- `payment_update(id, patch)` → `ok`
- `payment_delete(id)` → `ok`
- `payments_list(order_id)` → `Payment[]`

- `adjustment_add(order_id, payload)` → `ok`
- `adjustment_delete(id)` → `ok`
- `adjustments_list(order_id)` → `Adjustment[]`

- `order_folder_path(order_id)` → `{ path }`
- `order_files_list(order_id)` → `{ files: { rel_path, size, mtime_ms, is_dir }[] }`
- `open_path(path)` → `ok`（文件/文件夹）

- `backup_export(dest_zip_path)` → `ok`
- `backup_import(src_zip_path)` → `ok`

## 8. 非功能需求（验收口径：已确认采用推荐值）

- 解压后体积（不含你的附件数据）：建议目标 **≤ 50MB**
- 空闲内存占用：建议目标 **≤ 200MB**
- 单子数量：建议目标 **≥ 2000** 条仍可流畅筛选/搜索

## 9. 边界情况与处理策略（v1）

- 同一微信号/用户名可对应多个单子：允许，不做唯一约束
- 退款/多收：`payments.amount_cents` 允许负数；尾款负数显示“多收款”
- 仓库 URL 校验：仅做“非空 + 基本格式提示”，不阻止保存
- 附件目录为空/不存在：不存在则创建；若被删除则打开详情时自动重建目录
- 恢复备份失败：保持原 `data/` 不丢失（先备份再替换）
