import { Page, expect } from '@playwright/test';
import path from 'path';
import { DynamicForm } from '../../core/form';
import { Menu } from '../../core/menu';
import { IndividualCustomer } from '../../data/customer';

const DOCUMENT = path.resolve(__dirname, '../../../fixtures/files/test-document.png');

/** CRM > Operations > Registration > Individual Customer (form BN_WF_CP_REGISTRATION, 9-step wizard). */
export class IndividualCustomerPage {
  private readonly form: DynamicForm;

  constructor(private readonly page: Page, private readonly menu: Menu) {
    this.form = new DynamicForm(page);
  }

  async open(): Promise<void> {
    await this.page.goto(this.menu.url('CRM > Operations > Registration > Individual Customer'));
    await this.form.settle();
    await this.form.startNew();
    // Fields stay disabled until the form is in create mode.
    await expect(this.form.field('CMP_NATURE').locator('.p-dropdown')).not.toHaveClass(/p-disabled/);
  }

  /** Step 1 – Re-Registration (personal information). */
  async fillRegistration(c: IndividualCustomer): Promise<void> {
    const f = this.form;
    await f.dropdown('CMP_NATURE', 'Individual');
    await f.dropdown('PIT_IDENCODE_2', 0); // National ID card (بطاقة شخصية)
    await f.text('CIT_IDENVALUE_2', c.identificationNo);
    const texts: [string, string][] = [
      ['CMP_FIRSTNAME', c.first.ar],
      ['CMP_FATHERNAME', c.father.ar],
      ['CMP_LASTNAME', c.last.ar],
      ['CMP_MOTHERNAME', c.mother.ar],
      ['CMP_BPLACE', c.birthPlace],
      ['CMP_FIRSTNAME_ENGLISH', c.first.en],
      ['CMP_FATHERNAME_ENG', c.father.en],
      ['CMP_LASTNAME_EN', c.last.en],
      ['CMP_MOTHERNAME_ENG', c.mother.en],
      ['CMP_CUSTPRTGNAME', c.father.en],
    ];
    for (const [key, value] of texts) await f.text(key, value);
    await f.date('CMP_CUSTDATEBIRTH', c.dateOfBirth);
    await f.dropdown('CMP_CUSTSEX', 'Male');
    await f.dropdown('CMP_MARITALSTATUS', 'Single');
    await f.dropdown('CMP_NATIONALITY', 'Syrian');
    await f.dropdown('CMP_BIRTHPLACE', 'Syria');
    await f.radio('CMP_EMPLOYEE', 'No');
    // Salutation options depend on gender + marital status, so it goes last.
    await f.dropdown('CMP_SALUTATION', 'Mr.');
    // The duplicate-ID lookup fired by Identification No. can land late and wipe name fields; refill any it reset.
    // (Customer Parentage Name is hidden once marital status is Single, so only visible fields are checked.)
    for (const [key, value] of texts) {
      if (!(await f.field(key).isVisible())) continue;
      if ((await f.value(key)) !== value) await f.text(key, value);
    }
    await expect.soft(this.page.locator('label[for=CMP_FULLNAME_EN] >> xpath=../..').locator('input'))
      .toHaveValue(`${c.first.en} ${c.father.en} ${c.last.en}`);
    await f.next('Re-Registration');
  }

  /** Step 2 – Address (cascading Country > Province > City > District). */
  async fillAddress(c: IndividualCustomer): Promise<void> {
    const f = this.form;
    await f.dropdown('PAT_ADRSCODE', 'Residential');
    await f.dropdown('PCO_CTRYCODE', 'Syria');
    await f.dropdown('PPV_PROVCODE', 0);
    await f.dropdown('PCT_CITYCODE', 0);
    await f.dropdown('PDS_DISTCODE', 0);
    await f.text('PST_STREET', 'Main Street');
    await f.text('PAD_ADRSMOBPHONE', c.mobile);
    await f.checkbox('PAD_ADRSCORRESPONDENCE');
    await f.next('Address');
  }

  /** Step 3 – Identifier (ID type/number carried over from step 1). */
  async fillIdentifier(c: IndividualCustomer): Promise<void> {
    const f = this.form;
    expect(await f.value('CIT_IDENVALUE')).toBe(c.identificationNo);
    await f.date('CIT_IDENISSUEDATE', c.idIssueDate);
    await f.text('ISSUER_AUTHORITY', c.idIssuePlace);
    await f.text('CIT_ID_ISSUANCE', c.registerPlace);
    await f.text('CIT_ID_ISSUANCE_2', c.registerNumber);
    await f.text('CARD_NUMBER', c.cardNumber);
    await f.checkbox('PIT_PRIMARYIDENCODE');
    await f.next('Identifier');
  }

  /** Step 4 – Documents (one document with an uploaded file is mandatory). */
  async fillDocuments(): Promise<void> {
    const f = this.form;
    await f.dropdown('PDT_DOTYCODE', 'Customer Signatory');
    await f.date('PDT_DOTYISSUEDATE', '01/01/2024');
    await f.upload('CDO_DCOUMENTFILE', DOCUMENT);
    await f.next('Documents');
  }

  /** Step 5 – KYC (dates are defaulted from the business date). */
  async fillKyc(): Promise<void> {
    const f = this.form;
    await f.dropdown('CMP_RESSTATUS', 'Resident');
    await f.dropdown('CMP_ECOMONOMICRIGHT', 'Owner');
    await f.dropdown('KYC_BUSINESS_PURPOSE', 'خدمات مصرفية تقليدية');
    await f.dropdown('CMP_RISKLEVEL', 'Low');
    await f.next('KYC');
  }

  /** Step 6 – KYC Other Bank. */
  async fillKycOtherBank(): Promise<void> {
    await this.form.dropdown('KYC_EX_ACC', 'No');
    await this.form.next('KYC Other Bank');
  }

  /** Step 7 – Occupation. */
  async fillOccupation(c: IndividualCustomer): Promise<void> {
    const f = this.form;
    await f.dropdown('KYC_OCUPATION', 'Private Sector');
    await f.dropdown('WORK_CATEGCODE', 'Trade');
    await f.dropdown('WORK_SUBCATE', 0);
    await f.text('KYC_POSITION', c.position);
    await f.text('ESTM_INCOME', c.monthlyIncome);
    await f.next('Occupation');
  }

  /** Step 8 – Scheduled Interview (optional; defaults kept). */
  async skipInterview(): Promise<void> {
    await this.form.next('Scheduled Interview');
  }

  /** Step 9 – Overview: Save + confirm. Returns the workflow application number. */
  async save(): Promise<number> {
    return this.form.submitWorkflow('Created by regression suite');
  }

  async create(c: IndividualCustomer): Promise<number> {
    await this.fillRegistration(c);
    await this.fillAddress(c);
    await this.fillIdentifier(c);
    await this.fillDocuments();
    await this.fillKyc();
    await this.fillKycOtherBank();
    await this.fillOccupation(c);
    await this.skipInterview();
    return this.save();
  }
}
