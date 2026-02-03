-- Add rejection comment to leave_requests (run once in phpMyAdmin or MySQL)
ALTER TABLE leave_requests
ADD COLUMN rejection_comment TEXT NULL AFTER approved_by;
