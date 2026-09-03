const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Load env from process.env (Render will provide env vars)
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5500';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Initialize Firebase Admin with service account JSON in env
// Support either raw JSON in FIREBASE_SERVICE_ACCOUNT or base64-encoded JSON.
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DB_URL) {
  console.error('FIREBASE_SERVICE_ACCOUNT or FIREBASE_DB_URL not set. Aborting startup.');
  console.error('Set these environment variables in Render (FIREBASE_SERVICE_ACCOUNT may be the JSON or base64-encoded JSON).');
  process.exit(1);
}

let serviceAccount = null;
try {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
  if (saEnv.startsWith('{')) {
    // raw JSON
    serviceAccount = JSON.parse(saEnv);
  } else {
    // assume base64
    const decoded = Buffer.from(saEnv, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
  }
} catch (e) {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT. Ensure it is valid JSON or base64-encoded JSON.');
  console.error(e && e.message);
  process.exit(1);
}

try {
  // Basic validation for the provided Realtime Database URL to catch common mistakes.
  const dbUrl = (process.env.FIREBASE_DB_URL || '').trim();
  const ok = /(?:firebaseio\.com|firebasedatabase\.app|default-rtdb)/i.test(dbUrl);
  if (!ok) {
    console.error('FIREBASE_DB_URL appears invalid:', dbUrl);
    console.error('It should be the Realtime Database URL from the Firebase console, e.g. https://PROJECT-ID-default-rtdb.firebaseio.com');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: dbUrl
  });
} catch (e) {
  console.error('Failed to initialize Firebase Admin:', e && e.message);
  process.exit(1);
}

const db = admin.database();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: FRONTEND_ORIGIN }));

// Rate limiter for public submission endpoint
const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing authorization header' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid authorization header' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Auth ---
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    // check for existing
    const emailMapRef = db.ref('emailToUid/' + encodeURIComponent(email));
    const snapshot = await emailMapRef.get();
    if (snapshot.exists()) return res.status(400).json({ error: 'Email already in use' });
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const userRef = db.ref('users/' + userId);
    await userRef.set({ email, passwordHash, createdAt: Date.now() });
    await emailMapRef.set(userId);
    const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const emailMapRef = db.ref('emailToUid/' + encodeURIComponent(email));
    const snapshot = await emailMapRef.get();
    if (!snapshot.exists()) return res.status(400).json({ error: 'Invalid credentials' });
    const userId = snapshot.val();
    const userSnapshot = await db.ref('users/' + userId).get();
    if (!userSnapshot.exists()) return res.status(400).json({ error: 'Invalid credentials' });
    const user = userSnapshot.val();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Websites ---
