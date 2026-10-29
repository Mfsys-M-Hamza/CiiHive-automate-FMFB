import { Locator, Page, expect } from '@playwright/test';

/**
 * Editable grids on the hand-built screens (Charge Exemption, Deposit Account Rate, …) show their row labels
 * inside inputs or dropdowns, not as text, so rows are found by input value / dropdown label.
 */
export class Grid {
  constructor(private readonly page: Page, private readonly root = page.locator('table:visible').last()) {}

  /** Row whose input value or dropdown label equals `label` (waits for the grid to load). */
  async row(label: string): Promise<Locator> {
    let index = -1;
    await expect.poll(async () => {
      index = await this.root.locator('tr').evaluateAll((rows, t) => rows.findIndex(r =>
        [...r.querySelectorAll('input')].some(i => (i as HTMLInputElement).value.trim() === t) ||
        [...r.querySelectorAll('.p-dropdown-label')].some(d => (d as HTMLElement).innerText.trim() === t)), label);
      return index;
    }, { message: `grid row "${label}"`, timeout: 30_000 }).toBeGreaterThanOrEqual(0);
    return this.root.locator('tr').nth(index);
  }

  /** Zero-based index of the column whose header text matches. */
  async column(header: RegExp): Promise<number> {
    const headers = await this.root.locator('tr').first().locator('th').allInnerTexts();
    const i = headers.findIndex(h => header.test(h.trim()));
    expect(i, `column ${header} in ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
    return i;
  }
}

export async function isChecked(checkbox: Locator): Promise<boolean> {
  return /p-highlight/.test((await checkbox.getAttribute('class')) ?? '');
}
