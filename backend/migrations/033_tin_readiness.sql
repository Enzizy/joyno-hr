-- TIN readiness is recorded beside the SSS, PhilHealth and Pag-IBIG switches. It is optional and
-- never changes pay (withholding tax is entered by HR); the three contribution switches stay required.
ALTER TABLE payroll_employee_profiles DROP CONSTRAINT IF EXISTS payroll_profile_contribution_settings_valid;
ALTER TABLE payroll_employee_profiles ADD CONSTRAINT payroll_profile_contribution_settings_valid CHECK (
  jsonb_typeof(contribution_settings) = 'object'
  AND contribution_settings ?& ARRAY['sss','philhealth','pagibig']
  AND contribution_settings - ARRAY['sss','philhealth','pagibig','tin']::text[] = '{}'::jsonb
  AND jsonb_typeof(contribution_settings->'sss') = 'boolean'
  AND jsonb_typeof(contribution_settings->'philhealth') = 'boolean'
  AND jsonb_typeof(contribution_settings->'pagibig') = 'boolean'
  AND (NOT contribution_settings ? 'tin' OR jsonb_typeof(contribution_settings->'tin') = 'boolean')
);

COMMENT ON COLUMN payroll_employee_profiles.contribution_settings IS
  'HR-confirmed ID readiness per agency. False SSS/PhilHealth/Pag-IBIG excludes those contributions in new drafts; TIN is recorded only. Finalized lines retain saved amounts.';
