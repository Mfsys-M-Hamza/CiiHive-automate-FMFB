import { Locator, Page, expect } from '@playwright/test';
import { assertNoErrorToast, dismissToasts } from './toast';

/**
 * Driver for CIIHive's metadata-driven ("dynamic") forms.
 *
 * Every field renders as `<div class="p-g"><div><label for="FIELD_KEY">…</label></div><div>control</div></div>`,
 * where FIELD_KEY is the backend column (CMP_FIRSTNAME, PAD_ADRSMOBPHONE, …). Keys are stable across
 * releases and languages, so all lookups go through the label's `for` attribute.
 */
export class DynamicForm {
  constructor(private readonly page: Page) {}

  field(key: string): Locator {
    return this.page.locator(`div.p-g:has(> div > label[for="${key}"])`).first();
  }

  /** Waits for pending XHRs (cascading dropdowns, duplicate checks) to finish. */
  async settle(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    // The app blocks the whole page with an overlay while it loads a step.
    await this.page.locator('.p-blockui-document').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Fills a text/number input. Read-only (auto-computed) fields are skipped. */
  async text(key: string, value: string | number): Promise<void> {
    const input = this.field(key).locator('input:not([type=radio]):not([type=checkbox]), textarea').first();
    if (!(await input.isEditable())) return;
    await input.fill('');
    await input.fill(String(value));
    await input.press('Tab');
    await this.settle();
  }

  /**
   * Picks a PrimeNG dropdown option by leading text (e.g. "Male" won't match "Female / أنثى")
   * or by index. Retries because dependent dropdowns reload and can reset a selection.
   */
  async dropdown(key: string, option: string | number): Promise<string> {
    const dd = this.field(key).locator('p-dropdown');
    for (let attempt = 0; attempt < 4; attempt++) {
      // Keep the overlay clear of the fixed footer: scrolling to an option re-renders the panel.
      await dd.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await dd.locator('.p-dropdown-trigger').click();
      const items = this.page.locator('.p-dropdown-panel .p-dropdown-item');
      await items.first().waitFor({ timeout: 10_000 });
      // PrimeNG ignores option clicks while the overlay's open animation is still running.
      await this.page.locator('.p-dropdown-panel.ng-animating').waitFor({ state: 'detached', timeout: 2_000 }).catch(() => {});
      await this.page.waitForTimeout(250);
      const target = typeof option === 'number'
        ? items.nth(option)
        : items.filter({ hasText: new RegExp(`^\\s*${escapeRegex(option)}`) }).first();
      const clicked = await target.click({ timeout: 5_000 }).then(() => true, () => false);
      if (!clicked) await this.page.keyboard.press('Escape');
      await this.settle();
      const selected = (await dd.locator('.p-dropdown-label').innerText()).trim();
      if (selected && selected !== 'Select an Option') return selected;
    }
    throw new Error(`Dropdown ${key} did not keep a value for option "${option}"`);
  }

  /** Types a date in the app's dd/mm/yyyy format. */
  async date(key: string, ddmmyyyy: string): Promise<void> {
    const input = this.field(key).locator('p-calendar input');
    await input.click();
    await input.fill('');
    await input.pressSequentially(ddmmyyyy, { delay: 20 });
    await this.page.keyboard.press('Escape');
    await this.settle();
  }

  async radio(key: string, label: string): Promise<void> {
    await this.field(key).getByText(label, { exact: true }).click();
  }

  async checkbox(key: string): Promise<void> {
    await this.field(key).locator('.p-checkbox-box').first().click();
    await this.settle();
  }

  /** Attaches a file to a p-fileupload and confirms it with the field's Upload button. */
  async upload(key: string, filePath: string): Promise<void> {
    const f = this.field(key);
    const uploadButton = f.getByRole('button', { name: 'Upload' });
    await f.locator('input[type=file]').setInputFiles(filePath);
    await expect(uploadButton).toBeEnabled();
    // Upload posts the file to the server cache; the step is rejected if Next is clicked before it lands.
    const cached = this.page.waitForResponse(r => r.url().includes('/cacheFiles'), { timeout: 60_000 });
    await uploadButton.click();
    expect((await cached).ok(), 'file upload (cacheFiles) should succeed').toBeTruthy();
    // An uploaded file gets its own row with a preview button.
    await expect(f.locator('button[icon="p-icon-photo"]').first()).toBeVisible({ timeout: 30_000 });
    await this.settle();
  }

  async value(key: string): Promise<string> {
    const f = this.field(key);
    const dd = f.locator('.p-dropdown-label');
    if (await dd.count()) return (await dd.innerText()).trim();
    return (await f.locator('input').first().inputValue()).trim();
  }

  /** Keys of visible fields Angular currently marks invalid. */
  async invalidFields(): Promise<string[]> {
    return this.page.$$eval('label[for]', labels => labels
      .filter(l => (l as HTMLElement).offsetParent)
      .filter(l => l.parentElement?.parentElement?.querySelector('.ng-invalid'))
      .map(l => l.getAttribute('for')!));
  }

  /** Wizard "Next"; fails with the offending fields if the app rejects the step. */
  async next(stepName: string): Promise<void> {
    await dismissToasts(this.page);
    const next = this.page.getByRole('button', { name: 'Next' });
    const before = await this.visibleFieldKeys();
    // A click can be swallowed while the step is still busy, so re-click until the visible fields change.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0 && !(await next.isVisible())) return; // reached the last (overview) step
      await expect(next).toBeEnabled({ timeout: 60_000 });
      await next.click();
      await this.settle();
      await this.page.waitForTimeout(500);
      await assertNoErrorToast(this.page, `Step "${stepName}" rejected; invalid fields: ${(await this.invalidFields()).join(', ')}`);
      const after = await this.visibleFieldKeys();
      if (process.env.DEBUG_FORM) {
        console.log(`[next] ${new Date().toISOString().slice(11, 19)} ${stepName} attempt=${attempt} changed=${after !== before} fields=${after.slice(0, 80)}`);
      }
      if (after !== before) return;
      await this.page.waitForTimeout(2_000);
    }
    throw new Error(`Step "${stepName}": Next did not advance the wizard`);
  }

