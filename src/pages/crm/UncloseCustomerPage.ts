import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { dismissToasts, visibleToasts, waitForToast } from '../../core/toast';

/**
 * CRM > Unclose Customer (form BN_WF_CP_UNCLOSED).
 * Reopens a customer application that was closed from the approval screen, sending it back to the approval queue.
 */
export class UncloseCustomerPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(): Promise<void> {
    await this.page.goto(this.menu.url('CRM > Unclose Customer'));
    await this.form.settle();
    await this.form.startNew();
  }

  /**
   * Looks up the customer by identification number; returns the shown status (e.g. "Closed") or the error toast.
   * The app only runs this check the first time an ID is entered in a session, so call it once per test.
   */
  async lookup(identificationNo: string): Promise<{ status: string; error?: string }> {
    await dismissToasts(this.page);
    const checked = this.page.waitForResponse(r => r.url().includes('/crm/CustomerUnCloseController/'), { timeout: 60_000 });
    await this.form.text('CIT_IDENVALUE', identificationNo);
    await checked;
    await this.form.settle();
    const error = (await visibleToasts(this.page)).find(t => /^Error\b/.test(t));
    return { status: await this.form.value('applicationStatus'), error };
  }

  async unclose(): Promise<void> {
    await dismissToasts(this.page);
    const updated = this.page.waitForResponse(r => r.url().includes('/crm/updateClosedCustomerAccount'), { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Save' }).click();
    const response = await updated;
    expect(response.ok() && (await response.text()) === 'true', 'PATCH /crm/updateClosedCustomerAccount should return true').toBeTruthy();
    await waitForToast(this.page, /Record Updated/);
  }
}
