import { Page, expect } from '@playwright/test';
import { DynamicForm } from './form';
import { dismissToasts, waitForToast } from './toast';

/**
 * Workflow approval inbox (/home/approval?workFlowId=…), shared by CRM, Deposit, TDR, Loan and Teller Batch.
 * Lists pending applications; "View" opens the record read-only in the authorization form, whose
 * overview step offers Accept / Reject / Close.
 */
export class ApprovalQueue {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page) {
    this.form = new DynamicForm(page);
  }

  async open(url: string): Promise<void> {
    await this.page.goto(url);
    await this.form.settle();
    await this.page.locator('table thead th').first().waitFor();
  }

  /**
   * Finds the queue row whose "Application No." cell equals `applicationNo` exactly
   * (workflow numbers can be short, e.g. "4", so a plain text match would hit other rows).
   */
  async row(applicationNo: string | number) {
    const headers = (await this.page.locator('table thead tr').first().locator('th').allInnerTexts()).map(h => h.trim());
    const col = headers.findIndex(h => /Application No/i.test(h));
    expect(col, `"Application No." column in ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
    const cell = this.page.locator(`td:nth-child(${col + 1})`).filter({ hasText: new RegExp(`^\\s*${applicationNo}\\s*$`) });
    const row = this.page.locator('table tbody tr').filter({ has: cell });
    if (!(await row.count())) {
      // Not on the first page: use the column's filter box.
      await this.page.locator('table thead input').nth(col).fill(String(applicationNo));
      await this.form.settle();
    }
    await expect(row, `Application ${applicationNo} should be pending in the approval queue`).toHaveCount(1);
    return row;
  }

  /**
   * Opens the application, pages through its wizard to the overview and clicks Accept.
   * Returns the server's approval result (e.g. {"CMP_CUSTCODE":["I00032283"]} or {"BLOCK_ID":["00003"]}).
   */
  async approve(applicationNo: string | number, comment = 'Approved by regression suite'): Promise<Record<string, unknown>> {
    await this.openOverview(applicationNo, 'Accept');
    const approved = this.page.waitForResponse(r =>
      /\/mongodb\/formdata/.test(r.url()) && r.request().method() === 'PATCH', { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Accept', exact: true }).click();
    await this.confirmIfAsked(comment);
    return (await approved).json();
  }

  /** Closes (cancels) the application from its overview. A closed customer can be reopened via "Unclose Customer". */
  async close(applicationNo: string | number, comment = 'Closed by regression suite'): Promise<void> {
    await this.openOverview(applicationNo, 'Close');
    await this.page.getByRole('button', { name: 'Close', exact: true }).click();
    await this.confirmIfAsked(comment);
    await waitForToast(this.page, new RegExp(`Workflow with ID ${applicationNo} Closed Successfully`));
  }

  private async openOverview(applicationNo: string | number, action: 'Accept' | 'Close'): Promise<void> {
    // Stepping through before the record has loaded makes the app reject step 1 with "Invalid Input".
    const loaded = this.page.waitForResponse(r => /\/mongodb\/getformdata/.test(r.url()), { timeout: 60_000 });
    await (await this.row(applicationNo)).getByRole('button', { name: 'View' }).click();
    await loaded;
    await this.form.settle();
    await this.page.waitForTimeout(1_000);
    const target = this.page.getByRole('button', { name: action, exact: true });
    const next = this.page.getByRole('button', { name: 'Next' });
    for (let i = 0; i < 15; i++) {
      // The overview renders empty for a few seconds before its action buttons appear.
      await expect(target.or(next).first()).toBeVisible({ timeout: 60_000 });
      if (await target.isVisible()) break;
      await this.form.next(`approval step ${i + 1}`);
    }
    await dismissToasts(this.page);
  }

  /** Some workflows ask for a confirmation comment, others submit straight away. */
  private async confirmIfAsked(comment: string): Promise<void> {
    const dialog = this.page.locator('.p-dialog:visible').filter({ hasText: 'Confirmation' });
    if (await dialog.waitFor({ timeout: 2_000 }).then(() => true, () => false)) {
      await this.form.confirm('Accept', comment);
    }
  }
}
