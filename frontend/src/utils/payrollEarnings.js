export function effectiveEarnings(details = {}) {
  const manual = details.manualEarnings || []
  const overridden = new Set(manual.map(entry => entry.type))
  return [...(details.automaticEarnings || []).filter(entry => !overridden.has(entry.type)), ...manual]
}
export function needsNightReview(line) {
  return Boolean(line.details?.nightDifferential?.reviewRequired && !(line.details?.manualEarnings || []).some(entry => entry.type === 'night_differential' && entry.note?.trim().length >= 3))
}
