import { Page } from '@playwright/test';

const TOAST = '.p-toast-message';

export async function visibleToasts(page: Page): Promise<string[]> {
  return page.$$eval(TOAST, els => els.map(e => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
}

export async function dismissToasts(page: Page): Promise<void> {
  for (const close of await page.locator(`${TOAST} .p-toast-icon-close`).all()) {
    await close.click().catch(() => {});
  }
}

/** Waits for a toast matching `pattern` and returns its regex match. Fails fast on an error toast. */
export async function waitForToast(page: Page, pattern: RegExp, timeout = 30_000): Promise<RegExpMatchArray> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const text of await visibleToasts(page)) {
      const m = text.match(pattern);
      if (m) return m;
      if (/^Error\b/.test(text)) throw new Error(`Error toast while waiting for ${pattern}: ${text}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`No toast matching ${pattern} within ${timeout}ms. Visible: ${(await visibleToasts(page)).join(' | ')}`);
}

/** Throws if an error toast is showing (e.g. "ERR_APP_F_0012 Invalid Input" after Next). */
export async function assertNoErrorToast(page: Page, context: string): Promise<void> {
  const errors = (await visibleToasts(page)).filter(t => /^Error\b/.test(t));
  if (errors.length) throw new Error(`${context}: ${errors.join(' | ')}`);
}
