import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

initializeApp()
const auth = getAuth()
const db = getFirestore()

/**
 * Create a new user (Admin only). Callable from frontend.
 * Requires the caller to be authenticated and have role 'admin' in Firestore users/{uid}.
 */
export const createUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.')
  }
  const callerUid = request.auth.uid
  const callerDoc = await db.collection('users').doc(callerUid).get()
  const callerRole = callerDoc.exists ? callerDoc.data().role : null
  if (callerRole !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }

  const { email, password, role, employeeId } = request.data || {}
  if (!email || !password) {
    throw new HttpsError('invalid-argument', 'Email and password required.')
  }
  const validRoles = ['admin', 'hr', 'employee']
  if (!validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'Role must be admin, hr, or employee.')
  }

  const userRecord = await auth.createUser({
    email,
    password,
    emailVerified: false,
  })

  await db.collection('users').doc(userRecord.uid).set({
    email,
    role: role || 'employee',
    employeeId: employeeId || null,
  })

  return { uid: userRecord.uid, email: userRecord.email }
})
