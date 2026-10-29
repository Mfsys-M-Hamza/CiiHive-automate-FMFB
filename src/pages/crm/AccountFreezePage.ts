import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';

type Mode = 'Freeze Accounts' | 'Unfreeze Account';

/**
 * CRM > Operations > Freeze > Freeze Accounts / Unfreeze Account (forms BN_WF_FREEZE / BN_WF_UN_FREEZE).
 * Works on a single deposit or loan account. Two-step workflow; each request is approved under
 * CRM > Approval > Freeze > Freeze / UnFreeze.
 */
export class AccountFreezePage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu, private readonly mode: Mode) {
    this.form = new DynamicForm(page);
  }

  async open(): Promise<void> {
    await this.page.goto(this.menu.url(`CRM > Operations > Freeze > ${this.mode}`));
    await this.form.settle();
    await this.form.startNew();
  }

  /** Freezes/unfreezes a deposit account for both credit and debit. Returns the workflow number. */
  async submitForDepositAccount(accountNo: string): Promise<number> {
    const f = this.form;
    await f.radio('MBM_BKMSFREEZETYPE', 'Credit/Debit');
    await f.radio('MODULE_ID', 'Deposit Account');
    await f.settle();
    const verified = this.page.waitForResponse(r => r.url().includes('/deposit/account/verifyDepositAccountFreeze/'), { timeout: 60_000 });
    await f.text('MBM_BKMSNUMBER', accountNo);
    expect((await verified).ok(), `account ${accountNo} should be accepted for ${this.mode}`).toBeTruthy();
    await f.settle();
    await expect(f.field('MBM_BKMSTITLE').locator('input')).not.toHaveValue('');
    await f.text('DECISION_AUTH', 'Compliance Department');
    await f.text('DECISION_NO', `DEC-${Date.now().toString().slice(-6)}`);
    await f.dropdown('FREEZE_REASON', 'Precautionary');
    await f.next(`${this.mode} information`);
    return f.submitWorkflow(`${this.mode} by regression suite`);
  }
}
