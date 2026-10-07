-- Preserve actual cutoffs while permitting an independent practice run per reviewed test batch.
DROP INDEX IF EXISTS payroll_runs_cutoff_shift_unique;
CREATE UNIQUE INDEX payroll_runs_cutoff_shift_unique
  ON payroll_runs(period_start,period_end,cutoff,(COALESCE(rule_snapshot->>'payrollScope','all')),
    (CASE WHEN rule_snapshot->>'isTest'='true' THEN 'practice:' || attendance_batch_id::text ELSE 'live' END));
