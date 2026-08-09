import { expect, test } from "@playwright/test";

test("opens the editor and export workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PIXELSNACK")).toBeVisible();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await page.getByRole("button", { name: "完成并导出" }).click();
  await expect(page.getByRole("heading", { name: "完成并导出" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出 PNG" })).toBeEnabled();
});

test("creates a custom project", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "desktop quick-create control");
  await page.goto("/");
  await page.getByRole("button", { name: /新建/ }).click();
  await page.getByLabel("作品名称").last().fill("TEST GRID");
  await page.getByRole("button", { name: "创建画布" }).click();
  await expect(page.getByLabel("作品名称").first()).toHaveValue("TEST GRID");
});

test("mobile exposes full canvas tools", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile breakpoint only");
  await page.goto("/");
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await page.getByRole("button", { name: "✦ 工具" }).click();
  await expect(page.getByRole("button", { name: "◇ 橡皮" })).toBeVisible();
});
