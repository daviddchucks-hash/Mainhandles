const admin = require('firebase-admin');

// Firebase Admin SDK is initialized from environment variables only.
// Never commit real credentials to the repository - use .env locally and
// the Render dashboard's "Environment" tab in production.
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

module.exports = { admin, db };
