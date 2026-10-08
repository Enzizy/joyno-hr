const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeAttendanceCsvs, parseAttendanceCsv } = require('./services/payrollAttendanceService')

test('two monthly biometric exports merge into one attendance file', () => {
  const september = 'Person ID,Name,Time,Attendance Check Point\n\'00000204,"Batican, Rolex",09/30/26 09:00,Main_Door_Out_Door1_Entrance Card Reader1\n'
  // The October export lists its columns in a different order; rows still line up by column name.
  const october = 'Time,Person ID,Attendance Check Point,Name\n10/01/26 18:05,\'00000204,Main_Door_IN_Door1_Entrance Card Reader1,"Batican, Rolex"\n'
  const scan = record => [record.employeeCode, record.timestamp, record.eventType, record.raw.Name]
  const separately = [...parseAttendanceCsv(september), ...parseAttendanceCsv(october)].map(scan)
  const merged = parseAttendanceCsv(mergeAttendanceCsvs([september, october])).map(scan)
  assert.deepEqual(merged, separately)
  assert.equal(merged.length, 2)
  // A single file is used exactly as uploaded.
  assert.equal(mergeAttendanceCsvs([september]), september)
})
