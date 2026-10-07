-- Preserve all runs and attendance. Scope is already recorded in immutable audit metadata.
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_period_start_period_end_cutoff_key;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_cutoff_shift_unique
  ON payroll_runs(period_start,period_end,cutoff,(COALESCE(rule_snapshot->>'payrollScope','all')));

DROP INDEX IF EXISTS payroll_attendance_source_unique;
CREATE UNIQUE INDEX payroll_attendance_source_unique
  ON payroll_attendance_import_batches(source_hash,period_start,period_end,context_hash)
  WHERE source_hash IS NOT NULL AND review_state='draft';
