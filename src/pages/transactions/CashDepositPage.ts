import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { dismissToasts, waitForToast } from '../../core/toast';

/**
 * Cash Transaction > Deposit > Cash Deposit (hand-built form "cash-deposit").
 * Needs an open teller batch. Posting creates a pending transaction that must be authorized under
 * Authorization > Deposit > Deposit Authorization before the balance moves.
 */
export class CashDepositPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  /** Deposits cash by the account owner. Returns the transaction number, e.g. 562249 (shown as "S1-A562249"). */
  async deposit(accountNo: string, amount: number, remarks: string): Promise<number> {
    const f = this.form;
    await this.page.goto(this.menu.url('Cash Transaction > Deposit > Cash Deposit'));
    await f.settle();
    await f.startNew();
    const loaded = this.page.waitForResponse(r => r.url().includes('/deposit/account/depositchargesdetails/'), { timeout: 60_000 });
    await f.text('mbmBkmsnumber', accountNo);
    await loaded;
    await f.settle();
    await expect(f.field('mbmBkmstitle').locator('input')).not.toHaveValue('');
    await f.text('sgtGntramtfc', amount);
    await f.text('sgtGntrnarration', remarks);
    // "Same/Owner": the depositor is the account holder, so the walk-in KYC block is hidden.
    await f.dropdown('sgtPtrtrancode', 'Same/Owner');
    await f.text('sgtSourceoffunds', 'Salary');
    await f.text('sgtTranreason', 'Savings');
    await f.dropdown('sgtPrcRlcscodec', 'Other');
    await f.dropdown('sgtBnfowner', 'Owner');
    expect(await f.invalidFields()).toEqual([]);

    await dismissToasts(this.page);
    const posted = this.page.waitForResponse(r => r.url().includes('/deposit/transactions/cashdeposit'), { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Save' }).click();
    const body = await (await posted).json();
    const ref: string = body?.arguments?.[0] ?? '';
    expect(ref, `cash deposit response: ${JSON.stringify(body)}`).toMatch(/\d+$/);
    await waitForToast(this.page, new RegExp(`Transaction ${ref} posted successfully`));
    // Decline the receipt print prompt.
    const printPrompt = this.page.locator('.p-dialog:visible').filter({ hasText: 'Print the Receipt' });
    if (await printPrompt.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await printPrompt.getByRole('button', { name: 'No' }).click();
    }
    return Number(ref.match(/(\d+)$/)![1]);
  }
}
