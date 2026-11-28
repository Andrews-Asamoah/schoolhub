import type { ContributionSchemeDraftInput, TaxScheduleDraftInput } from "./payroll-settings.service.js";

/**
 * Starter payroll settings for Ghana. They only ever create DRAFT rows: the accountant must still review
 * the figures against the official source and activate them through the normal approval step.
 * Rates change by law, so every template carries its source and an effective date to re-check.
 */
const GRA_PAYE_SOURCE =
  "Ghana Revenue Authority, PAYE page (https://gra.gov.gh/domestic-tax/tax-types/paye/): monthly resident bands for "
  + "year of assessment 2026 under the Income Tax (Amendment) Act, 2026 (Act 1178), effective 1 September 2026; "
  + "non-residents are taxed at a flat 25%. Re-check against the current GRA schedule before approving.";
const SSNIT_SOURCE =
  "National Pensions Act, 2008 (Act 766): 5.5% employee and 13% employer on basic salary under the combined SSNIT "
  + "scheme; the Tier 2 share (5% of basic salary) is carved out of it and shown as a memo allocation. "
  + "Confirm against the current SSNIT circular before approving.";

export const GHANA_PAYE_2026: Omit<TaxScheduleDraftInput, "effectiveFrom" | "effectiveTo"> & { effectiveFrom: string } = {
  name: "Ghana PAYE - resident monthly bands (2026, from 1 Sep 2026)",
  effectiveFrom: "2026-09-01",
  nonResidentRate: "25",
  sourceNote: GRA_PAYE_SOURCE,
  bands: [
    { width: "588", rate: "0" },
    { width: "80", rate: "5" },
    { width: "100", rate: "10" },
    { width: "2900", rate: "17.5" },
    { width: "16000", rate: "25" },
    { width: "30332", rate: "30" },
    { width: null, rate: "35" },
  ],
};

export function ghanaSchemeTemplates(effectiveFrom: string): ContributionSchemeDraftInput[] {
  return [
    {
      key: "SSNIT_TIER1", label: "SSNIT (combined Tier 1)", trustee: "SSNIT", base: "BASIC",
      employeeRate: "5.5", employerRate: "13", memoRate: "0", employeeShareTaxDeductible: true,
      effectiveFrom, sourceNote: SSNIT_SOURCE,
    },
    {
      key: "SSNIT_TIER2", label: "Tier 2 allocation (memo)", trustee: null, base: "BASIC",
      employeeRate: "0", employerRate: "0", memoRate: "5", employeeShareTaxDeductible: false,
      effectiveFrom, sourceNote: SSNIT_SOURCE,
    },
  ];
}
