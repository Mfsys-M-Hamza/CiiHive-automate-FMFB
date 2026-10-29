import { test, expect } from '../src/fixtures';
import { TellerBatchPage } from '../src/pages/batch/TellerBatchPage';
import { CashDepositPage } from '../src/pages/transactions/CashDepositPage';
import { TransactionAuthorizationPage } from '../src/pages/authorization/TransactionAuthorizationPage';
import { LienMarkingPage } from '../src/pages/deposit/DepositAccountScreens';
import { runState } from '../src/core/runState';

const note = (type: string, value: unknown) => test.info().annotations.push({ type, description: String(value) });

const OPENING_BALANCE = 1_000_000;
const DEPOSIT_AMOUNT = 50_000;
const LIEN_AMOUNT = 10_000;

/** The chain customer's approved deposit account from 02-deposit. */
const depositAccount = () => {
  const { deposit } = runState.read();
  expect(deposit?.accountNo, 'run the Deposit spec first (needs an approved deposit account)').toBeTruthy();
  return deposit!.accountNo!;
};

test.describe.serial('Teller Batch › Open batch', () => {
  test('open teller batch', async ({ page, menu, approvals }) => {
    const batch = new TellerBatchPage(page, menu);
    const leftover = await batch.balance();
    if (leftover !== null) {
      // Only one open batch per user and currency. Closing someone's batch posts its cash back to the vault,
      // so it is opt-in: CLOSE_OPEN_BATCH=1 closes a leftover batch so Open Batch can be tested.
      test.skip(!process.env.CLOSE_OPEN_BATCH,
        `A SYP batch is already open for this user (cash ${leftover}); it is reused. Set CLOSE_OPEN_BATCH=1 to close it and test Open Batch.`);
      const closeNo = await batch.submit('Close Batch', leftover, 'Closing leftover batch (regression suite)');
      await approvals.open(menu.url('Teller Batch > Approval > Close Batch'));
      await approvals.approve(closeNo);
      expect(await batch.balance(), 'leftover batch should be closed').toBeNull();
      note('Closed leftover batch', `workflow ${closeNo}, cash ${leftover}`);
    }
    const openWorkflowNo = await batch.submit('Open Batch', OPENING_BALANCE, 'Opened by regression suite');
    runState.update({ batch: { openWorkflowNo, openedByRun: true } });
    note('Open batch workflow', openWorkflowNo);
  });

  test('approve open batch', async ({ page, menu, approvals }) => {
    const { batch: state } = runState.read();
    test.skip(!state?.openedByRun, 'No batch was opened by this run');
    await approvals.open(menu.url('Teller Batch > Approval > Open Batch'));
    const result = await approvals.approve(state!.openWorkflowNo!);
    note('Approval result', JSON.stringify(result));
    expect(await new TellerBatchPage(page, menu).balance(), 'batch cash after opening').toBe(OPENING_BALANCE);
  });
});

test.describe.serial('Cash Transaction › Deposit', () => {
  test('cash deposit into the chain account', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const { balance: balanceBefore } = await new LienMarkingPage(page, menu).open(accountNo);
    const transactionNo = await new CashDepositPage(page, menu).deposit(accountNo, DEPOSIT_AMOUNT, 'Cash deposit by regression suite');
    runState.update({ cashDeposit: { transactionNo, amount: DEPOSIT_AMOUNT, balanceBefore } });
    note('Transaction', transactionNo);
  });

  test('authorize cash deposit', async ({ page, menu }) => {
    const { cashDeposit } = runState.read();
    const auth = new TransactionAuthorizationPage(page, menu, 'Deposit');
    await auth.authorize('Deposit', cashDeposit!.transactionNo);

    const { balance } = await new LienMarkingPage(page, menu).open(depositAccount());
    expect(balance, 'balance after the authorized deposit').toBe(cashDeposit!.balanceBefore + cashDeposit!.amount);
  });
});

test.describe.serial('Deposit › Lien', () => {
  test('mark lien on the funded account', async ({ page, menu }) => {
    const accountNo = depositAccount();
    const lien = new LienMarkingPage(page, menu);
    const before = await lien.open(accountNo);
    expect(before.balance - before.blocked, 'needs unblocked funds from the cash deposit').toBeGreaterThanOrEqual(LIEN_AMOUNT);
    await lien.setBlockedAmount(before.blocked + LIEN_AMOUNT);

    const after = await lien.open(accountNo);
    expect(after.blocked).toBe(before.blocked + LIEN_AMOUNT);
    expect(after.balance, 'a lien blocks funds but does not change the balance').toBe(before.balance);
  });
});
