# Firebase setup for HR System

## 1. Install Firebase CLI and login

```bash
npm install -g firebase-tools
firebase login
```

## 2. Create project and enable services

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or use existing **hr-system-e6b4a**)
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Create **Firestore** database (start in production mode; rules are in `firestore.rules`)
5. Enable **Hosting** and **Functions**

## 3. Link local project

From the **HR System** folder (root, not frontend):

```bash
firebase use hr-system-e6b4a
```

(Use your project ID if different.)

## 4. First admin user

1. In Firebase Console → **Authentication** → **Users** → **Add user**
   - Email: e.g. `admin@example.com`
   - Password: e.g. `admin123`
2. Copy the user **UID**
3. In **Firestore** → **Start collection** → Collection ID: `users`
4. Document ID: paste the **UID**
5. Fields:
   - `email` (string): `admin@example.com`
   - `role` (string): `admin`
6. Save

## 5. Leave types (optional seed)

In Firestore, create collection `leave_types` and add documents, e.g.:

- Document 1: `name` (string): `Sick Leave`, `default_credits` (number): `10`
- Document 2: `name`: `Vacation Leave`, `default_credits`: `15`
- Document 3: `name`: `Emergency Leave`, `default_credits`: `5`

(Use Auto-ID for document IDs.)

## 6. Deploy Cloud Functions (for “Add user”)

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 7. Build and deploy frontend

```bash
cd frontend
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 8. Firestore indexes

When you use **Leave request** as an employee, Firestore may ask for a composite index. Open the link in the error message in the console to create it (e.g. collection `leave_requests`, fields `employee_id` Ascending, `createdAt` Descending).

## 9. Run locally

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 and sign in with the admin user you created.

---

**Summary:** Auth and Firestore hold all data. The Node/Express backend is no longer used. “Add user” works only after you deploy Cloud Functions.
