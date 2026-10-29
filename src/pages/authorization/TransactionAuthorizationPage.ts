import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { Grid, isChecked } from '../../core/grid';
import { dismissToasts } from '../../core/toast';

type Module = 'Deposit' | 'Loan';

/**
 * Authorization > Deposit / Loan > … Authorization (hand-built "…-transaction-authorization").
 * Lists pending transactions of the business date for an event type; tick and Authorize.
 * The app shows no success message, so success = the transaction leaves the pending list.
 */
export class TransactionAuthorizationPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu, private readonly module: Module = 'Deposit') {
    this.form = new DynamicForm(page);
  }

  private async list(eventType: string): Promise<void> {
    await this.page.goto(this.menu.url(`Authorization > ${this.module} > ${this.module} Authorization`));
    await this.form.settle();
    await this.form.startNew();
    const listed = this.page.waitForResponse(r => /\/sqldb\/select/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await this.form.dropdown('sgtPeteventcode', eventType);
    await listed;
    await this.form.settle();
  }

  async isPending(eventType: string, transactionNo: number): Promise<boolean> {
    await this.list(eventType);
    return new Grid(this.page).rowWithNumber(transactionNo, 5_000).then(() => true, () => false);
  }

  async authorize(eventType: string, transactionNo: number): Promise<void> {
    await this.list(eventType);
    // The list re-renders after loading; a tick on the old render is lost and Authorize then silently does nothing.
    await this.page.waitForTimeout(1_000);
    let ticked = false;
    for (let attempt = 0; attempt < 3 && !ticked; attempt++) {
      const box = (await new Grid(this.page).rowWithNumber(transactionNo)).locator('.p-checkbox-box').first();
      if (!(await isChecked(box))) await box.click();
      await this.page.waitForTimeout(500);
      ticked = await isChecked((await new Grid(this.page).rowWithNumber(transactionNo)).locator('.p-checkbox-box').first());
    }
    expect(ticked, `transaction ${transactionNo} should be selected`).toBe(true);
    await dismissToasts(this.page);
    await this.page.getByRole('button', { name: 'Authorize' }).click();
    if (await this.page.locator('.p-dialog:visible').filter({ hasText: 'Confirmation' }).waitFor({ timeout: 2_000 }).then(() => true, () => false)) {
      await this.form.confirm('Accept', 'Authorized by regression suite');
    }
    await this.form.settle();
    await expect.poll(() => this.isPending(eventType, transactionNo), {
      message: `transaction ${transactionNo} should leave the pending ${eventType} list`, timeout: 60_000, intervals: [2_000],
    }).toBe(false);
  }
}
