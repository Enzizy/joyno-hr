-- Generated with Supabase CLI migration new employee_government_contribution_settings.
-- Renamed to match this application's ordered migration runner.
-- Defaults preserve all existing contribution calculations and finalized pay.
ALTER TABLE payroll_employee_profiles
  ADD COLUMN contribution_settings JSONB NOT NULL
  DEFAULT '{"sss":true,"philhealth":true,"pagibig":true}'::jsonb
  CONSTRAINT payroll_profile_contribution_settings_valid CHECK (
    jsonb_typeof(contribution_settings) = 'object'
    AND contribution_settings ?& ARRAY['sss','philhealth','pagibig']
    AND contribution_settings - ARRAY['sss','philhealth','pagibig']::text[] = '{}'::jsonb
    AND jsonb_typeof(contribution_settings->'sss') = 'boolean'
    AND jsonb_typeof(contribution_settings->'philhealth') = 'boolean'
    AND jsonb_typeof(contribution_settings->'pagibig') = 'boolean'
  );

COMMENT ON COLUMN payroll_employee_profiles.contribution_settings IS
  'HR-confirmed ID readiness per agency. False excludes employee/employer contributions in new drafts; finalized lines retain saved amounts.';
