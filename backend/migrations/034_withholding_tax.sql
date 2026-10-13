-- Withholding tax is computed per payday like the workbook (Remittance AR/AS, Register U): the BIR
-- semi-monthly table from 2023, only when the TIN is ticked. MASTERFILE's MWE and TAX SHIELD columns
-- become a minimum wage tick and a per-payday tax shield amount on the pay setup.
ALTER TABLE payroll_employee_profiles
  ADD COLUMN IF NOT EXISTS minimum_wage_earner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_shield NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_employee_profiles DROP CONSTRAINT IF EXISTS payroll_profile_tax_shield_valid;
ALTER TABLE payroll_employee_profiles ADD CONSTRAINT payroll_profile_tax_shield_valid CHECK (tax_shield >= 0);

-- The computed tax on each pay line. An HR-entered withholding tax (a tax_withholding charge) replaces
-- it and is kept with the line's other charges, so older lines keep their saved amounts.
ALTER TABLE payroll_run_lines ADD COLUMN IF NOT EXISTS withholding_tax NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Dated tax tables. Each payday uses the newest table that started on or before it, so a new law only
-- needs a new table with its start date. The first one is the workbook's 2023 table.
CREATE TABLE IF NOT EXISTS payroll_tax_tables (
  effective_from DATE PRIMARY KEY,
  brackets JSONB NOT NULL CHECK (jsonb_typeof(brackets) = 'array' AND jsonb_array_length(brackets) BETWEEN 2 AND 12),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO payroll_tax_tables (effective_from, brackets, note) VALUES ('2023-01-01', '[
  {"upTo": 10417, "base": 0, "over": 0, "rate": 0},
  {"upTo": 16666, "base": 0, "over": 10417, "rate": 0.15},
  {"upTo": 33332, "base": 937.5, "over": 16667, "rate": 0.2},
  {"upTo": 83332, "base": 4270.7, "over": 33333, "rate": 0.25},
  {"upTo": 333332, "base": 16770.7, "over": 83333, "rate": 0.3},
  {"upTo": null, "base": 91770.7, "over": 333333, "rate": 0.35}
]'::jsonb, 'TRAIN law semi-monthly table from 2023, as in the workbook') ON CONFLICT (effective_from) DO NOTHING;

COMMENT ON COLUMN payroll_employee_profiles.contribution_settings IS
  'HR-confirmed ID readiness per agency. False SSS/PhilHealth/Pag-IBIG excludes those contributions in new drafts; false TIN means no withholding tax. Finalized lines retain saved amounts.';
COMMENT ON COLUMN payroll_employee_profiles.minimum_wage_earner IS 'Workbook MASTERFILE MWE: no taxable pay, so no withholding tax.';
COMMENT ON COLUMN payroll_employee_profiles.tax_shield IS 'Workbook MASTERFILE TAX SHIELD: pesos taken off taxable pay on every payday.';
COMMENT ON COLUMN payroll_run_lines.withholding_tax IS 'Withholding tax computed from the BIR semi-monthly table; 0 when HR entered the tax as a charge.';
