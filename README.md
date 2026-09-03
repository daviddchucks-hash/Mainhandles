# Handles

Minimal Handles SaaS scaffold (Frontend: static HTML/CSS/JS; Backend: Node.js + Express; DB: Firebase Realtime Database)

Quick start (local):

1. Copy `.env.example` to `.env` and fill in values (especially `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_DB_URL`).
2. Install dependencies:

```
npm install
```

3. Run:

```
node server.js
```

Deploy notes:

- Frontend (GitHub Pages):
	- Push the repository (public files) to GitHub and enable Pages for the branch (usually `gh-pages` or `main`). Ensure `index.html` is at the repo root or configured publishing folder. The public frontend URL will be `https://USERNAME.github.io/REPO/` (for this project: `https://daviddchucks-hash.github.io/Handles/`).

- Backend (Render):
	- Create a new Web Service on Render pointing at this repo. Set the Build Command to `npm install` and the Start Command to `npm start`.
	- Add these environment variables in Render's dashboard:
		- `FIREBASE_SERVICE_ACCOUNT` — the entire service account JSON (stringified). Do NOT commit this to the repo.
		- `FIREBASE_DB_URL` — your Firebase Realtime Database URL.
		- `JWT_SECRET` — a secure random string.
		- `FRONTEND_ORIGIN` — `https://daviddchucks-hash.github.io/Handles` (or your frontend URL).
		- `API_URL` — `https://new-handles.onrender.com` (Render service URL).

Security & operation notes:

- Keep `FIREBASE_SERVICE_ACCOUNT` secret and never expose it to the browser. The backend uses Firebase Admin SDK only.
- The public integration endpoint `/submit` does not require authentication but verifies the `formId` exists and associates the submission with the right user/website.
- Rate limiting is enabled on `/submit` to mitigate abuse. There is a lightweight honeypot check (`_honey`).
- All dashboard routes require JWT authentication. Tokens are issued on login/register. Rotate `JWT_SECRET` in production if needed.

Integration script:

- The server exposes a dynamic `GET /forms.js` which injects the correct backend `API_URL` so customers can include:

```html
<script src="https://new-handles.onrender.com/forms.js"></script>
<form data-handles-form="FORM_ID"> ... </form>
```

Or they can host a static `assets/js/integration.js` and configure `window.HANDLES_API_URL` to the API URL.

Local testing:

```bash
npm install
node server.js
```
Render environment notes:

- On Render, add `FIREBASE_SERVICE_ACCOUNT` as a secret environment variable. You can either paste the raw JSON (all on one line) or base64-encode the JSON and paste the base64 string. The server accepts both formats.

	To base64-encode on macOS / Linux:

	```bash
	cat service-account.json | base64 | pbcopy
	# paste into Render's FIREBASE_SERVICE_ACCOUNT value
	```

	To base64-encode on Windows (PowerShell):

	```powershell
	[Convert]::ToBase64String([IO.File]::ReadAllBytes('service-account.json')) | clip
	# paste into Render's FIREBASE_SERVICE_ACCOUNT value
	```

	Ensure `FIREBASE_DB_URL` is set to your Realtime Database URL (e.g. `https://your-project.firebaseio.com`).


Then open `index.html` in a browser (or use a simple static server such as `npx http-server` in the project folder) and set the API URL to your local server if needed.

