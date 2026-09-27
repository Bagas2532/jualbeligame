const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { createEscrow, confirmAndRelease, raiseDispute, AppError } = require('../services/escrowService');

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'listingId is required' });
    const tx = await createEscrow({ listingId, buyerId: req.user.id });
    res.status(201).json(tx);
  } catch (err) { next(err); }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*, l.title FROM transactions t
       JOIN listings l ON l.id = t.listing_id
       WHERE t.buyer_id = $1 OR t.seller_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:id/confirm', requireAuth, async (req, res, next) => {
  try {
    const tx = await confirmAndRelease({ transactionId: req.params.id, buyerId: req.user.id });
    res.json(tx);
  } catch (err) { next(err); }
});

router.post('/:id/dispute', requireAuth, async (req, res, next) => {
  try {
    const { issue } = req.body;
    if (!issue) return res.status(400).json({ error: 'issue is required' });
    await raiseDispute({ transactionId: req.params.id, userId: req.user.id, issue });
    res.status(202).json({ status: 'disputed' });
  } catch (err) { next(err); }
});

module.exports = router;
