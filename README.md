# LawhubbAdminPanel

Admin panel for managing law chambers: members, practices, attachments, referrals and reports, backed by Firebase.

Overview
- Single-page React app (Vite + TypeScript) providing role-based admin and member workspaces for law chambers.
- Uses Firebase Auth, Firestore and Storage for data and media; callable Functions for privileged operations (e.g., password resets).
- Routing and permission checks are implemented in `src/App.tsx`; pages live under `src/pages`.
- Includes a small set of Firebase Cloud Functions in `functions/` (Node 20).

Tech Stack
- TypeScript, React 18, Vite
- Firebase (Auth, Firestore, Storage, Functions)
- Tailwind CSS
- Chart.js, lucide-react

Getting Started
Prerequisites
- Node.js (18+; functions use Node 20 when deploying)
- npm
- Firebase CLI (`firebase-tools`) for deploys

Steps
1. Clone the repo
```
git clone https://github.com/Nani-Des/LawhubbAdminPanel.git
cd LawhubbAdminPanel
```
2. Install dependencies
```
npm install
```
3. Configure Firebase credentials
- Edit `src/firebase.ts` with your Firebase config or set up the project with the Firebase CLI and ensure `firebase.json`/.firebaserc point to the correct project.
4. Run the dev server
```
npm run dev
```
5. Run functions locally (optional)
```
cd functions
npm run serve
```
6. Build and deploy
```
npm run build
npm run deploy           # hosting only
npm run deploy:functions # functions only
npm run deploy:all       # hosting + functions
```
Note: Deploy requires `firebase login` and a selected Firebase project.

Usage
- Open the dev server in a browser (default Vite port):
```
http://localhost:5173
```
- Authenticate via the app's login page (`/login`) to access admin or member workspaces.

Project Structure
```
package.json
firebase.json
vite.config.ts
functions/
  index.js             # callable Firebase Functions (setMemberPassword)
  package.json
src/
  firebase.ts          # Firebase initialization
  App.tsx              # routing and permission logic
  main.tsx
  pages/               # Dashboard, Lawyers, Referrals, doctor/* etc.
  components/          # layout and UI components
  contexts/            # AuthContext, ChamberContext
public/
```

Status
- working

Author
- Nani-Des — https://github.com/Nani-Des
