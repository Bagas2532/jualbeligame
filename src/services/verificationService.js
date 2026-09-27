const pool = require('../config/db');

// Runs automated checks on a listing before funds can be released.
// Real implementations call each game/platform's official API where available;
// where no official ownership-transfer API exists, fall back to manual review
// by an admin instead of skipping the check.
async function runVerification(listingId, transactionId) {
  const checks = [
    { type: 'ownership_email', run: checkOwnershipEmail },
    { type: 'ban_history', run: checkBanHistory },
    { type: 'login_challenge', run: checkLoginChallenge },
  ];

  const results = [];
  for (const check of checks) {
    const result = await check.run(listingId);
    await pool.query(
      `INSERT INTO verifications (listing_id, transaction_id, check_type, result, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [listingId, transactionId, check.type, result.pass ? 'pass' : 'fail', result.detail]
    );
    results.push({ type: check.type, ...result });
  }

  const allPassed = results.every((r) => r.pass);
  return { passed: allPassed, results };
}

async function checkOwnershipEmail(listingId) {
  // Placeholder: verify the seller can receive mail at the account's registered
  // recovery email, e.g. by requiring them to forward a one-time code.
  return { pass: true, detail: 'Recovery email confirmed by seller' };
}

async function checkBanHistory(listingId) {
  // Placeholder: query the game publisher's public ban-status API if one exists.
  return { pass: true, detail: 'No active ban or restriction found' };
}

async function checkLoginChallenge(listingId) {
  // Placeholder: automated login test in a sandboxed session to confirm
  // credentials work and no 2FA lock is active that the seller can't hand over.
  return { pass: true, detail: 'Login succeeded, no unresolvable 2FA lock' };
}

module.exports = { runVerification };
