require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const websiteRoutes = require('./routes/websites');
const formRoutes = require('./routes/forms');
const submissionRoutes = require('./routes/submissions');
const dashboardRoutes = require('./routes/dashboard');
const publicSubmitRoutes = require('./routes/publicSubmit');
const developerApiRoutes = require('./routes/developerApi');
const apiKeyRoutes = require('./routes/apiKeys');
const webhookRoutes = require('./routes/webhooks');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Fail fast with a clear message if required config is missing, rather than
// crashing deep inside firebase-admin with a confusing stack trace.
const REQUIRED_ENV = [
  'JWT_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_DATABASE_URL'
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in real values before starting the server.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // needed on Render so req.ip / rate-limit see the real client IP

// Keep the two known production frontend origins available even if Render
// still has the older FRONTEND_ORIGIN value. Extra staging origins can still
// be supplied through FRONTEND_ORIGIN as a comma-separated list.
const defaultFrontendOrigins = [
  'https://mainhandles.pages.dev',
  'https://daviddchucks-hash.github.io'
];
const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultFrontendOrigins, ...configuredOrigins])];

// Authenticated dashboard API: locked down to the known frontend origin(s).
const dashboardCors = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: false
});

// Public submission API + integration script: must work from ANY customer
// website, so it is intentionally open. It never touches auth cookies/tokens.
const openCors = cors({ origin: true });

app.use(express.json({ limit: '256kb' }));

app.get('/', (req, res) => {
  res.json({ name: 'Handles API', status: 'ok' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

// Public, unauthenticated routes (used by the embed script on customer sites)
app.use('/api/public', openCors, publicSubmitRoutes);
app.use('/api/v1', developerApiRoutes);

// The integration script customers embed with <script src=".../forms.js">
app.get('/forms.js', openCors, (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'public', 'forms.js'));
});

// Authenticated dashboard routes (used only by the Handles frontend)
app.use('/api/auth', dashboardCors, authRoutes);
app.use('/api/websites', dashboardCors, websiteRoutes);
app.use('/api/forms', dashboardCors, formRoutes);
app.use('/api/submissions', dashboardCors, submissionRoutes);
app.use('/api/dashboard', dashboardCors, dashboardRoutes);
app.use('/api/api-keys', dashboardCors, apiKeyRoutes);
app.use('/api/webhooks', dashboardCors, webhookRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Handles API listening on port ${PORT}`);
});