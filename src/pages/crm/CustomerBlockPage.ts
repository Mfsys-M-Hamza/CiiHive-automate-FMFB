import { Page } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';

type Mode = 'Block' | 'UnBlock';

/**
 * CRM > Operations > Block > Block / UnBlock (forms BN_WF_BLOCK / BN_WF_UNBLOCK).
 * Two-step workflow (Information -> Overview); each request then needs approval under
 * CRM > Approval > Block > Block / UnBlock.
 */
export class CustomerBlockPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu, private readonly mode: Mode) {
    this.form = new DynamicForm(page);
  }

  async open(): Promise<void> {
    await this.page.goto(this.menu.url(`CRM > Operations > Block > ${this.mode}`));
    await this.form.settle();
    await this.form.startNew();
  }

  /** Blocks/unblocks a whole individual customer (not a single account). Returns the workflow number. */
  async submitForCustomer(customerNo: string): Promise<number> {
    const f = this.form;
    await f.radio('CMP_ACCOUNTTYPE', 'Customer No');
    await f.settle();
    await f.radio('PCT_CSTYCODE', 'Individual');
    await f.text('CMP_CUSTCODE', customerNo);
    await f.text('DECISION_AUTH', 'Compliance Department');
    await f.text('DECISION_NO', `DEC-${Date.now().toString().slice(-6)}`);
    await f.dropdown('BLOCK_REASON', 'Precautionary');
    await f.next(`${this.mode} information`);
    return f.submitWorkflow(`${this.mode} by regression suite`);
  }

  value(key: string): Promise<string> {
    return this.form.value(key);
  }
}
