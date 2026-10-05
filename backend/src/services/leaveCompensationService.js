const db = require('../db')
const { countPhilippineWorkingDays } = require('./philippineHolidayService')
const { isPaidLeaveEligible } = require('./leaveEligibilityService')

async function resolveLeaveCompensation(
  employee,
  leaveType,
  startDate,
  endDate,
  hasMedicalAttachment = false,
  queryDb = db
) {
  const leaveDays = await countPhilippineWorkingDays(queryDb, startDate, endDate)
  if (!leaveDays || leaveDays <= 0) return null

  const paidDaysCap = Number(leaveType?.paid_days_per_year || 0)
  if (!leaveType || paidDaysCap <= 0) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `${leaveType?.name || 'This leave type'} is unpaid by policy.`,
    }
  }

  const eligible = isPaidLeaveEligible(employee?.date_hired, startDate, leaveType.min_months_employed || 0)
  if (!eligible) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `Paid ${leaveType.name} requires at least ${Number(leaveType.min_months_employed || 0)} month(s) of service.`,
    }
  }
  if (leaveType.requires_attachment_for_paid && !hasMedicalAttachment) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `${leaveType.name} paid leave requires a supporting document. Without attachment, this request is unpaid.`,
    }
  }

  const leaveYear = Number(String(startDate).slice(0, 4))
  const usedDays = await getApprovedPaidLeaveDays(employee?.id, leaveType.name, leaveYear, null, queryDb)
  const remainingTypePaidDays = Math.max(0, paidDaysCap - usedDays)
  const payableDays = Math.min(leaveDays, remainingTypePaidDays)
  const unpaidDays = Math.max(0, leaveDays - payableDays)

  if (payableDays <= 0) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `No paid days available. ${leaveType.name} yearly paid allowance is already used.`,
    }
  }
  if (leaveDays <= payableDays) {
    return {
      leaveDays,
      paidDays: leaveDays,
      unpaidDays: 0,
      leavePayType: 'paid',
      creditsDeducted: leaveDays,
      note: `All ${leaveDays} day(s) are paid.`,
    }
  }

  return {
    leaveDays,
    paidDays: payableDays,
    unpaidDays,
    leavePayType: 'partial_paid',
    creditsDeducted: payableDays,
    note: `${payableDays} day(s) paid and ${unpaidDays} day(s) unpaid based on ${leaveType.name} remaining allowance.`,
  }
}

async function getApprovedPaidLeaveDays(employeeId, leaveTypeName, year, excludeRequestId = null, queryDb = db) {
  const params = [employeeId, leaveTypeName, String(year)]
  let sql = `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN leave_pay_type IN ('paid','partial_paid') THEN COALESCE(credits_deducted, leave_days, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS used_days
    FROM leave_requests
    WHERE employee_id = $1
      AND status = 'approved'
      AND LOWER(leave_type_name) = LOWER($2)
      AND EXTRACT(YEAR FROM start_date) = $3::int
  `
  if (excludeRequestId) {
    params.push(excludeRequestId)
    sql += ` AND id <> $${params.length}`
  }
  const { rows } = await queryDb.query(sql, params)
  return Number(rows[0]?.used_days || 0)
}

module.exports = { resolveLeaveCompensation }
