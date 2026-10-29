import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { WalkingCustomer } from '../../data/customer';
import { dismissToasts, waitForToast } from '../../core/toast';

/**
 * CRM > Operations > Walking Customer > Create / Edit (forms BN_CP_WALKINGCUSTOMER / _EDIT).
 * Single-page form, no approval. Edit works by clicking a row's edit button in the
 * "Walking Customer list" shown under the form.
 */
export class WalkingCustomerPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  /** Creates a walking customer and returns its serial number. */
  async create(w: WalkingCustomer): Promise<number> {
    await this.page.goto(this.menu.url('CRM > Operations > Walking Customer > Create Walking Customer'));
    await this.form.settle();
    await this.form.startNew();
    await this.form.dropdown('PIT_IDENCODE', 0); // National ID card
    await this.form.text('CIT_IDENVALUE', w.identificationNo);
    await this.form.text('CMP_FIRSTNAME', w.first);
    await this.form.text('CMP_FATHERNAME', w.father);
    await this.form.text('CMP_LASTNAME', w.last);
    await this.form.text('CMP_MOTHERNAME', w.mother);
    await this.form.text('CMP_BPLACE', w.birthPlace);
    await this.form.date('CMP_CUSTDATEBIRTH', w.dateOfBirth);
    return this.save(/Record created with (\d+)/, 'SERIAL_NO');
  }

  async openEdit(): Promise<void> {
    await this.page.goto(this.menu.url('CRM > Operations > Walking Customer > Edit Walking Customer'));
    await this.form.settle();
    await this.form.startNew(); // shows the list
    await this.page.locator('table tbody tr').first().waitFor();
  }

  /** Clicks the edit button on the list row of `identificationNo`, paging through the list. */
  async selectFromList(identificationNo: string): Promise<void> {
    const row = this.page.locator('table tbody tr').filter({ hasText: identificationNo });
    const nextPage = this.page.locator('.p-paginator-next');
    while (!(await row.count()) && await nextPage.isEnabled().catch(() => false)) {
      await nextPage.click();
      await this.page.waitForTimeout(300);
    }
    await expect(row, `walking customer ${identificationNo} should be listed on the Edit screen`).toHaveCount(1);
    await row.locator('button[icon="p-icon-edit"]').click();
    await this.form.settle();
    await expect(this.form.field('CIT_IDENVALUE').locator('input')).toHaveValue(identificationNo);
  }

  async setMotherName(name: string): Promise<void> {
    await this.form.text('CMP_MOTHERNAME', name);
  }

  async saveEdit(): Promise<void> {
    await this.save(/Record (updated|Updated)/);
  }

  private async save(toast: RegExp, idField?: string): Promise<number> {
    const saved = this.page.waitForResponse(r => /\/mongodb\/formdata/.test(r.url()) && ['POST', 'PATCH', 'PUT'].includes(r.request().method()), { timeout: 60_000 });
    await dismissToasts(this.page);
    await this.page.getByRole('button', { name: 'Save' }).click();
    const response = await saved;
    expect(response.ok(), `walking customer save: HTTP ${response.status()}`).toBeTruthy();
    await waitForToast(this.page, toast);
    if (!idField) return 0;
    const body = await response.json();
    expect(body?.[idField]?.[0], `formdata response: ${JSON.stringify(body)}`).toBeTruthy();
    return body[idField][0];
  }
}