app.post('/api/websites', authMiddleware, async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
  const websiteId = uuidv4();
  const now = Date.now();
  try {
    await db.ref(`users/${req.userId}/websites/${websiteId}`).set({ name, url, createdAt: now });
    await db.ref(`websites/${websiteId}`).set({ userId: req.userId, name, url, createdAt: now });
    res.json({ id: websiteId, name, url, createdAt: now });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/websites', authMiddleware, async (req, res) => {
  try {
    const snap = await db.ref(`users/${req.userId}/websites`).get();
    res.json({ websites: snap.exists() ? snap.val() : {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/websites/:websiteId', authMiddleware, async (req, res) => {
  const { websiteId } = req.params;
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
  try {
    const websiteSnap = await db.ref(`websites/${websiteId}`).get();
    if (!websiteSnap.exists() || websiteSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    await db.ref(`websites/${websiteId}`).update({ name, url });
    await db.ref(`users/${req.userId}/websites/${websiteId}`).update({ name, url });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/websites/:websiteId', authMiddleware, async (req, res) => {
  const { websiteId } = req.params;
  try {
    const websiteSnap = await db.ref(`websites/${websiteId}`).get();
    if (!websiteSnap.exists() || websiteSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    // remove website, its entry under user, and related forms index
    await db.ref(`websites/${websiteId}`).remove();
    await db.ref(`users/${req.userId}/websites/${websiteId}`).remove();
    // optionally remove forms entries (forms are indexed at /forms)
    const formsSnap = await db.ref('forms').orderByChild('websiteId').equalTo(websiteId).get();
    if (formsSnap.exists()){
      const forms = formsSnap.val();
      for (const fid of Object.keys(forms)){
        await db.ref(`forms/${fid}`).remove();
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Forms ---
app.post('/api/websites/:websiteId/forms', authMiddleware, async (req, res) => {
  const { name } = req.body;
  const { websiteId } = req.params;
  if (!name) return res.status(400).json({ error: 'Form name required' });
  const formId = uuidv4();
  const now = Date.now();
  try {
    // confirm website belongs to user
    const websiteSnap = await db.ref(`websites/${websiteId}`).get();
    if (!websiteSnap.exists() || websiteSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    await db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}`).set({ name, enabled: true, createdAt: now });
    await db.ref(`forms/${formId}`).set({ userId: req.userId, websiteId, name, enabled: true, createdAt: now });
    res.json({ id: formId, name, createdAt: now });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/websites/:websiteId/forms', authMiddleware, async (req, res) => {
  const { websiteId } = req.params;
  try {
    const websiteSnap = await db.ref(`websites/${websiteId}`).get();
    if (!websiteSnap.exists() || websiteSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    const snap = await db.ref(`users/${req.userId}/websites/${websiteId}/forms`).get();
    res.json({ forms: snap.exists() ? snap.val() : {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/websites/:websiteId/forms/:formId', authMiddleware, async (req, res) => {
  const { name, enabled } = req.body;
  const { websiteId, formId } = req.params;
  try {
    const formSnap = await db.ref(`forms/${formId}`).get();
    if (!formSnap.exists() || formSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
    await db.ref(`forms/${formId}`).update(updates);
    await db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}`).update(updates);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/websites/:websiteId/forms/:formId', authMiddleware, async (req, res) => {
  const { websiteId, formId } = req.params;
  try {
    const formSnap = await db.ref(`forms/${formId}`).get();
    if (!formSnap.exists() || formSnap.val().userId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    await db.ref(`forms/${formId}`).remove();
    await db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}`).remove();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Submissions inbox ---
app.get('/api/submissions', authMiddleware, async (req, res) => {
  const { websiteId, formId } = req.query;
  try {
    // list by scanning the user's websites/forms
    let baseRef = db.ref(`users/${req.userId}/websites`);
    if (websiteId) baseRef = db.ref(`users/${req.userId}/websites/${websiteId}`);
    const snap = await baseRef.get();
    if (!snap.exists()) return res.json({ submissions: [] });
    const result = [];
    const websites = snap.val();
    const iterate = async (wid, w) => {
      if (!w.forms) return;
      for (const fid of Object.keys(w.forms)) {
        if (formId && fid !== formId) continue;
        const subsSnap = await db.ref(`users/${req.userId}/websites/${wid}/forms/${fid}/submissions`).get();
        if (!subsSnap.exists()) continue;
        const subs = subsSnap.val();
        for (const sid of Object.keys(subs)) {
          result.push({ id: sid, formId: fid, websiteId: wid, ...subs[sid] });
        }
      }
    };
    for (const wid of Object.keys(websites)) {
      await iterate(wid, websites[wid]);
    }
    // sort desc
    result.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ submissions: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/submissions/:websiteId/:formId/:submissionId', authMiddleware, async (req, res) => {
  const { websiteId, formId, submissionId } = req.params;
  try {
    const snap = await db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}/submissions/${submissionId}`).get();
    if (!snap.exists()) return res.status(404).json({ error: 'Not found' });
    res.json({ submission: snap.val() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/submissions/:websiteId/:formId/:submissionId/read', authMiddleware, async (req, res) => {
  const { websiteId, formId, submissionId } = req.params;
  try {
    const ref = db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}/submissions/${submissionId}/read`);
    await ref.set(true);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/submissions/:websiteId/:formId/:submissionId/unread', authMiddleware, async (req, res) => {
  const { websiteId, formId, submissionId } = req.params;
  try {
    const ref = db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}/submissions/${submissionId}/read`);
    await ref.set(false);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search submissions by text across user's submissions (simple full-scan with small dataset expectation)
app.get('/api/submissions/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  try {
    const websitesSnap = await db.ref(`users/${req.userId}/websites`).get();
    if (!websitesSnap.exists()) return res.json({ submissions: [] });
    const result = [];
    const websites = websitesSnap.val();
    for (const wid of Object.keys(websites)){
      const w = websites[wid];
      if (!w.forms) continue;
      for (const fid of Object.keys(w.forms)){
        const subsSnap = await db.ref(`users/${req.userId}/websites/${wid}/forms/${fid}/submissions`).get();
        if (!subsSnap.exists()) continue;
        const subs = subsSnap.val();
        for (const sid of Object.keys(subs)){
          const s = subs[sid];
          const text = JSON.stringify(s.fields).toLowerCase();
          if (!q || text.indexOf(q) !== -1) result.push({ id: sid, formId: fid, websiteId: wid, ...s });
        }
      }
    }
    result.sort((a,b)=>b.createdAt-a.createdAt);
    res.json({ submissions: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/submissions/:websiteId/:formId/:submissionId', authMiddleware, async (req, res) => {
  const { websiteId, formId, submissionId } = req.params;
  try {
    await db.ref(`users/${req.userId}/websites/${websiteId}/forms/${formId}/submissions/${submissionId}`).remove();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Dashboard stats ---
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const websitesSnap = await db.ref(`users/${req.userId}/websites`).get();
    const websites = websitesSnap.exists() ? websitesSnap.val() : {};
    let totalForms = 0;
    let totalSubmissions = 0;
    let unread = 0;
    for (const wid of Object.keys(websites)) {
      const w = websites[wid];
      if (!w.forms) continue;
      totalForms += Object.keys(w.forms).length;
      for (const fid of Object.keys(w.forms)) {
        const subsSnap = await db.ref(`users/${req.userId}/websites/${wid}/forms/${fid}/submissions`).get();
        if (!subsSnap.exists()) continue;
        const subs = subsSnap.val();
        totalSubmissions += Object.keys(subs).length;
        for (const sid of Object.keys(subs)) {
          if (!subs[sid].read) unread++;
        }
      }
    }
    res.json({ totalWebsites: Object.keys(websites).length, totalForms, totalSubmissions, unread });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Public submission endpoint used by integration script ---
app.post('/submit', submitLimiter, async (req, res) => {
  const { formId, fields, origin } = req.body;
  if (!formId || !fields) return res.status(400).json({ error: 'formId and fields required' });
  // simple spam honeypot
  if (fields._honey) return res.status(400).json({ error: 'Spam detected' });
  try {
    const formSnap = await db.ref(`forms/${formId}`).get();
    if (!formSnap.exists()) return res.status(404).json({ error: 'Form not found' });
    const form = formSnap.val();
    if (!form.enabled) return res.status(403).json({ error: 'Form disabled' });
    const submissionId = uuidv4();
    const now = Date.now();
    const submission = { fields, origin: origin || null, createdAt: now, read: false };
    await db.ref(`users/${form.userId}/websites/${form.websiteId}/forms/${formId}/submissions/${submissionId}`).set(submission);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve a small dynamic integration script so customers can use <script src="https://YOUR_DOMAIN/forms.js"></script>
app.get('/forms.js', (req, res) => {
  const apiUrl = process.env.API_URL || `http://localhost:${PORT}`;
  res.set('Content-Type', 'application/javascript');
  res.send(`(function(){
  function send(formId, data){
    try{fetch('${apiUrl.replace(/'/g,'\\\'')}/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:formId,fields:data,origin:location.href})});}catch(e){}
  }
  function serialize(form){
    var obj={};
    new FormData(form).forEach(function(v,k){obj[k]=v});
    return obj;
  }
  function init(){
    var forms=document.querySelectorAll('form[data-handles-form]');
    forms.forEach(function(form){
      var id=form.getAttribute('data-handles-form');
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var data=serialize(form);
        send(id,data);
        // show simple success
        var el=document.createElement('div');
        el.style.padding='10px';el.style.background='#e6ffed';el.style.border='1px solid #b7f2c9';el.style.marginTop='8px';
        el.textContent='Thanks — your message was sent.';
        form.parentNode.insertBefore(el,form.nextSibling);
        form.reset();
      });
    });
  }
  if (document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();`);
});

app.listen(PORT, () => {
  console.log('Handles API running on port', PORT);
});
