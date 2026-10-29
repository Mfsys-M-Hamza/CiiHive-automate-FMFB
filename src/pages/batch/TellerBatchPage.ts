import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { dismissToasts, visibleToasts } from '../../core/toast';

type Operation = 'Open Batch' | 'Close Batch' | 'Replenish' | 'Cash To Vault';

/**
 * Teller Batch > Operations > Open Batch / Close Batch / Replenish / Cash To Vault
 * (forms BN_WF_OB/CB/RB/TB_BATCHREGISTRATION). Each is a small workflow (currency, amount, comments)
 * approved under Teller Batch > Approval. A user can have only one open batch per currency.
 */
export class TellerBatchPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  /** Cash currently held in this user's open batch for `currencyCode` (760 = SYP), or null if none is open. */
  async balance(currencyCode = '760'): Promise<number | null> {
    await this.page.goto(this.menu.url('Teller Batch > Operations > Close Batch'));
    await this.form.settle();
    await this.form.startNew();
    const response = this.page.waitForResponse(r => /\/userbatches\/locations\/\d+\/users\/[^/]+\/currencies\/\d+\/balances/.test(r.url())
      && r.url().includes(`/currencies/${currencyCode}/`), { timeout: 30_000 });
    await this.form.dropdown('PCR_CURRCODE', 'SYP');
    const r = await response;
    if (!r.ok()) return null;
    const body = await r.json();
    return typeof body?.CURRENT_AMOUNT === 'number' ? body.CURRENT_AMOUNT : null;
  }

  /**
   * Submits a batch operation and returns the workflow number.
   * Throws with the app's message when it refuses (e.g. "User batch already open").
   */
  async submit(operation: Operation, amount: number, comment: string, currency = 'SYP'): Promise<number> {
    await this.page.goto(this.menu.url(`Teller Batch > Operations > ${operation}`));
    await this.form.settle();
    await this.form.startNew();
    await dismissToasts(this.page);
    await this.form.dropdown('PCR_CURRCODE', currency);
    const errors = (await visibleToasts(this.page)).filter(t => /^Error\b/.test(t));
    expect(errors, `${operation} for ${currency}`).toEqual([]);
    await this.form.text('SGT_GNTRAMTFC', amount);
    await this.form.text('SGT_GNTRNARRATION', comment);
    // Cash To Vault has a single (overview) step, so there may be no Next.
    if (await this.page.getByRole('button', { name: 'Next' }).isVisible()) await this.form.next(operation);
    return this.form.submitWorkflow(comment);
  }
}
