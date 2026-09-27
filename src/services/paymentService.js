const crypto = require('crypto');
const pool = require('../config/db');
const { safeEqual } = require('../utils/crypto');
const { notify } = require('./notificationService');

// Example integration shaped for Midtrans-style local payment gateways
// (QRIS, virtual account, e-wallets). Swap createChargeRequest / verifySignature
// for the specific gateway's SDK if you use a different provider (Xendit, etc).

async function initiateDeposit({ userId, amountCents, method }) {
  const gatewayRef = 'DEP-' + crypto.randomUUID();

  await pool.query(
    `INSERT INTO payments (user_id, direction, amount_cents, method, gateway_ref, status)
     VALUES ($1, 'deposit', $2, $3, $4, 'pending')`,
    [userId, amountCents, method, gatewayRef]
  );

  // In production: call the gateway's charge API here and return
  // whatever the client needs to complete payment (QR string, VA number, deep link).
  const chargeInstruction = await createChargeRequest({ gatewayRef, amountCents, method });

  return { gatewayRef, ...chargeInstruction };
}

async function createChargeRequest({ gatewayRef, amountCents, method }) {
  // Placeholder for the real gateway call, e.g.:
  // const res = await fetch('https://api.midtrans.com/v2/charge', { ... });
  if (method === 'qris') {
    return { qrString: `MOCK-QRIS-${gatewayRef}`, expiresInSeconds: 900 };
  }
  return { vaNumber: `88808${Math.floor(Math.random() * 1e8)}`, bank: 'bca', expiresInSeconds: 3600 };
}

// Called by the payment gateway's webhook after a payment settles.
// Verifies the signature before trusting any of the payload.
async function handleWebhook({ rawBody, signatureHeader }) {
  const expected = crypto
    .createHmac('sha512', process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!safeEqual(expected, signatureHeader)) {
    const err = new Error('Invalid webhook signature');
    err.statusCode = 401;
    throw err;
  }

  const payload = JSON.parse(rawBody);
  const { gatewayRef, status } = payload; // shape depends on gateway; adapt as needed

  const paymentRes = await pool.query('SELECT * FROM payments WHERE gateway_ref = $1', [gatewayRef]);
  const payment = paymentRes.rows[0];
  if (!payment || payment.status !== 'pending') return; // already processed or unknown ref

  if (status === 'settlement' || status === 'success') {
    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE payments SET status = $1 WHERE id = $2', ['success', payment.id]);
      await pool.query(
        'UPDATE wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE user_id = $2',
        [payment.amount_cents, payment.user_id]
      );
      await pool.query('COMMIT');
      await notify(payment.user_id, 'Deposit berhasil', `Saldo kamu bertambah Rp ${payment.amount_cents / 100}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } else if (status === 'failure' || status === 'expire') {
    await pool.query('UPDATE payments SET status = $1 WHERE id = $2', ['failed', payment.id]);
  }
}

async function requestWithdrawal({ userId, amountCents }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = walletRes.rows[0];
    if (!wallet || wallet.balance_cents < amountCents) {
      const err = new Error('Insufficient balance');
      err.statusCode = 400;
      throw err;
    }

    await client.query('UPDATE wallets SET balance_cents = balance_cents - $1, updated_at = now() WHERE user_id = $2', [amountCents, userId]);
    const gatewayRef = 'WD-' + crypto.randomUUID();
    await client.query(
      `INSERT INTO payments (user_id, direction, amount_cents, method, gateway_ref, status)
       VALUES ($1, 'withdrawal', $2, 'bank_transfer', $3, 'pending')`,
      [userId, amountCents, gatewayRef]
    );
    await client.query('COMMIT');

    // In production: call the gateway's disbursement/payout API here.
    return { gatewayRef, status: 'processing' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initiateDeposit, handleWebhook, requestWithdrawal };
