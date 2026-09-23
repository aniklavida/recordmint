import { test, expect } from "@playwright/test";

test("a user can select a source, record, pause, resume, and get a shareable link copied automatically", async ({ page }) => {
  // 1. Setup a user via API
  const email = `test-${Date.now()}@example.com`;
  const signupResponse = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: "password123",
      name: "Playwright Tester",
    },
  });
  expect(signupResponse.ok()).toBeTruthy();
  const { workspace } = await signupResponse.json();

  // 2. Go to the record page
  await page.goto(`/record?workspaceId=${workspace.id}`);

  // 3. Capability probe verdict is displayed before recording starts
  await expect(page.locator('[data-testid="capability-probe-loading"]')).toBeHidden();
  const verdict = page.locator('[data-testid="capability-verdict"]');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText("Ready to record");

  // 4. Source picker and toggles are accessible and configurable
  const sourcePicker = page.locator('[data-testid="source-picker"]');
  await expect(sourcePicker).toBeVisible();
  await expect(sourcePicker).toHaveValue("monitor");
  // Change source to window
  await sourcePicker.selectOption("window");
  await expect(sourcePicker).toHaveValue("window");

  const micToggle = page.locator('[data-testid="mic-toggle"]');
  await expect(micToggle).toBeVisible();
  await expect(micToggle).toBeChecked();

  const cameraToggle = page.locator('[data-testid="camera-toggle"]');
  await expect(cameraToggle).toBeVisible();
  await expect(cameraToggle).not.toBeChecked();

  const startBtn = page.locator('[data-testid="start-recording-button"]');
  await expect(startBtn).toBeEnabled();

  // 5. Start recording
  await startBtn.click();

  // 6. Live state while recording
  const liveContainer = page.locator('[data-testid="recorder-live"]');
  await expect(liveContainer).toBeVisible();

  const statusPill = page.locator('[data-testid="recording-status"]');
  await expect(statusPill).toHaveText("Recording");

  const elapsedTime = page.locator('[data-testid="elapsed-time"]');
  await expect(elapsedTime).toBeVisible();

  const uploadProgress = page.locator('[data-testid="upload-progress"]');
  await expect(uploadProgress).toBeVisible();
  await expect(uploadProgress).toContainText("Uploaded:");

  // Wait a moment for recording timer to tick
  await page.waitForTimeout(1500);

  // 7. Pause functionality
  const pauseBtn = page.locator('[data-testid="pause-button"]');
  await expect(pauseBtn).toBeVisible();
  await pauseBtn.click();

  await expect(statusPill).toHaveText("Paused");
  const pausedTimeText = await elapsedTime.innerText();

  // Wait another moment to confirm elapsed time is paused
  await page.waitForTimeout(1500);
  const pausedTimeTextAfterWait = await elapsedTime.innerText();
  expect(pausedTimeTextAfterWait).toBe(pausedTimeText);

  // 8. Resume functionality
  const resumeBtn = page.locator('[data-testid="resume-button"]');
  await expect(resumeBtn).toBeVisible();
  await resumeBtn.click();
  await expect(statusPill).toHaveText("Recording");

  await page.waitForTimeout(1000);

  // 9. Stop recording
  const stopBtn = page.locator('[data-testid="stop-recording-button"]');
  await expect(stopBtn).toBeVisible();
  await stopBtn.click();

  // 10. Share link is presented and clipboard notice is displayed automatically
  const shareSection = page.locator('[data-testid="share-section"]');
  await expect(shareSection).toBeVisible();
  await expect(page.locator('[data-testid="clipboard-notice"]')).toContainText("Share link copied to clipboard");

  const linkInput = page.locator('[data-testid="share-link-input"]');
  await expect(linkInput).toBeVisible();
  const linkText = await linkInput.inputValue();
  expect(linkText).toMatch(/^http:\/\/localhost:3000\/v\/[a-zA-Z0-9_-]+$/);

  const linkAnchor = page.locator('[data-testid="share-link-anchor"]');
  await expect(linkAnchor).toBeVisible();
  expect(await linkAnchor.innerText()).toBe(linkText);

  // 11. Verify the link actually opens the player page
  await page.goto(linkText);
  await expect(page.locator(".recording-viewer")).toBeVisible();
});

test("honest failure handling preserves local blob and allows retry when upload fails", async ({ page }) => {
  // 1. Setup a user via API
  const email = `test-fail-${Date.now()}@example.com`;
  const signupResponse = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: "password123",
      name: "Failure Tester",
    },
  });
  expect(signupResponse.ok()).toBeTruthy();
  const { workspace } = await signupResponse.json();

  // 2. Go to record page
  await page.goto(`/record?workspaceId=${workspace.id}`);
  await expect(page.locator('[data-testid="start-recording-button"]')).toBeEnabled();

  // 3. Intercept complete endpoint to simulate network/server failure
  let intercepted = true;
  await page.route("**/api/recordings/*/complete", (route) => {
    if (intercepted) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Simulated S3 Complete Failure" }),
      });
    }
    return route.continue();
  });

  // 4. Start recording and stop
  await page.locator('[data-testid="start-recording-button"]').click();
  await expect(page.locator('[data-testid="recording-status"]')).toHaveText("Recording");
  await page.waitForTimeout(1000);

  await page.locator('[data-testid="stop-recording-button"]').click();

  // 5. Verify honest error banner is shown with preserved local blob
  const errorBanner = page.locator('[data-testid="error-banner"]');
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toContainText("Upload could not finish");
  await expect(errorBanner).toContainText("Your recording has been preserved locally");

  // Verify local download link is present
  const downloadLink = page.locator('[data-testid="download-local-recording"]');
  await expect(downloadLink).toBeVisible();
  const blobHref = await downloadLink.getAttribute("href");
  expect(blobHref).toMatch(/^blob:/);

  // 6. Test retry: un-intercept and click Retry Upload
  intercepted = false;
  const retryBtn = page.locator('[data-testid="retry-upload-button"]');
  await expect(retryBtn).toBeVisible();
  await retryBtn.click();

  // 7. Verify recovery succeeds and share link is presented
  await expect(page.locator('[data-testid="share-section"]')).toBeVisible();
  const linkInput = page.locator('[data-testid="share-link-input"]');
  await expect(linkInput).toBeVisible();
  const recoveredLink = await linkInput.inputValue();
  expect(recoveredLink).toMatch(/^http:\/\/localhost:3000\/v\/[a-zA-Z0-9_-]+$/);
});
