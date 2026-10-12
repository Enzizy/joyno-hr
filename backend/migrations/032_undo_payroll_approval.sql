-- HR may undo an approval to correct attendance, as long as nothing has reached employees or the bank:
-- no payment is recorded and no payslip was emailed. Undoing only returns the run to draft and clears the
-- approval metadata; released (locked) payroll stays immutable.
CREATE OR REPLACE FUNCTION prevent_final_payroll_run_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payroll runs are retained for audit history';
  END IF;

  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Locked payroll runs are immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'approved')
    OR (OLD.status = 'approved' AND NEW.status = 'locked')
    OR (OLD.status = 'approved' AND NEW.status = 'draft')
  ) THEN
    RAISE EXCEPTION 'Invalid payroll run status transition';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'approved'
     AND (to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'approved_by', 'approved_at']) THEN
    RAISE EXCEPTION 'Approval may only change payroll status and approval metadata';
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'locked'
     AND (to_jsonb(NEW) - ARRAY['status', 'locked_by', 'locked_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'locked_by', 'locked_at']) THEN
    RAISE EXCEPTION 'Locking may only change payroll status and lock metadata';
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'draft' THEN
    IF EXISTS (SELECT 1 FROM payroll_payments WHERE payroll_run_id = OLD.id)
       OR EXISTS (SELECT 1 FROM payroll_run_events WHERE payroll_run_id = OLD.id AND action = 'payslip_emailed') THEN
      RAISE EXCEPTION 'Approval cannot be undone after payment is recorded or a payslip is emailed';
    END IF;
    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR (to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'approved_by', 'approved_at']) THEN
      RAISE EXCEPTION 'Undoing approval may only clear approval metadata';
    END IF;
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'Approved payroll runs may only transition to locked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
