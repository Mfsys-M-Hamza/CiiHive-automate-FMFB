import { test, expect } from '../src/fixtures';
import { IndividualCustomerPage } from '../src/pages/crm/IndividualCustomerPage';
import { CustomerModificationPage } from '../src/pages/crm/CustomerModificationPage';
import { CustomerBlockPage } from '../src/pages/crm/CustomerBlockPage';
import { WalkingCustomerPage } from '../src/pages/crm/WalkingCustomerPage';
import { UncloseCustomerPage } from '../src/pages/crm/UncloseCustomerPage';
import { newIndividualCustomer, newWalkingCustomer } from '../src/data/customer';
import { runState } from '../src/core/runState';
import { waitForToast } from '../src/core/toast';

const note = (type: string, value: unknown) => test.info().annotations.push({ type, description: String(value) });

/** The chain customer created here is reused by Deposit, TDR, Loan and Transactions. */
const chainCustomer = () => {
  const { customer } = runState.read();
  expect(customer?.customerNo, 'run "CRM › Individual Customer" first').toBeTruthy();
  return customer!;
};

test.describe.serial('CRM › Individual Customer', () => {
  test('create individual customer', async ({ page, menu }) => {
    const customer = newIndividualCustomer();
    const crm = new IndividualCustomerPage(page, menu);

    await crm.open();
    const applicationNo = await crm.create(customer);

    runState.update({
      customer: {
        applicationNo,
        identificationNo: customer.identificationNo,
        fullNameEn: `${customer.first.en} ${customer.father.en} ${customer.last.en}`,
      },
    });
    note('Application No.', applicationNo);
  });

  test('approve individual customer', async ({ page, menu, approvals }) => {
    const { customer } = runState.read();
    expect(customer?.applicationNo, 'run "create individual customer" first').toBeTruthy();

    await approvals.open(menu.url('CRM > Approval > Individual Customer'));
    await expect(await approvals.row(customer!.applicationNo)).toContainText('Pending');

    const result = await approvals.approve(customer!.applicationNo);
    const customerNo = (result.CMP_CUSTCODE as string[] | undefined)?.[0];
    expect(customerNo, `approval response: ${JSON.stringify(result)}`).toMatch(/^I\d+$/);
    await waitForToast(page, new RegExp(`Customer No: ${customerNo}`));

    runState.update({ customer: { ...customer!, customerNo } });
    note('Customer No.', customerNo);
  });

  test('modify individual customer', async ({ page, menu }) => {
    const customer = chainCustomer();
    const modification = new CustomerModificationPage(page, menu);
    const grandfather = { ar: 'حسن', en: `Hasan${Date.now().toString().slice(-4)}` };

    await modification.open();
    await modification.fetch(customer.customerNo!);
    expect(await modification.value('CIT_IDENVALUE_2')).toBe(customer.identificationNo);
    await modification.setGrandfatherName(grandfather.ar, grandfather.en);
    await modification.save();

    // Reload from the server to prove the change was persisted.
    await modification.open();
    await modification.fetch(customer.customerNo!);
    expect(await modification.value('KYC_GF_NAME_ENG')).toBe(grandfather.en);
  });
});

