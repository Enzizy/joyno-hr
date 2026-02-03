import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'

const coll = (name) => collection(db, name)
const docRef = (name, id) => doc(db, name, id)

// ----- Employees -----
export async function getEmployees() {
  const q = query(coll('employees'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getEmployee(id) {
  const snap = await getDoc(docRef('employees', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function createEmployee(data) {
  const payload = {
    employee_code: data.employee_code,
    first_name: data.first_name,
    last_name: data.last_name,
    department: data.department,
    position: data.position,
    salary_type: data.salary_type || 'monthly',
    salary_amount: data.salary_amount,
    date_hired: data.date_hired,
    status: data.status || 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const ref = await addDoc(coll('employees'), payload)
  return { id: ref.id, ...payload }
}

export async function updateEmployee(id, data) {
  const payload = { ...data, updatedAt: serverTimestamp() }
  await updateDoc(docRef('employees', id), payload)
  return { id, ...data }
}

export async function deleteEmployee(id) {
  await deleteDoc(docRef('employees', id))
}

// ----- Users (Firestore profile: role, employeeId) -----
export async function getUsers() {
  const snap = await getDocs(coll('users'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getUser(uid) {
  const snap = await getDoc(docRef('users', uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function setUserProfile(uid, data) {
  await setDoc(docRef('users', uid), data, { merge: true })
}

// ----- Leave types -----
export async function getLeaveTypes() {
  const snap = await getDocs(query(coll('leave_types'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getLeaveBalances(employeeId) {
  const q = query(
    coll('leave_balances'),
    where('employee_id', '==', employeeId)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ----- Leave requests -----
export async function getLeaveRequests(role, currentEmployeeId) {
  let q = query(coll('leave_requests'), orderBy('createdAt', 'desc'))
  if (role === 'employee' && currentEmployeeId) {
    q = query(
      coll('leave_requests'),
      where('employee_id', '==', currentEmployeeId),
      orderBy('createdAt', 'desc')
    )
  }
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  for (const r of list) {
    if (r.employee_id) {
      const emp = await getDoc(docRef('employees', r.employee_id))
      r.employee = emp.exists() ? emp.data() : null
    }
    if (r.leave_type_id) {
      const lt = await getDoc(docRef('leave_types', r.leave_type_id))
      r.leave_type = lt.exists() ? lt.data() : null
    }
  }
  return list
}

export async function createLeaveRequest(data) {
  const payload = {
    employee_id: data.employee_id,
    leave_type_id: data.leave_type_id,
    start_date: data.start_date,
    end_date: data.end_date,
    reason: data.reason,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const ref = await addDoc(coll('leave_requests'), payload)
  return { id: ref.id, ...payload }
}

export async function approveLeaveRequest(id) {
  const auth = (await import('@/firebase')).auth
  const uid = auth.currentUser?.uid
  await updateDoc(docRef('leave_requests', id), {
    status: 'approved',
    approved_by: uid,
    updatedAt: serverTimestamp(),
  })
  const snap = await getDoc(docRef('leave_requests', id))
  return { id: snap.id, ...snap.data() }
}

export async function rejectLeaveRequest(id, comment) {
  const auth = (await import('@/firebase')).auth
  const uid = auth.currentUser?.uid
  await updateDoc(docRef('leave_requests', id), {
    status: 'rejected',
    approved_by: uid,
    rejection_comment: comment,
    updatedAt: serverTimestamp(),
  })
  const snap = await getDoc(docRef('leave_requests', id))
  return { id: snap.id, ...snap.data() }
}

// ----- Audit logs -----
export async function getAuditLogs() {
  const q = query(coll('audit_logs'), orderBy('created_at', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 200)
}

export async function addAuditLog(userId, action, targetTable, targetId) {
  await addDoc(coll('audit_logs'), {
    user_id: userId,
    action,
    target_table: targetTable,
    target_id: targetId,
    created_at: serverTimestamp(),
  })
}

// ----- Reports (leave) -----
export async function getLeaveReport(from, to) {
  const q = query(coll('leave_requests'), orderBy('start_date', 'desc'))
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  if (!from && !to) return list
  return list.filter((r) => {
    const d = r.start_date
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}
