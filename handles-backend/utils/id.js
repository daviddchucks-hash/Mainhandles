const { db } = require('../config/firebase');

// Generates a unique push-style key using Firebase's own key generator
// (chronologically ordered, collision resistant) without writing data.
function newId(path) {
  return db.ref(path).push().key;
}

module.exports = { newId };
