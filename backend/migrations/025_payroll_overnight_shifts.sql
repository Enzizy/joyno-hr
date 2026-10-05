-- Generated with Supabase CLI, numbered for this application's migration runner.
-- Permit a shift to end on the following day. No salaries or saved schedules
-- are rewritten; the application validates eight paid hours and fixed breaks.
DO $$
DECLARE legacy_constraint RECORD;
BEGIN
  FOR legacy_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'payroll_employee_profiles'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) = 'CHECK ((work_end_time > work_start_time))'
  LOOP
    EXECUTE format('ALTER TABLE payroll_employee_profiles DROP CONSTRAINT %I', legacy_constraint.conname);
  END LOOP;
END $$;
ALTER TABLE payroll_employee_profiles
  ADD CONSTRAINT payroll_shift_distinct_times CHECK (work_end_time <> work_start_time);
