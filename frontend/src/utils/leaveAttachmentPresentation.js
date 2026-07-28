const PRESENTATION = {
  not_required: { label: 'Not required', variant: 'neutral' },
  missing: { label: 'Document missing', variant: 'danger' },
  pending_review: { label: 'Pending review', variant: 'warning' },
  replacement_required: { label: 'Replacement required', variant: 'danger' },
  valid: { label: 'Document valid', variant: 'success' },
  deadline_missed: { label: 'Deadline missed', variant: 'danger' },
}

export function getAttachmentReviewPresentation(status) {
  return PRESENTATION[status] || PRESENTATION.not_required
}

export function requiresAttachmentReview(row) {
  return Boolean(row?.attachment_review_status && row.attachment_review_status !== 'not_required')
}
