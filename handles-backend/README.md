# Handles API (backend)

Node.js + Express REST API backed by Firebase Realtime Database. This is the
only part of Handles that talks to Firebase - the frontend never sees Firebase
credentials.

## Local setup

```bash
cd backend
npm install
cp .env.example .env
# fill in .env with real Firebase Admin + JWT values
npm run dev
```

The server listens on `process.env.PORT` (defaults to 4000 locally).

## Getting Firebase Admin credentials

1. Firebase console -> Project settings -> Service accounts -> Generate new private key.
2. This downloads a JSON file with `project_id`, `client_email`, and `private_key`.
3. Map those into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   Keep the `\n` sequences in the private key literal (the code converts them back
   to real newlines) - most platforms, including Render, handle this fine if you
   paste the key wrapped in quotes.
4. `FIREBASE_DATABASE_URL` is your Realtime Database URL, e.g.
   `https://handles-82cc1-default-rtdb.firebaseio.com`.

## Deploying the database rules

In the Firebase console, go to Realtime Database -> Rules, and paste the
contents of `database.rules.json`. All reads/writes are denied by default at
the database level - every access goes through this API, which enforces
per-user ownership in application code before touching the database.

## Deploying to Render

1. Push this repo to GitHub.
2. Create a new Render "Web Service", point it at the `backend/` directory
   (set the root directory to `backend` if the repo contains both
   frontend and backend).
3. Build command: `npm install`. Start command: `npm start`.
4. Add all the variables from `.env.example` under Render's "Environment" tab.
   Set `FRONTEND_ORIGIN` to your GitHub Pages origin, e.g.
   `https://daviddchucks-hash.github.io`.
5. Render assigns `PORT` automatically - the app already reads
   `process.env.PORT`, so no change is needed.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/account`
- `GET/POST /api/websites`, `GET/PATCH/DELETE /api/websites/:id`
- `GET/POST /api/forms`, `GET/PATCH/DELETE /api/forms/:id`
- `GET /api/submissions`, `GET/PATCH/DELETE /api/submissions/:id`
- `GET /api/dashboard`
- `POST /api/public/submit/:formId` - public, rate-limited, used by `forms.js`
- `GET /forms.js` - the integration script served to customer websites

All `/api/*` routes except `/api/public/*` require `Authorization: Bearer <token>`.
