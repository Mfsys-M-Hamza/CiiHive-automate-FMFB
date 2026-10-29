import { test as base } from '@playwright/test';
import { login } from './core/session';
import { Menu } from './core/menu';
import { DynamicForm } from './core/form';
import { ApprovalQueue } from './core/approval';

type Fixtures = {
  /** Logs in before the test (JWT expires in ~15 min, so every test gets a fresh session). */
  menu: Menu;
  form: DynamicForm;
  approvals: ApprovalQueue;
};

export const test = base.extend<Fixtures>({
  menu: async ({ page }, use) => { await use(await login(page)); },
  form: async ({ page }, use) => { await use(new DynamicForm(page)); },
  approvals: async ({ page }, use) => { await use(new ApprovalQueue(page)); },
});

export { expect } from '@playwright/test';
