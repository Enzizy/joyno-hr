-- HR may reopen confirmed attendance to correct it (a forgotten holiday or overtime) while the pay
-- calculated from it is still a draft. Once a pay run using it is approved, it stays locked. Reopening
-- only flips the review back to draft; the file, dates and every decided day are kept.
CREATE OR REPLACE FUNCTION protect_confirmed_attendance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE batch_state TEXT;
BEGIN
 IF TG_TABLE_NAME='payroll_attendance_import_batches' THEN
   IF OLD.review_state='confirmed' THEN
     IF TG_OP='UPDATE' AND NEW.review_state='draft' AND NEW.id=OLD.id
        AND NEW.source_csv IS NOT DISTINCT FROM OLD.source_csv AND NEW.source_hash IS NOT DISTINCT FROM OLD.source_hash
        AND NEW.period_start=OLD.period_start AND NEW.period_end=OLD.period_end
        AND NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.attendance_batch_id=OLD.id AND r.status<>'draft') THEN
       RETURN NEW;
     END IF;
     RAISE EXCEPTION 'Confirmed attendance is immutable';
   END IF;
 ELSE
   IF TG_OP='INSERT' THEN SELECT review_state INTO batch_state FROM payroll_attendance_import_batches WHERE id=NEW.batch_id;
   ELSE SELECT review_state INTO batch_state FROM payroll_attendance_import_batches WHERE id=OLD.batch_id; END IF;
   IF batch_state='confirmed' THEN RAISE EXCEPTION 'Confirmed attendance is immutable'; END IF;
   IF TG_OP='UPDATE' AND NEW.batch_id<>OLD.batch_id THEN
     SELECT review_state INTO batch_state FROM payroll_attendance_import_batches WHERE id=NEW.batch_id;
     IF batch_state='confirmed' THEN RAISE EXCEPTION 'Confirmed attendance is immutable'; END IF;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION protect_confirmed_attendance() FROM PUBLIC,anon,authenticated;
