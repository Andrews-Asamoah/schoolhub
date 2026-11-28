# Accountant payroll

Apply the database migration with `pnpm db:deploy` for an existing deployment. Set `PAYROLL_DETAILS_ENCRYPTION_KEY` on every API instance to the same 32-byte key, encoded in standard Base64. Generate it with `openssl rand -base64 32`. Keep a recoverable copy separate from database backups. Existing encrypted details require the same key to be read, so plan a data re-encryption before changing it. Salary imports and payroll calculations remain available while the key is unset.

## Import salaries

In **Payroll → Salary register → Import salaries**, download the Excel template, enter monthly base salaries in GHS, then preview and import. Employee type and the canonical employee ID identify each active record. Keep IDs as text. Each workbook can update up to 250 entries. A blank salary leaves an employee unchanged and zero explicitly sets the salary to zero. Correct any reported issues and preview again. Salary changes are applied together and affect new drafts. Previously saved drafts, approved runs and paid runs keep their saved amounts.

## Employee payment details and Tier 2

Open **Payment details** on each active teacher or staff row. Add the employee's SSNIT number, the separate trustee membership number if issued, and any bank details used for disbursement. Accountants can edit the details and owners have read access. Viewing or changing a saved record creates an audit event without recording the identifiers or account values.

Tier 2 uses the existing payroll contribution settings. An accountant creates a scheme via `POST /finance/payroll/settings/schemes` with key `SSNIT_TIER2`, base `BASIC`, zero employee and employer rates and the verified allocation as `memoRate`. Include the effective date, source reference, approved pension trustee and any applicable limits verified with that trustee. The approved `SSNIT_TIER1` scheme must contain the combined employee and employer rates. The school's authorized reviewer activates the draft via `POST /finance/payroll/settings/scheme/{id}/activate`. Keep both schemes and the PAYE schedule effective for the payroll month. See [NPRA contribution guidance](https://npra.gov.gh/assets/documents/Guidelines-for-the-payment-of-contributions.pdf).

For an approved or paid run with saved Tier 2 amounts, open **Review slips → Tier 2 Excel**. The workbook uses the saved amounts and current employee identifiers. Complete missing or duplicate SSNIT numbers before exporting. Check the file against the trustee's submission format. Use the bank and pension provider channels to issue payments or submit remittances. When salaries are marked paid in SchoolHub, the saved Tier 2 allocation is transferred from the combined SSNIT liability to the separate Tier 2 payable account in the ledger.
