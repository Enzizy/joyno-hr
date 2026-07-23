const HOLIDAYS_2026 = [
  ['2026-01-01', "New Year's Day", 'regular'],
  ['2026-02-17', 'Chinese New Year', 'special_non_working'],
  ['2026-02-25', 'EDSA People Power Revolution Anniversary', 'special_working', true],
  ['2026-03-20', "Eid'l Fitr", 'regular'],
  ['2026-04-02', 'Maundy Thursday', 'regular'],
  ['2026-04-03', 'Good Friday', 'regular'],
  ['2026-04-04', 'Black Saturday', 'special_non_working'],
  ['2026-04-09', 'Araw ng Kagitingan', 'regular'],
  ['2026-05-01', 'Labor Day', 'regular'],
  ['2026-05-27', "Eid'l Adha", 'regular'],
  ['2026-06-12', 'Independence Day', 'regular'],
  ['2026-08-21', 'Ninoy Aquino Day', 'special_non_working'],
  ['2026-08-31', 'National Heroes Day', 'regular'],
  ['2026-11-01', "All Saints' Day", 'special_non_working'],
  ['2026-11-02', "All Souls' Day", 'special_non_working'],
  ['2026-11-30', 'Bonifacio Day', 'regular'],
  ['2026-12-08', 'Feast of the Immaculate Conception of Mary', 'special_non_working'],
  ['2026-12-24', 'Christmas Eve', 'special_non_working'],
  ['2026-12-25', 'Christmas Day', 'regular'],
  ['2026-12-30', 'Rizal Day', 'regular'],
  ['2026-12-31', 'Last Day of the Year', 'special_non_working'],
].map(([holidayDate, name, category, isWorkingDay = false], index) => ({
  id: `ph-2026-${index + 1}`,
  holiday_date: holidayDate,
  name,
  category,
  is_working_day: isWorkingDay,
  source: category === 'special_working' || !name.startsWith('Eid')
    ? 'Proclamation No. 1006'
    : name.includes('Fitr') ? 'Proclamation No. 1189' : 'Proclamation No. 1264',
}))

export function getLocalPhilippineHolidays(from, to) {
  return HOLIDAYS_2026.filter((holiday) =>
    (!from || holiday.holiday_date >= from) && (!to || holiday.holiday_date <= to)
  )
}
