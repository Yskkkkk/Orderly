import { expect, test, type Page } from "@playwright/test";

async function bootWithFreshMock(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("orderly_mock_state_v1");
    localStorage.setItem("orderly_mock_persist_enabled", "0");
  });
  await page.reload();
  await expect(page.getByText("Orderly")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await bootWithFreshMock(page);
});

test("loads orders list (web mock) and can create an order", async ({ page }) => {
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toBeVisible();

  await page.getByRole("button", { name: "新建单子" }).click();
  await expect(page.getByRole("heading", { name: "新建单子" })).toBeVisible();

  await page.getByLabel("系统名称").fill("测试系统 X");
  await page.getByLabel("微信号").fill("wxid_test_x");
  await page.getByLabel("用户名").fill("测试用户");
  await page.getByLabel("GitHub 仓库 URL").fill("https://github.com/example/test-x");
  await page.getByLabel("初始总金额（元）").fill("123.45");
  await page.getByRole("button", { name: "创建" }).click();

  await expect(page.getByTestId("order-row").filter({ hasText: "测试系统 X" })).toBeVisible();
});

test("status filter works (web mock)", async ({ page }) => {
  await page.getByRole("combobox", { name: "状态筛选" }).selectOption("done");

  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 B" })).toBeVisible();
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toHaveCount(0);
});

test("can edit order and moves to top by updated time", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.getByTestId("order-row").filter({ hasText: "示例系统 B" }).click();
  await page.getByRole("button", { name: "取消归档" }).click();
  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByRole("heading", { name: "编辑单子" })).toBeVisible();

  await page.getByLabel("系统名称").fill("示例系统 B（已编辑）");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByTestId("order-row").first()).toContainText("示例系统 B（已编辑）");
});

test("stats menu opens and month card can jump to filtered orders", async ({ page }) => {
  await page.getByRole("button", { name: "统计" }).click();
  await expect(page.getByText("按月份查看归档与净收入")).toBeVisible();

  await page.getByRole("button", { name: /2026-02/ }).click();

  const archiveFilter = page.getByRole("combobox", { name: "归档月份筛选" });
  await expect(archiveFilter).toHaveValue("2026-02");
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 B" })).toBeVisible();
});

test("archived order is locked until unarchive", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.getByTestId("order-row").filter({ hasText: "示例系统 B" }).click();

  await expect(page.getByRole("combobox", { name: "详情状态" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "新增收款" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "新增调整" })).toBeDisabled();

  await page.getByRole("button", { name: "取消归档" }).click();
  await expect(page.getByRole("combobox", { name: "详情状态" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "新增收款" })).toBeEnabled();
});

test("created date filter supports hit and miss cases", async ({ page }) => {
  await page.getByRole("combobox", { name: "时间字段" }).selectOption("created");

  await page.getByLabel("日期从").fill("2026-01-01");
  await page.getByLabel("日期到").fill("2026-01-31");
  await expect(page.getByTestId("order-row")).toHaveCount(0);
  await expect(page.getByText("暂无筛选结果")).toBeVisible();

  await page.getByLabel("日期从").fill("2026-02-01");
  await page.getByLabel("日期到").fill("2026-02-28");
  await expect(page.getByTestId("order-row")).toHaveCount(2);
});

test("payment flow updates total/deposit/paid/outstanding correctly", async ({ page }) => {
  await page.getByRole("button", { name: "新建单子" }).click();
  await page.getByLabel("系统名称").fill("金额验证单");
  await page.getByLabel("微信号").fill("wxid_money");
  await page.getByLabel("用户名").fill("金额用户");
  await page.getByLabel("GitHub 仓库 URL").fill("https://github.com/example/money");
  await page.getByLabel("初始总金额（元）").fill("500");
  await page.getByRole("button", { name: "创建" }).click();

  await expect(page.getByTestId("order-row").filter({ hasText: "金额验证单" })).toBeVisible();
  await page.getByTestId("order-row").filter({ hasText: "金额验证单" }).click();

  await page.getByRole("button", { name: "新增收款" }).click();
  await page.getByLabel("金额（元）").fill("100");
  await page.getByLabel("收款日期").fill("2026-02-19");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByTestId("summary-total-current")).toHaveText("500.00");
  await expect(page.getByTestId("summary-deposit")).toHaveText("100.00");
  await expect(page.getByTestId("summary-paid")).toHaveText("100.00");
  await expect(page.getByTestId("summary-outstanding")).toHaveText("400.00");
});

test("create dialog remains scrollable when viewport is short", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await page.getByRole("button", { name: "新建单子" }).click();

  const dialog = page.getByTestId("create-order-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("overflow-y", "auto");
  const canScroll = await dialog.evaluate((node) => node.scrollHeight > node.clientHeight);
  expect(canScroll).toBeTruthy();
});

test("can update status directly from detail area", async ({ page }) => {
  await page.getByTestId("order-row").filter({ hasText: "示例系统 A" }).click();

  const statusSelect = page.getByRole("combobox", { name: "详情状态" });
  await statusSelect.selectOption("done");
  await expect(statusSelect).toHaveValue("done");
});

test("soft delete, restore and hard delete flow works", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.getByTestId("order-row").filter({ hasText: "示例系统 A" }).click();
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "列表视图" }).selectOption("deleted");
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toBeVisible();

  await page.getByTestId("order-row").filter({ hasText: "示例系统 A" }).click();
  await page.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "列表视图" }).selectOption("active");
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toBeVisible();

  await page.getByTestId("order-row").filter({ hasText: "示例系统 A" }).click();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("combobox", { name: "列表视图" }).selectOption("deleted");
  await page.getByTestId("order-row").filter({ hasText: "示例系统 A" }).click();
  await page.getByRole("button", { name: "彻底删除" }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "示例系统 A" })).toHaveCount(0);
});
