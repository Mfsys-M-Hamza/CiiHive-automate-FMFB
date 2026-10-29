import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { waitForToast } from '../../core/toast';

/**
 * CRM > Modification > Individual Customer (form BN_WF_CP_AUTHORIZATION, update mode).
 * Loads an approved customer by Customer No (toolbar Fetch) and saves changes directly – no approval step.
 */
export class CustomerModificationPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(): Promise<void> {
    await this.page.goto(this.menu.url('CRM > Modification > Individual Customer'));
    await this.form.settle();
  }

  async fetch(customerNo: string): Promise<void> {
    await this.form.text('CMP_CUSTCODE', customerNo);
    const loaded = this.page.waitForResponse(r => r.url().includes('/crm/mongodb/getformdata'), { timeout: 60_000 });
    await this.page.locator('button:has(.custom_icon_fetch_ic)').first().click();
    await loaded;
    await this.form.settle();
    await expect(this.form.field('CMP_FIRSTNAME_ENGLISH').locator('input')).not.toHaveValue('');
  }

  value(key: string): Promise<string> {
    return this.form.value(key);
  }

  async setGrandfatherName(ar: string, en: string): Promise<void> {
    await this.form.text('KYC_GF_NAME', ar);
    await this.form.text('KYC_GF_NAME_ENG', en);
  }

  async save(): Promise<void> {
    const updated = this.page.waitForResponse(r => r.url().includes('/crm/updateCustomer'), { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Save' }).click();
    expect((await updated).ok(), 'PATCH /crm/updateCustomer should succeed').toBeTruthy();
    await waitForToast(this.page, /Record Updated/);
  }
}
