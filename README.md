# CIIHive Regression Suite

End-to-end UI regression for the CIIHive core banking app (Playwright + TypeScript).

The suite is one business chain. Each module works on the records created by the one before it:

1. **CRM** ✅
   - Individual customer: create, approve, modify (change is reloaded to confirm it was saved)
   - Block, approve, then UnBlock and approve (always ends unblocked so later modules can use the customer)
   - Walking customer: create; edit is marked as a known app issue (see below)
   - Close a second customer's application, unclose it, then approve it from the queue again
   - Freeze / Unfreeze needs a deposit or loan account, so it will be added with the Deposit module
2. Deposit: open an account for that customer, then approve it
3. TDR: register a TDR for the customer and deposit, then approve it
4. Loan: create, approve and authorize a loan
5. Teller Batch: open + authorize, replenish + approve, cash to vault + approve
6. Transactions: cash deposit and cash withdrawal on the deposit account

Every run generates fresh test data (unique ID number, names, mobile), so you can run it as often as you like.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in CIIHIVE_PASSWORD
```

## Run

```bash
npm test                 # whole chain, headless
npm run test:headed      # watch it in a browser
npm run test:crm         # CRM module only
npm run report           # open the HTML report of the last run
```

Records created by the last run (application no., customer no., …) are written to `run-state/chain.json`.
Later modules read them from there, so a single module can be re-run against the last chain.

Failures keep a screenshot, video and trace under `test-results/`. Open a trace with `npx playwright show-trace <trace.zip>`.
Set `DEBUG_FORM=1` to log every wizard step transition.

## Known app issues (tests marked `test.fail`)

- **Edit Walking Customer** lists a fixed set of 21 old walking customers and never shows new ones, so a newly created walking customer can't be edited. The test is expected to fail. When the app is fixed it will turn red; remove the `test.fail` line then.

## Layout

| Path | Purpose |
|---|---|
| `src/core/session.ts` | Login; captures the user's menu |
| `src/core/menu.ts` | Builds screen URLs from the menu (moduleId/formId come from the app, not hard-coded) |
| `src/core/form.ts` | Driver for the app's dynamic forms; fields are located by backend key via `label[for=KEY]` |
| `src/core/approval.ts` | Workflow approval inbox (shared by all modules) |
| `src/core/runState.ts` | Passes created records between modules |
| `src/pages/` | One page object per screen |
| `src/data/` | Test data generators |
| `tests/` | Specs, numbered in chain order |
