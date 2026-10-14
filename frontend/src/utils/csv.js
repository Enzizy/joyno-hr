// CSV files that open cleanly in Excel: UTF-8 with a byte-order mark, quoted cells, and text that
// starts like a formula (=, +, -, @) prefixed with ' so a spreadsheet never runs it.
function cell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([`﻿${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
