import { test, expect } from "@playwright/test";

test("a user can record and get a shareable link", async ({ page, request }) => {
  // 1. Setup a user via API
  const email = `test-${Date.now()}@example.com`;
  const signupResponse = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: "password123",
      name: "Playwright Tester"
    }
  });
  expect(signupResponse.ok()).toBeTruthy();
  const { workspace } = await signupResponse.json();

  // 2. Go to the record page
  await page.goto(`/record?workspaceId=${workspace.id}`);

  // 3. Verify page loaded and capability probe succeeded
  await expect(page.locator("text=Checking browser capabilities...")).toBeHidden();
  await expect(page.getByRole("button", { name: "Start Recording" })).toBeEnabled();

  // 4. Start recording
  await page.getByRole("button", { name: "Start Recording" }).click();

  // 5. Verify recording state
  await expect(page.locator("text=Stop Recording")).toBeVisible();
  
  // Wait a moment for some chunks to buffer/upload
  await page.waitForTimeout(2000);

  // 6. Stop recording
  await page.getByRole("button", { name: "Stop Recording" }).click();

  // 7. Verify the share link is presented
  await expect(page.locator("text=Recording ready!")).toBeVisible();
  const linkLocator = page.locator("a[href^='http://localhost:3000/v/']");
  await expect(linkLocator).toBeVisible();

  // Since it's unattended in Chromium, the clipboard might fail to write without permission or focus,
  // but we can at least check if the link is displayed in the UI correctly.
  const linkText = await linkLocator.innerText();
  expect(linkText).toMatch(/http:\/\/localhost:3000\/v\/[a-zA-Z0-9_-]+/);
});
