import { Page, expect } from '@playwright/test';
import { DynamicForm } from '../core/form';
import { Menu } from '../core/menu';

export interface InquiryResult {
  inquiryColumns: string[];
  inquiryData: Record<string, unknown>[];
}

/**
 * Report-style inquiry screens (/home/report): "+", fill criteria, "Generate Inquiry".
 * The result comes back as JSON from POST /report/generate/inquiry, which is what tests assert on.
 */
export class InquiryPage {
  readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(path: string): Promise<void> {
    await this.page.goto(this.menu.url(path));
    await this.form.settle();
    await this.form.startNew();
  }

  async generate(): Promise<InquiryResult> {
    const generated = this.page.waitForResponse(r => r.url().includes('/report/generate/inquiry'), { timeout: 120_000 });
    await this.page.getByRole('button', { name: 'Generate Inquiry' }).click();
    const response = await generated;
    expect(response.ok(), `inquiry -> HTTP ${response.status()}`).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.inquiryData), `inquiry response: ${JSON.stringify(body).slice(0, 300)}`).toBeTruthy();
    await this.form.settle();
    return body;
  }
}
