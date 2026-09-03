const admin = require('firebase-admin');

// Initialize Firebase Admin SDK from environment variables.
// Preferred: set FIREBASE_SERVICE_ACCOUNT to the full service account JSON
// (stringified) in Render's Environment tab. Fallback: use individual
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL.

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const obj = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return {
        projectId: obj.project_id || obj.projectId,
        clientEmail: obj.client_email || obj.clientEmail,
        privateKey: obj.private_key || obj.privateKey
      };
    } catch (err) {
      // fallthrough to individual env vars
    }
  }

  // Handle private key newlines
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey
  };
}

if (!admin.apps.length) {
  const serviceAccount = loadServiceAccount();

  if (!serviceAccount || !serviceAccount.projectId) {
    throw new Error('Firebase service account is not configured. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

module.exports = { admin, db };
