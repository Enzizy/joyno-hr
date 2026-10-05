export function filterAnnouncementAudience(people, { search = '', shift = 'all', department = '' } = {}) {
  const query=search.trim().toLocaleLowerCase()
  return people.filter(person => (shift==='all' || person.shift===shift) && (!department || person.department===department) &&
    (!query || `${person.first_name} ${person.last_name} ${person.employee_code} ${person.department}`.toLocaleLowerCase().includes(query)))
}

export function toggleMatchingRecipients(selectedIds, matchingIds) {
  const selected=new Set(selectedIds.map(Number)), matching=matchingIds.map(Number)
  const allSelected=matching.length>0 && matching.every(id=>selected.has(id))
  for(const id of matching) { if(allSelected)selected.delete(id);else selected.add(id) }
  return [...selected]
}
