const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard - aggregate stats, computed live from real data.
router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId;

    const [websitesSnap, formsSnap, submissionsSnap] = await Promise.all([
      db.ref('websites').orderByChild('userId').equalTo(userId).get(),
      db.ref('forms').orderByChild('userId').equalTo(userId).get(),
      db.ref('submissions').orderByChild('userId').equalTo(userId).get()
    ]);

    let totalWebsites = 0;
    websitesSnap.forEach(() => { totalWebsites++; });

    let totalForms = 0;
    formsSnap.forEach(() => { totalForms++; });

    const submissions = [];
    submissionsSnap.forEach((child) => submissions.push({ id: child.key, ...child.val() }));

    const totalSubmissions = submissions.length;
    const unreadSubmissions = submissions.filter((s) => !s.read).length;

    submissions.sort((a, b) => b.createdAt - a.createdAt);
    const recentSubmissions = submissions.slice(0, 8);

    res.json({
      stats: {
        totalWebsites,
        totalForms,
        totalSubmissions,
        unreadSubmissions
      },
      recentSubmissions
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
