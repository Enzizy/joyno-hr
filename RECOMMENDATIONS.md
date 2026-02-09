# Recommendations & Execution Plan

This document captures suggested improvements to the Joyno HR system. We can execute them one by one and check them off.

## 1) High-Impact Logic
- Move employee status updates (active/on_leave) to a Cloud Function triggered by leave request status changes.
- Prevent overlapping leave requests (UI + Firestore rule).
- Store `approved_by_name` on the leave request at approval time to avoid extra reads and broken display if users change.
- Ensure date comparisons are timezone-safe (e.g., Asia/Manila or Firestore Timestamp).

## 2) UX Improvements
- Show a clear banner when a user is on leave, including the leave end date.
- Provide a direct link from dashboard to “My leave requests.”
- Display approver role in Activity Log (Admin/HR).

## 3) Security & Rules
- Tighten `/users` read access: allow self and HR/Admin only (or move to stored approver name).
- Restrict `/employees` reads to HR/Admin only if employees shouldn’t see all staff data.
- Add a rule to block leave creation when an employee is currently on leave.

## 4) Performance
- Reduce per-row Firestore reads by denormalizing employee name and leave type name into leave_requests.
- Batch or cache fetches for lookups (users/employees/leave_types).

## 5) Data Consistency
- Standardize the employee link field to **one** key: `employeeId` or `employee_id`.
- Add a migration script if needed to backfill fields and normalize data.

## 6) Quality
- Remove unused functions in `firestore.rules` (clean warnings).
- Add minimal logging/error messaging for permission failures to help debugging.

---

### Execution Checklist
- [x] 1. Cloud Function for employee status updates
- [x] 2. Prevent overlapping leave requests
- [x] 3. Store approved_by_name snapshot
- [x] 4. Timezone-safe date handling
- [x] 5. On-leave banner with end date
- [x] 6. Link to My Leave Requests
- [x] 7. Approver role in Activity Log
- [x] 8. Tighten users read access
- [x] 9. Restrict employees read access
- [x] 10. Denormalize leave request display data
- [x] 11. Batch/cache lookups
- [x] 12. Standardize employeeId field
- [x] 13. Migration/backfill script (if needed)
- [x] 14. Clean unused rules
- [x] 15. Improve error messaging
