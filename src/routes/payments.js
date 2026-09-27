const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { initiateDeposit, handleWebhook, requestWithdrawal } = require('../services/paymentService');

const router = express.Router();

router.post('/deposit', requireAuth, async (req, res, next) => {
  try {
    const { amountCents, method } = req.body;
    if (!amountCents || !method) return res.status(400).json({ error: 'amountCents and method are required' });
    const result = await initiateDeposit({ userId: req.user.id, amountCents, method });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.post('/withdraw', requireAuth, async (req, res, next) => {
  try {
    const { amountCents } = req.body;
    if (!amountCents) return res.status(400).json({ error: 'amountCents is required' });
    const result = await requestWithdrawal({ userId: req.user.id, amountCents });
    res.status(202).json(result);
  } catch (err) { next(err); }
});

// Webhook needs the raw body for signature verification — mounted with
// express.raw() in index.js instead of the global JSON body parser.
router.post('/webhook', async (req, res, next) => {
  try {
    await handleWebhook({
      rawBody: req.body.toString('utf8'),
      signatureHeader: req.headers['x-signature'],
    });
    res.sendStatus(200);
  } catch (err) { next(err); }
});

module.exports = router;
