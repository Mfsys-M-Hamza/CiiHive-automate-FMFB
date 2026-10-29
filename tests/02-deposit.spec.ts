import { test, expect } from '../src/fixtures';
import { OpenDepositAccountPage } from '../src/pages/deposit/OpenDepositAccountPage';
import { ChargeExemptionPage, DepositAccountModificationPage, DepositAccountRatePage, UnmarkDormantPage } from '../src/pages/deposit/DepositAccountScreens';
import { AccountFreezePage } from '../src/pages/crm/AccountFreezePage';
import { InquiryPage } from '../src/pages/InquiryPage';
import { runState } from '../src/core/runState';
import { waitForToast } from '../src/core/toast';

const note = (type: string, value: unknown) => test.info().annotations.push({ type, description: String(value) });

/** The approved chain customer from 01-crm. */
const chainCustomer = () => {
  const { customer } = runState.read();
  expect(customer?.customerNo, 'run the CRM spec first (needs an approved customer)').toBeTruthy();
  return customer!;
};

/** The chain customer's approved deposit account. */
const depositAccount = () => {
  const { deposit } = runState.read();
  expect(deposit?.accountNo, 'run "Deposit › Individual account" first').toBeTruthy();
  return deposit!.accountNo!;
};

test.describe.serial('Deposit › Individual account', () => {
  test('open individual deposit account', async ({ page, menu }) => {
    const customer = chainCustomer();
    const dep = new OpenDepositAccountPage(page, menu);
    await dep.open('Individual');
    const applicationNo = await dep.openIndividual(customer.customerNo!, customer.identificationNo);
    runState.update({ deposit: { applicationNo } });
    note('Application No.', applicationNo);
  });

  test('approve individual deposit account', async ({ page, menu, approvals }) => {
    const { deposit } = runState.read();
    await approvals.open(menu.url('Deposit > Approval > Individual Account'));
    await expect(await approvals.row(deposit!.applicationNo)).toContainText(chainCustomer().customerNo!);
    const result = await approvals.approve(deposit!.applicationNo);
    const accountNo = (result.MBM_BKMSNUMBER as string[] | undefined)?.[0];
    expect(accountNo, `approval response: ${JSON.stringify(result)}`).toMatch(/^\d{13}$/);
    await waitForToast(page, new RegExp(`Account No\\.: ${accountNo}`));
    runState.update({ deposit: { ...deposit!, accountNo } });
    note('Account No.', accountNo);
  });

  test('second account of the same product is rejected', async ({ page, menu }) => {
    // Product rule: one active Saving Account per customer.
    const customer = chainCustomer();
    depositAccount();
    const dep = new OpenDepositAccountPage(page, menu);
    await dep.open('Individual');
    await expect(dep.openIndividual(customer.customerNo!, customer.identificationNo))
      .rejects.toThrow(new RegExp(`Customer ${customer.customerNo} active parallel account limit exceeds`));
  });

  test('modify deposit account title', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const title = `${chainCustomer().fullNameEn} ${Date.now().toString().slice(-4)}`;
    const modification = new DepositAccountModificationPage(page, menu);
    await modification.fetch(accountNo);
    expect(await modification.value('CMP_CUSTCODE')).toBe(chainCustomer().customerNo);
    await modification.setTitle(title);
    await modification.save();

    await modification.fetch(accountNo);
    expect(await modification.value('MBM_BKMSTITLE')).toBe(title);
  });

  test('exempt account from a charge', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const charge = 'Reconstruction Tax';
    const exemption = new ChargeExemptionPage(page, menu);
    await exemption.open(accountNo);
    expect(await exemption.isExempted(charge), 'a new account starts without exemptions').toBe(false);
    await exemption.setExempted(charge, true);
    await exemption.save();

    await exemption.open(accountNo);
    expect(await exemption.isExempted(charge)).toBe(true);
  });

  test('set account-level charge rate', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const charge = 'Withholding Tax on Paid Interest';
    const rates = new DepositAccountRatePage(page, menu);
    await rates.open(accountNo);
    await rates.setAccountRate(charge, 5);
    await rates.save();

    await rates.open(accountNo);
    expect(await rates.accountRate(charge)).toBe(5);
  });

  test('unmark dormant is rejected for an active account', async ({ page, menu }) => {
    // A brand-new account is never dormant, so this checks the validation path.
    const accountNo = depositAccount();
    const dormant = new UnmarkDormantPage(page, menu);
    await dormant.open(accountNo);
    expect(await dormant.status()).toBe('NORM');
    const error = await dormant.unmark('Upon Customer Request', 'Regression suite: active account');
    expect(error).toMatch(new RegExp(`Deposit account ${accountNo} .* is already undormant`));
  });
});

