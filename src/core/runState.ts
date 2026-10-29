import fs from 'fs';
import path from 'path';

/**
 * Records produced along the regression chain. Each module's spec reads what earlier
 * modules created (the deposit is opened for the CRM customer, the TDR for both, …).
 * Persisted to disk so a single spec can be re-run against the last chain.
 */
export interface RunState {
  /** The chain's main customer; every later module works on this one. */
  customer?: {
    applicationNo: number;
    customerNo?: string;
    identificationNo: string;
    fullNameEn: string;
  };
  block?: { blockWorkflowNo?: number; blockId?: string; unblockWorkflowNo?: number; unblockId?: string };
  walkingCustomer?: { serialNo: number; identificationNo: string };
  /** A second customer whose application is closed and then reopened (Unclose Customer). */
  closedCustomer?: { applicationNo: number; identificationNo: string };
  /** The chain customer's individual deposit account; used by TDR, Loan and Transactions. */
  deposit?: { applicationNo: number; accountNo?: string };
  freeze?: { freezeWorkflowNo?: number; freezeId?: string; unfreezeWorkflowNo?: number; unfreezeId?: string };
  digitalDeposit?: { applicationNo: number };
}

const FILE = path.resolve(__dirname, '../../run-state/chain.json');

export const runState = {
  read(): RunState {
    return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  },
  update(patch: Partial<RunState>): RunState {
    const next = { ...this.read(), ...patch };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
    return next;
  },
};
