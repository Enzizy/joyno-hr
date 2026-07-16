function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatLinkedText(value, linkLabels = {}, { attachment = false } = {}) {
  const urlPattern = /(https?:\/\/[^\s]+)/g
  let result = ''
  let lastIndex = 0
  const text = String(value || '')
  for (const match of text.matchAll(urlPattern)) {
    const url = match[0]
    const linkText = linkLabels[url] || (attachment ? 'View attachment' : url)
    result += escapeHtml(text.slice(lastIndex, match.index))
    result += attachment
      ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#fbbf24;color:#111827;text-decoration:none;font-weight:700;padding:9px 14px;border-radius:8px;">${escapeHtml(linkText)}</a>`
      : `<a href="${escapeHtml(url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(linkText)}</a>`
    lastIndex = Number(match.index) + url.length
  }
  result += escapeHtml(text.slice(lastIndex))
  return result
}

function parseDetailLine(line) {
  const match = String(line).match(/^([A-Za-z][A-Za-z0-9 /&()_-]{0,39}):\s+(.+)$/)
  if (!match || /^https?$/i.test(match[1])) return null
  return { label: match[1].trim(), value: match[2].trim() }
}

function badgeHtml(value) {
  const normalized = String(value || '').trim().toLowerCase()
  let background = '#e5e7eb'
  let color = '#374151'
  if (['approved', 'completed', 'paid', 'low'].includes(normalized)) {
    background = '#dcfce7'
    color = '#166534'
  } else if (['rejected', 'cancelled', 'urgent', 'unpaid'].includes(normalized)) {
    background = '#fee2e2'
    color = '#991b1b'
  } else if (['pending', 'in progress', 'in_progress', 'medium'].includes(normalized)) {
    background = '#fef3c7'
    color = '#92400e'
  } else if (normalized === 'high') {
    background = '#ffedd5'
    color = '#9a3412'
  }
  return `<span style="display:inline-block;background:${background};color:${color};font-size:12px;font-weight:700;text-transform:capitalize;padding:4px 9px;border-radius:999px;">${escapeHtml(value)}</span>`
}

function detailValueHtml(detail, linkLabels) {
  const label = detail.label.toLowerCase()
  if (label === 'attachment') return formatLinkedText(detail.value, linkLabels, { attachment: true })
  if (['priority', 'status', 'pay'].includes(label)) return badgeHtml(detail.value)
  return formatLinkedText(detail.value, linkLabels)
}

function detailsCardHtml(details, linkLabels) {
  const rows = details.map((detail, index) => {
    const border = index < details.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''
    return `<tr>
      <td width="32%" style="${border}padding:11px 12px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.35px;vertical-align:top;">${escapeHtml(detail.label)}</td>
      <td style="${border}padding:11px 12px;color:#111827;font-size:14px;font-weight:600;line-height:1.5;vertical-align:top;">${detailValueHtml(detail, linkLabels)}</td>
    </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;border-collapse:separate;overflow:hidden;">${rows}</table>`
}

function paragraphHtml(line, linkLabels, index) {
  const isGreeting = index === 0 && /^(hi|hello)\b/i.test(line)
  const isSignature = /^-\s/.test(line)
  if (/^https?:\/\/[^\s]+$/.test(line)) {
    return `<p style="margin:16px 0;"><a href="${escapeHtml(line)}" style="display:inline-block;background:#111827;color:#fbbf24;text-decoration:none;font-size:14px;font-weight:700;padding:10px 16px;border-radius:8px;">Open Joyno HR</a></p>`
  }
  return `<p style="margin:0 0 ${isGreeting ? '14' : '10'}px;color:${isSignature ? '#6b7280' : '#374151'};font-size:${isSignature ? '12' : '14'}px;font-weight:${isGreeting ? '700' : '400'};line-height:1.6;">${formatLinkedText(line, linkLabels)}</p>`
}

function renderEmailBodyHtml(text, linkLabels = {}) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return '<p style="margin:0;color:#374151;font-size:14px;">No details provided.</p>'

  const blocks = []
  let detailBuffer = []
  const flushDetails = () => {
    if (!detailBuffer.length) return
    blocks.push(detailsCardHtml(detailBuffer, linkLabels))
    detailBuffer = []
  }

  lines.forEach((line, index) => {
    const detail = parseDetailLine(line)
    if (detail) {
      detailBuffer.push(detail)
      return
    }
    flushDetails()
    blocks.push(paragraphHtml(line, linkLabels, index))
  })
  flushDetails()
  return blocks.join('')
}

module.exports = { escapeHtml, renderEmailBodyHtml }
