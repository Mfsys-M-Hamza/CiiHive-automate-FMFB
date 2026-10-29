const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

// Arabic and English spellings must stay paired: the app shows both on the customer card.
const FIRST = [['احمد', 'Ahmad'], ['خالد', 'Khaled'], ['سامر', 'Samer'], ['يوسف', 'Yousef'], ['عمر', 'Omar']] as const;
const FATHER = [['محمد', 'Mohammad'], ['علي', 'Ali'], ['حسن', 'Hasan'], ['ابراهيم', 'Ibrahim']] as const;
const LAST = [['الحلبي', 'Alhalabi'], ['الشامي', 'Alshami'], ['العلي', 'Alali'], ['النجار', 'Alnajjar']] as const;
const MOTHER = [['فاطمة', 'Fatima'], ['مريم', 'Mariam'], ['سارة', 'Sara']] as const;

export interface IndividualCustomer {
  identificationNo: string;
  first: { ar: string; en: string };
  father: { ar: string; en: string };
  last: { ar: string; en: string };
  mother: { ar: string; en: string };
  birthPlace: string;
  dateOfBirth: string;
  mobile: string;
  idIssueDate: string;
  idIssuePlace: string;
  registerPlace: string;
  registerNumber: string;
  cardNumber: string;
  position: string;
  monthlyIncome: number;
}

const pair = (p: readonly [string, string]) => ({ ar: p[0], en: p[1] });

export interface WalkingCustomer {
  identificationNo: string;
  first: string;
  father: string;
  last: string;
  mother: string;
  birthPlace: string;
  dateOfBirth: string;
}

/** A walk-in (non-account) customer. The app requires an 11-digit identification number. */
export function newWalkingCustomer(): WalkingCustomer {
  return {
    identificationNo: Date.now().toString().slice(-11).padStart(11, '8'),
    first: pick(FIRST)[0],
    father: pick(FATHER)[0],
    last: pick(LAST)[0],
    mother: pick(MOTHER)[0],
    birthPlace: 'حمص',
    dateOfBirth: '20/02/1988',
  };
}

/** A unique male, single, Syrian individual customer. Identification No. is unique per run. */
export function newIndividualCustomer(): IndividualCustomer {
  const stamp = Date.now().toString();
  return {
    identificationNo: stamp.slice(-11).padStart(11, '9'),
    first: pair(pick(FIRST)),
    father: pair(pick(FATHER)),
    last: pair(pick(LAST)),
    mother: pair(pick(MOTHER)),
    birthPlace: 'دمشق',
    dateOfBirth: '15/05/1990',
    mobile: `09${stamp.slice(-8)}`,
    idIssueDate: '01/01/2015',
    idIssuePlace: 'Damascus',
    registerPlace: 'Damascus',
    registerNumber: stamp.slice(-5),
    cardNumber: `A${stamp.slice(-7)}`,
    position: 'Sales Officer',
    monthlyIncome: 500000,
  };
}
