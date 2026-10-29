import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { Grid, isChecked } from '../../core/grid';
import { dismissToasts, visibleToasts, waitForToast } from '../../core/toast';

/** Clicks Save and waits for the server call matching `endpoint` plus the success toast. */
async function saveAndConfirm(page: Page, endpoint: RegExp, toast = /Record Updated/): Promise<void> {
  await dismissToasts(page);
  const saved = page.waitForResponse(r => endpoint.test(r.url()) && r.request().method() !== 'GET', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Save' }).click();
  const response = await saved;
  expect(response.ok(), `${response.url()} -> HTTP ${response.status()} ${await response.text()}`).toBeTruthy();
  await waitForToast(page, toast);
}

/**
 * Deposit > Modification > Account > Individual (form BN_MS_ID_AUTHORIZATION, update mode).
 * Fetch by account number, edit, Save -> PATCH /deposit/account/updateAccount. No approval step.
 */
export class DepositAccountModificationPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async fetch(accountNo: string): Promise<void> {
    await this.page.goto(this.menu.url('Deposit > Modification > Account > Individual'));
    await this.form.settle();
    await this.form.text('MBM_BKMSNUMBER', accountNo);
    const loaded = this.page.waitForResponse(r => r.url().includes('/deposit/mongodb/getformdata'), { timeout: 60_000 });
    await this.page.locator('button:has(.custom_icon_fetch_ic)').first().click();
    await loaded;
    await this.form.settle();
    await expect(this.form.field('CMP_CUSTCODE').locator('input')).not.toHaveValue('');
  }

  value(key: string): Promise<string> {
    return this.form.value(key);
  }

  async setTitle(title: string): Promise<void> {
    // Known app issue: leaving the title field fires a lookup that drops the account number, and Save then
    // fails with "Customer account null does not exist". Type without blurring.
    await this.form.field('MBM_BKMSTITLE').locator('input').fill(title);
  }

  async save(): Promise<void> {
    await saveAndConfirm(this.page, /\/deposit\/account\/updateAccount/);
  }
}

/** Shared shape of the hand-built account screens: "+" then Account No., details load on blur. */
abstract class AccountScreen {
  protected readonly form: DynamicForm;
  protected abstract readonly path: string;
  /** Request that returns the account's details once the number is entered. */
  protected abstract readonly loadedBy: RegExp;

  constructor(protected readonly page: Page, protected readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(accountNo: string): Promise<void> {
    await this.page.goto(this.menu.url(this.path));
    await this.form.settle();
    await this.form.startNew();
    const loaded = this.page.waitForResponse(r => this.loadedBy.test(r.url()), { timeout: 60_000 });
    await this.form.text('mbmBkmsnumber', accountNo);
    await loaded;
    await this.form.settle();
    await expect(this.form.field('mbmBkmstitle').locator('input')).not.toHaveValue('');
  }
}

/** Deposit > Modification > Charge Exemption: tick a charge to exempt this account from it. */
export class ChargeExemptionPage extends AccountScreen {
  protected readonly path = 'Deposit > Modification > Charge Exemption';
  protected readonly loadedBy = /fetchAccountBasedExemptableCharges/;

  private async checkbox(charge: string) {
    return (await new Grid(this.page).row(charge)).locator('.p-checkbox-box');
  }

  async isExempted(charge: string): Promise<boolean> {
    return isChecked(await this.checkbox(charge));
  }

  async setExempted(charge: string, exempted: boolean): Promise<void> {
    const box = await this.checkbox(charge);
    if ((await isChecked(box)) !== exempted) await box.click();
  }

  async save(): Promise<void> {
    await saveAndConfirm(this.page, /UpdateAccountBasedExemptableCharges/);
  }
}

/** Deposit > Modification > Deposit Account Rate: account-level rate per charge. */
export class DepositAccountRatePage extends AccountScreen {
  protected readonly path = 'Deposit > Modification > Deposit Account Rate';
  protected readonly loadedBy = /\/deposit\/application\/depositaccount\/organizations\/.+\/accounts\//;

  private async rateInput(charge: string) {
    const grid = new Grid(this.page);
    const col = await grid.column(/^Account/);
    return (await grid.row(charge)).locator('td').nth(col).locator('input');
  }

  async accountRate(charge: string): Promise<number> {
    return Number((await (await this.rateInput(charge)).inputValue()).replace(/,/g, ''));
  }

  async setAccountRate(charge: string, rate: number): Promise<void> {
    const input = await this.rateInput(charge);
    await input.click();
    await input.fill('');
    await input.pressSequentially(String(rate), { delay: 30 });
    await input.press('Tab');
    await this.form.settle();
  }

  async save(): Promise<void> {
    await saveAndConfirm(this.page, /\/deposit\/account\/rate/);
  }
}

/** Deposit > Operations > Utilities > Mark Lien Account: blocks part of the available balance. */
export class LienMarkingPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  /** Opens the screen for a deposit account and returns its available balance and already-blocked amount. */
  async open(accountNo: string): Promise<{ balance: number; blocked: number }> {
    await this.page.goto(this.menu.url('Deposit > Operations > Utilities > Mark Lien Account'));
    await this.form.settle();
    await this.form.startNew();
    await this.form.radio('accountType', 'Deposit');
    const loaded = this.page.waitForResponse(r => r.url().includes('/deposit/account/deposittdrchargesdetails/'), { timeout: 60_000 });
    await this.form.text('mbmBkmsnumber', accountNo);
    await loaded;
    await this.form.settle();
    const num = async (key: string) => Number((await this.form.value(key)).replace(/,/g, '')) || 0;
    return { balance: await num('mbmBkmsbalance'), blocked: await num('prevBlockedamt') };
  }

  /** Sets the account's total blocked amount ("New Blocked Amount" replaces the current lien total). */
  async setBlockedAmount(total: number, reason = 'Upon Customer Request'): Promise<void> {
    await this.form.text('bdaDpacblockamt', total);
    await this.form.dropdown('bdaLienreason', reason);
    await this.form.radio('mbmLoanLienAllowed', 'No');
    await this.form.settle();
    // Known app issue: the loan Maturity Date stays mandatory even with "Lien On Loan = No".
    await this.form.date('blaLnacmaturitydateLoanRef', '31/12/2027');
    await saveAndConfirm(this.page, /\/deposit\/account\/markLien/, /Record Added/);
  }
}

/** Deposit > Operations > Utilities > Unmark Dormant Account. */
export class UnmarkDormantPage extends AccountScreen {
  protected readonly path = 'Deposit > Operations > Utilities > Unmark Dormant Account';
  protected readonly loadedBy = /unmarkDormantAccountDetails/;

  status(): Promise<string> {
    return this.form.value('pasAcstcode');
  }

  /** Submits the unmark request; returns the error toast text if the app rejects it. */
  async unmark(reason: string, comment: string): Promise<string | undefined> {
    await this.form.dropdown('prsResncode', reason);
    await this.form.text('mbmBkmtcomment', comment);
    await dismissToasts(this.page);
    const done = this.page.waitForResponse(r => r.url().includes('/deposit/account/unmarkdorm'), { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Save' }).click();
    if (await this.page.locator('.p-dialog:visible').filter({ hasText: 'Confirmation' }).waitFor({ timeout: 2_000 }).then(() => true, () => false)) {
      await this.form.confirm('Accept', comment);
    }
    await done;
    await this.form.settle();
    return (await visibleToasts(this.page)).find(t => /^Error\b/.test(t));
  }
}
