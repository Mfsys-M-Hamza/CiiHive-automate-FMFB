import { Page, expect } from '@playwright/test';
import { Menu } from './menu';

export const credentials = {
  clientId: process.env.CIIHIVE_CLIENT_ID ?? '0005',
  username: process.env.CIIHIVE_USERNAME ?? '01',
  password: process.env.CIIHIVE_PASSWORD ?? '',
};

/** Logs in and returns the user's menu. The JWT lives ~15 min, so log in per test. */
export async function login(page: Page): Promise<Menu> {
  if (!credentials.password) throw new Error('CIIHIVE_PASSWORD is not set (see .env.example)');
  await page.goto('/#/login', { waitUntil: 'networkidle' });
  await page.locator('#clientid').fill(credentials.clientId);
  await page.locator('#username').fill(credentials.username);
  await page.locator('#password').fill(credentials.password);
  const menuResponse = page.waitForResponse(r => r.url().includes('/security/menu/appmenu') && r.ok());
  await page.getByRole('button', { name: 'Login' }).click();
  const menu = new Menu(await (await menuResponse).json());
  await expect(page).toHaveURL(/#\/home\//);
  await page.waitForLoadState('networkidle');
  return menu;
}
