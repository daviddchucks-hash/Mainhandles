# Mainhandles (Handles frontend)

Static HTML/CSS/vanilla-JS frontend for Handles. Deployed as a GitHub Pages
**project site** at:

https://daviddchucks-hash.github.io/Mainhandles/

## Deploying

This folder's contents go at the **root of the `Mainhandles` repository** —
`index.html` must sit at the repo root (or in `/docs`, see below), because
GitHub Pages project sites serve from one of those two locations.

1. Create a GitHub repo named `Mainhandles` under the `daviddchucks-hash` account
   (the name must match exactly — it's what forms the `/Mainhandles/` URL path).
2. Push everything in this folder to the repo's root:
   ```bash
   git init
   git add .
   git commit -m "Deploy Handles frontend"
   git branch -M main
   git remote add origin https://github.com/daviddchucks-hash/Mainhandles.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source** = "Deploy
   from a branch", **Branch** = `main`, folder = `/ (root)`. Save.
4. GitHub Pages will publish at `https://daviddchucks-hash.github.io/Mainhandles/`
   within a minute or two — `index.html` at the root is what makes that URL
   resolve automatically.

(If you'd rather keep this frontend in a subfolder of a larger monorepo,
you can instead set the Pages folder to `/docs` and put these files inside
a `docs/` directory in your repo — everything here uses relative links, so
either layout works without changes.)

## Files

- `.nojekyll` — tells GitHub Pages to skip Jekyll processing, since this is
  a plain static site (also avoids issues with files/folders starting with `_`).
- `index.html` — landing page (the `#get-started` anchor on the hero section
  matches the link you shared).
- `login.html`, `register.html` — auth pages.
- `dashboard.html`, `websites.html`, `forms.html`, `submissions.html`,
  `settings.html` — the authenticated app, guarded client-side by
  `js/nav.js`'s `requireLogin()`.
- `demo.html` — a stand-in customer page for testing the embed script.
- `404.html` — GitHub Pages automatically serves this for unmatched routes.
- `css/styles.css` — all styling.
- `js/api.js` — **the only place the backend URL is configured**
  (`API_BASE_URL`). Change this one constant if you move the backend off
  `https://mainhandles.onrender.com`.
- `js/nav.js` — shared auth-guard, sidebar, toast, and formatting helpers.
- `js/dashboard.js`, `js/websites.js`, `js/forms.js`, `js/submissions.js`,
  `js/settings.js` — one file per page.

Every internal link and asset reference is relative, so the site works
correctly whether it's served at the domain root or under `/Mainhandles/`.

## Form integration

The Forms page generates a complete example using the exact field names and
types saved for that form. Copy that example instead of replacing it with
generic `name`, `email`, and `message` fields: the API accepts the configured
field names so submissions are stored against the correct form.

Each website also receives its own script URL, for example:

```html
<script src="https://mainhandles.onrender.com/forms.js?websiteId=YOUR_WEBSITE_ID"></script>
```

The `websiteId` is intentionally different for every website. The
`data-handles-form` value remains unique per form.

## Backend

This repo is frontend-only. The API (Node/Express + Firebase) deploys
separately to Render — see the `handles-backend` project for that, and its
README for Render deployment steps.