  /** Fingerprint of the current step: visible field keys plus which are editable (the overview repeats keys read-only). */
  private async visibleFieldKeys(): Promise<string> {
    return (await this.page.$$eval('label[for]', ls => ls
      .filter(l => (l as HTMLElement).offsetParent)
      .map(l => {
        const editable = l.parentElement?.parentElement?.querySelector('input:not([disabled]):not([readonly]), .p-dropdown:not(.p-disabled)');
        return `${l.getAttribute('for')}${editable ? '' : '(ro)'}`;
      }))).join(',');
  }

  /** Clicks the toolbar "+" that switches a form into create mode (fields are disabled until then). */
  async startNew(): Promise<void> {
    const add = this.page.locator('button:has(.p-icon-add)').first();
    // A click before the form has finished loading is ignored, so confirm fields really became editable.
    // "+" itself turns disabled once the form is in create mode.
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.settle();
      if (await add.isDisabled()) return;
      const before = await this.editableCount();
      await dismissToasts(this.page);
      await add.click();
      await this.settle();
      const enabled = await expect.poll(async () => (await add.isDisabled()) || (await this.editableCount()) > before, { timeout: 10_000 })
        .toBe(true).then(() => true, () => false);
      if (enabled) return;
    }
    throw new Error('Form did not switch to create mode after clicking "+"');
  }

  private async editableCount(): Promise<number> {
    return this.page.$$eval('label[for]', ls => ls
      .filter(l => (l as HTMLElement).offsetParent)
      .filter(l => l.parentElement?.parentElement?.querySelector('input:not([disabled]):not([readonly]):not([type=radio]), .p-dropdown:not(.p-disabled)'))
      .length);
  }

  /**
   * Overview "Save" of a workflow form (Save -> Confirmation -> Accept).
   * Returns the workflow/application number the server assigns.
   */
  async submitWorkflow(comment = 'Submitted by regression suite'): Promise<number> {
    const save = this.page.getByRole('button', { name: 'Save' });
    await expect(save).toBeVisible();
    const created = this.page.waitForResponse(r =>
      /\/mongodb\/formdata/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await dismissToasts(this.page);
    await save.click();
    await this.confirm('Accept', comment);
    const body = await (await created).json();
    const workflowNo = body?.workFlowRefNum?.[0];
    expect(workflowNo, `formdata response: ${JSON.stringify(body)}`).toBeTruthy();
    return workflowNo;
  }

  /** Confirmation dialog shown on Save/Accept/Reject (has an optional comment box). */
  async confirm(button: 'Accept' | 'Cancel' = 'Accept', comment?: string): Promise<void> {
    const dialog = this.page.locator('.p-dialog:visible').filter({ hasText: 'Confirmation' });
    await dialog.waitFor();
    if (comment) await dialog.locator('textarea').fill(comment);
    await dialog.getByRole('button', { name: button }).click();
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
