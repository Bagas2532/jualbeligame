const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { game } = req.query;
    const params = [];
    let query = `SELECT l.id, l.game, l.title, l.price_cents, l.verified, u.full_name AS seller
                 FROM listings l JOIN users u ON u.id = l.seller_id
                 WHERE l.status = 'active'`;
    if (game) {
      params.push(game);
      query += ` AND l.game = $${params.length}`;
    }
    query += ' ORDER BY l.created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { game, title, description, priceCents } = req.body;
    if (!game || !title || !priceCents) {
      return res.status(400).json({ error: 'game, title and priceCents are required' });
    }
    const result = await pool.query(
      `INSERT INTO listings (seller_id, game, title, description, price_cents)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, game, title, price_cents, status`,
      [req.user.id, game, title, description || null, priceCents]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
