import { Locator, Page, expect } from '@playwright/test';

/**
 * Editable grids on the hand-built screens (Charge Exemption, Deposit Account Rate, …) show their row labels
 * inside inputs or dropdowns, not as text, so rows are found by input value / dropdown label.
 */
export class Grid {
  constructor(private readonly page: Page, private readonly root = page.locator('table:visible').last()) {}

  /** Row whose input value or dropdown label equals `label` (waits for the grid to load). */
  async row(label: string): Promise<Locator> {
    return this.find(`grid row "${label}"`, (rows, t) => rows.findIndex(r =>
      [...r.querySelectorAll('input')].some(i => (i as HTMLInputElement).value.trim() === t) ||
      [...r.querySelectorAll('.p-dropdown-label')].some(d => (d as HTMLElement).innerText.trim() === t)), label);
  }

  /** Row with a numeric input equal to `n` (inputs are formatted like "562,249.000000"). */
  async rowWithNumber(n: number | string, timeout = 30_000): Promise<Locator> {
    return this.find(`grid row with number ${n}`, (rows, t) => rows.findIndex(r =>
      [...r.querySelectorAll('input')].some(i => Number((i as HTMLInputElement).value.replace(/,/g, '')) === Number(t))), String(n), timeout);
  }

  private async find(message: string, fn: (rows: Element[], arg: string) => number, arg: string, timeout = 30_000): Promise<Locator> {
    let index = -1;
    await expect.poll(async () => (index = await this.root.locator('tr').evaluateAll(fn, arg)),
      { message, timeout }).toBeGreaterThanOrEqual(0);
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