test.describe.serial('Deposit › Freeze / Unfreeze account', () => {
  test('freeze deposit account', async ({ page, menu }) => {
    const freeze = new AccountFreezePage(page, menu, 'Freeze Accounts');
    await freeze.open();
    const freezeWorkflowNo = await freeze.submitForDepositAccount(depositAccount());
    runState.update({ freeze: { freezeWorkflowNo } });
    note('Freeze workflow', freezeWorkflowNo);
  });

  test('approve freeze', async ({ menu, approvals }) => {
    const { freeze } = runState.read();
    await approvals.open(menu.url('CRM > Approval > Freeze > Freeze'));
    const result = await approvals.approve(freeze!.freezeWorkflowNo!);
    const freezeId = (result.FREEZE_ID as string[] | undefined)?.[0];
    expect(freezeId, `approval response: ${JSON.stringify(result)}`).toBeTruthy();
    runState.update({ freeze: { ...freeze, freezeId } });
    note('Freeze No.', freezeId);
  });

  // Always unfreeze, so later modules (TDR, transactions) can use the account.
  test('unfreeze deposit account', async ({ page, menu }) => {
    const unfreeze = new AccountFreezePage(page, menu, 'Unfreeze Account');
    await unfreeze.open();
    const unfreezeWorkflowNo = await unfreeze.submitForDepositAccount(depositAccount());
    runState.update({ freeze: { ...runState.read().freeze, unfreezeWorkflowNo } });
    note('Unfreeze workflow', unfreezeWorkflowNo);
  });

  test('approve unfreeze', async ({ menu, approvals }) => {
    const { freeze } = runState.read();
    await approvals.open(menu.url('CRM > Approval > Freeze > UnFreeze'));
    const result = await approvals.approve(freeze!.unfreezeWorkflowNo!);
    const unfreezeId = (result.UNFREEZE_ID as string[] | undefined)?.[0];
    expect(unfreezeId, `approval response: ${JSON.stringify(result)}`).toBeTruthy();
    runState.update({ freeze: { ...freeze, unfreezeId } });
    note('Unfreeze ID', unfreezeId);
  });
});

test.describe.serial('Deposit › Digital account', () => {
  test('open digital deposit account', async ({ page, menu }) => {
    const customer = chainCustomer();
    const dep = new OpenDepositAccountPage(page, menu);
    await dep.open('Digital');
    const applicationNo = await dep.openDigital(customer.customerNo!, customer.identificationNo, `${customer.fullNameEn} Digital`);
    runState.update({ digitalDeposit: { applicationNo } });
    note('Application No.', applicationNo);
  });

  test('approve digital deposit account', async ({ menu, approvals }) => {
    // Known app issue (2026-10-29): saved digital applications never reach Deposit Workflow NR > Digital
    // Authorization (the queue stays empty). Remove test.fail once fixed.
    test.fail(true, 'Digital account applications do not appear in the Digital Authorization queue');
    const { digitalDeposit } = runState.read();
    await approvals.open(menu.url('Deposit > Deposit Workflow NR > Digital Authorization'));
    const result = await approvals.approve(digitalDeposit!.applicationNo);
    expect((result.MBM_BKMSNUMBER as string[] | undefined)?.[0]).toMatch(/^\d{13}$/);
  });
});

test.describe('Deposit › Inquiries', () => {
  test('account statement shows the new account', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const inquiry = new InquiryPage(page, menu);
    await inquiry.open('Deposit > Inquiry > Inquiry > Deposit Acc. Statement');
    const loaded = page.waitForResponse(r => r.url().includes('controlSelect') || r.url().includes('/deposit/'), { timeout: 30_000 }).catch(() => null);
    await inquiry.form.text('MBM_BKMSNUMBER', accountNo);
    await loaded;
    await inquiry.form.settle();
    await expect(inquiry.form.field('MBM_BKMSTITLE').locator('input')).not.toHaveValue('');
    const result = await inquiry.generate();
    expect(result.inquiryColumns).toEqual(expect.arrayContaining(['deposit', 'withdrawl', 'mbm_bkmsbalance']));
    expect(JSON.stringify(result.inquiryData)).toContain('Opening Balance');
  });

  test('all deposit inquiry lists the new account', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const inquiry = new InquiryPage(page, menu);
    await inquiry.open('Deposit > Inquiry > Inquiry > All Deposit Inquiry');
    await inquiry.form.multiSelect('PLC_LOCACODE', 'Head Office');
    await inquiry.form.radio('STATUS', 'Active');
    const result = await inquiry.generate();
    expect(JSON.stringify(result.inquiryData), `account ${accountNo} in All Deposit Inquiry`).toContain(accountNo);
  });
});
