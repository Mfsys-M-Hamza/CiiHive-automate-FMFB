import { Page, expect } from '@playwright/test';
import path from 'path';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';

const DOCUMENT = path.resolve(__dirname, '../../../fixtures/files/test-document.png');

/**
 * Deposit > Operations > Open Account > Individual / Digital (forms BN_MS_ID_REGISTRATION / BN_MS_DID_REGISTRATION).
 * Individual: Registration -> Associate Information -> Documents -> Relations -> Overview (only Registration is mandatory).
 * Digital:    Registration -> Documents (one document required) -> Overview.
 * The account number is issued when the application is approved.
 */
export class OpenDepositAccountPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(kind: 'Individual' | 'Digital' = 'Individual'): Promise<void> {
    await this.page.goto(this.menu.url(`Deposit > Operations > Open Account > ${kind}`));
    await this.form.settle();
    await this.form.startNew();
  }

  /** Registration step shared by both forms: product, customer (profile is pulled from CRM), credit officer. */
  private async fillRegistration(customerNo: string, identificationNo: string, product: string, title?: string): Promise<void> {
    const f = this.form;
    await f.dropdown('DMP_PRODCODE', product);
    const loaded = this.page.waitForResponse(r => r.url().includes('/crm/mongodb/controlSelect'), { timeout: 60_000 });
    await f.text('CMP_CUSTCODE', customerNo);
    await loaded;
    await f.settle();
    await expect(f.field('CMP_NAME').locator('input')).not.toHaveValue('');
    expect(await f.value('PIT_IDENVALUE')).toBe(identificationNo);
    if (title) await f.text('MBM_BKMSTITLE', title);
    await f.dropdown('PCD_CORDCODE', 0);
    await f.next('Registration');
  }

  /** Individual account for an approved customer. Returns the workflow application number. */
  async openIndividual(customerNo: string, identificationNo: string, product = 'Saving Account'): Promise<number> {
    await this.fillRegistration(customerNo, identificationNo, product);
    await this.form.next('Associate Information');
    await this.form.next('Documents');
    await this.form.next('Relations');
    return this.form.submitWorkflow('Deposit account opened by regression suite');
  }

  /** Digital account (title is not pre-filled, a document is mandatory). Returns the workflow number. */
  async openDigital(customerNo: string, identificationNo: string, title: string, product = 'Current Deposit'): Promise<number> {
    await this.fillRegistration(customerNo, identificationNo, product, title);
    await this.form.dropdown('PDT_DOTYCODE', 'Account Opening Form');
    await this.form.upload('BDO_DOCUMENTFILE', DOCUMENT);
    await this.form.next('Documents');
    return this.form.submitWorkflow('Digital account opened by regression suite');
  }
}