test.describe.serial('CRM › Block / UnBlock customer', () => {
  test('block customer', async ({ page, menu }) => {
    const customer = chainCustomer();
    const block = new CustomerBlockPage(page, menu, 'Block');
    await block.open();
    const blockWorkflowNo = await block.submitForCustomer(customer.customerNo!);
    runState.update({ block: { blockWorkflowNo } });
    note('Block workflow', blockWorkflowNo);
  });

  test('approve block', async ({ menu, approvals }) => {
    const { block } = runState.read();
    await approvals.open(menu.url('CRM > Approval > Block > Block'));
    const result = await approvals.approve(block!.blockWorkflowNo!);
    const blockId = (result.BLOCK_ID as string[] | undefined)?.[0];
    expect(blockId, `approval response: ${JSON.stringify(result)}`).toBeTruthy();
    runState.update({ block: { ...block, blockId } });
    note('Block ID', blockId);
  });

  // Always unblock, so the chain customer can be used by Deposit / TDR / Loan afterwards.
  test('unblock customer', async ({ page, menu }) => {
    const customer = chainCustomer();
    const unblock = new CustomerBlockPage(page, menu, 'UnBlock');
    await unblock.open();
    const unblockWorkflowNo = await unblock.submitForCustomer(customer.customerNo!);
    runState.update({ block: { ...runState.read().block, unblockWorkflowNo } });
    note('UnBlock workflow', unblockWorkflowNo);
  });

  test('approve unblock', async ({ menu, approvals }) => {
    const { block } = runState.read();
    await approvals.open(menu.url('CRM > Approval > Block > UnBlock'));
    const result = await approvals.approve(block!.unblockWorkflowNo!);
    const unblockId = (result.UNBLOCK_ID as string[] | undefined)?.[0];
    expect(unblockId, `approval response: ${JSON.stringify(result)}`).toBeTruthy();
    runState.update({ block: { ...block, unblockId } });
    note('UnBlock ID', unblockId);
  });
});

test.describe.serial('CRM › Walking Customer', () => {
  test('create walking customer', async ({ page, menu }) => {
    const walking = newWalkingCustomer();
    const serialNo = await new WalkingCustomerPage(page, menu).create(walking);
    runState.update({ walkingCustomer: { serialNo, identificationNo: walking.identificationNo } });
    note('Serial No.', serialNo);
  });

  test('edit walking customer', async ({ page, menu }) => {
    // Known app issue (2026-10-29): the Edit screen lists a fixed set of 21 walking customers and never shows
    // newly created ones, so a new walking customer cannot be edited. Remove test.fail once fixed.
    test.fail(true, 'Edit Walking Customer list does not include newly created walking customers');
    const { walkingCustomer } = runState.read();
    const walking = new WalkingCustomerPage(page, menu);
    await walking.openEdit();
    await walking.selectFromList(walkingCustomer!.identificationNo);
    await walking.setMotherName('سعاد');
    await walking.saveEdit();
  });
});

test.describe.serial('CRM › Close / Unclose customer application', () => {
  test('create a customer and close its application', async ({ page, menu, approvals }) => {
    const customer = newIndividualCustomer();
    const crm = new IndividualCustomerPage(page, menu);
    await crm.open();
    const applicationNo = await crm.create(customer);
    runState.update({ closedCustomer: { applicationNo, identificationNo: customer.identificationNo } });

    await approvals.open(menu.url('CRM > Approval > Individual Customer'));
    await approvals.close(applicationNo);
    note('Closed application', applicationNo);
  });

  test('unclose customer', async ({ page, menu }) => {
    const { closedCustomer } = runState.read();
    const unclose = new UncloseCustomerPage(page, menu);

    await unclose.open();
    expect((await unclose.lookup(closedCustomer!.identificationNo)).status).toBe('Closed');
    await unclose.unclose();
  });

  test('reopened application is pending approval again', async ({ page, menu, approvals }) => {
    const { closedCustomer } = runState.read();

    // Fresh session (the app only checks an ID once per session): the customer is no longer closed.
    const unclose = new UncloseCustomerPage(page, menu);
    await unclose.open();
    expect((await unclose.lookup(closedCustomer!.identificationNo)).error).toMatch(/is not closed/);

    await approvals.open(menu.url('CRM > Approval > Individual Customer'));
    await expect(await approvals.row(closedCustomer!.applicationNo)).toContainText('Pending');
    // Approve it so reopened applications don't pile up in the queue run after run.
    const result = await approvals.approve(closedCustomer!.applicationNo);
    expect((result.CMP_CUSTCODE as string[] | undefined)?.[0]).toMatch(/^I\d+$/);
  });
});
