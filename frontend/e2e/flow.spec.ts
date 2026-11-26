import { expect, test } from "@playwright/test";

test("register, add a client, log out and back in: the client is still there", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill("E2E Freelancer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByText("Clients & projects").first().click();
  await page.getByPlaceholder("New client name").fill("Acme Ltd");
  await page.getByRole("button", { name: /Add client|Add/ }).first().click();
  await expect(page.getByText("Acme Ltd").first()).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Clients & projects").first().click();
  await expect(page.getByText("Acme Ltd").first()).toBeVisible();
});
