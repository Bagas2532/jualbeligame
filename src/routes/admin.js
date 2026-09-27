const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', async (req, res, next) => {
  try {
    const [active, gmv, complaints, verified] = await Promise.all([
      pool.query("SELECT count(*) FROM transactions WHERE status NOT IN ('RELEASED')"),
      pool.query("SELECT coalesce(sum(amount_cents),0) AS total FROM transactions WHERE status = 'RELEASED'"),
      pool.query("SELECT count(*) FROM complaints WHERE status = 'open'"),
      pool.query("SELECT count(*) FILTER (WHERE verified) AS verified, count(*) AS total FROM listings"),
    ]);
    res.json({
      activeTransactions: Number(active.rows[0].count),
      totalReleasedCents: Number(gmv.rows[0].total),
      openComplaints: Number(complaints.rows[0].count),
      verifiedListings: Number(verified.rows[0].verified),
      totalListings: Number(verified.rows[0].total),
    });
  } catch (err) { next(err); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*, l.title FROM transactions t JOIN listings l ON l.id = t.listing_id
       ORDER BY t.updated_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/complaints', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, t.listing_id, u.full_name AS raised_by_name
       FROM complaints c
       JOIN transactions t ON t.id = c.transaction_id
       JOIN users u ON u.id = c.raised_by
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/complaints/:id/resolve', async (req, res, next) => {
  try {
    await pool.query("UPDATE complaints SET status = 'resolved', resolved_at = now() WHERE id = $1", [req.params.id]);
    res.sendStatus(200);
  } catch (err) { next(err); }
});

module.exports = router;
