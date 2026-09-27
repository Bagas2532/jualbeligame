const pool = require('../config/db');
const { runVerification } = require('./verificationService');
const { notify } = require('./notificationService');

const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 5);

// Creates a transaction, moves buyer funds into escrow (held, not yet paid to seller),
// then kicks off automated verification. All balance mutations happen inside one
// DB transaction so a buyer can never be debited without a matching escrow record.
async function createEscrow({ listingId, buyerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const listingRes = await client.query(
      'SELECT * FROM listings WHERE id = $1 AND status = $2 FOR UPDATE',
      [listingId, 'active']
    );
    const listing = listingRes.rows[0];
    if (!listing) throw new AppError(404, 'Listing not found or already sold');

    const walletRes = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [buyerId]
    );
    const wallet = walletRes.rows[0];
    if (!wallet || wallet.balance_cents < listing.price_cents) {
      throw new AppError(400, 'Insufficient balance');
    }

    const fee = Math.round(listing.price_cents * (FEE_PERCENT / 100));

    await client.query(
      'UPDATE wallets SET balance_cents = balance_cents - $1, updated_at = now() WHERE user_id = $2',
      [listing.price_cents, buyerId]
    );
    await client.query('UPDATE listings SET status = $1 WHERE id = $2', ['sold', listingId]);

    const txRes = await client.query(
      `INSERT INTO transactions (listing_id, buyer_id, seller_id, amount_cents, fee_cents, status)
       VALUES ($1, $2, $3, $4, $5, 'FUNDS_HELD') RETURNING *`,
      [listingId, buyerId, listing.seller_id, listing.price_cents, fee]
    );
    const tx = txRes.rows[0];

    await client.query(
      'INSERT INTO transaction_events (transaction_id, status, note) VALUES ($1, $2, $3)',
      [tx.id, 'FUNDS_HELD', 'Buyer funds moved into escrow']
    );

    await client.query('COMMIT');

    await notify(listing.seller_id, 'Ada pembeli baru', `Dana untuk "${listing.title}" sudah ditahan di rekening bersama. Kirim data akun sekarang.`);
    await notify(buyerId, 'Pembayaran ditahan', `Dana kamu ditahan aman sampai akun terverifikasi.`);

    // Fire-and-forget: don't block the API response on verification checks
    advanceToVerifying(tx.id, listingId).catch((err) => console.error('verification failed', err));

    return tx;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function advanceToVerifying(transactionId, listingId) {
  await pool.query('UPDATE transactions SET status = $1, updated_at = now() WHERE id = $2', ['VERIFYING', transactionId]);
  await pool.query('INSERT INTO transaction_events (transaction_id, status) VALUES ($1, $2)', [transactionId, 'VERIFYING']);

  const outcome = await runVerification(listingId, transactionId);

  const tx = (await pool.query('SELECT * FROM transactions WHERE id = $1', [transactionId])).rows[0];

  if (!outcome.passed) {
    await pool.query('UPDATE transactions SET status = $1, updated_at = now() WHERE id = $2', ['DISPUTED', transactionId]);
    await pool.query('INSERT INTO transaction_events (transaction_id, status, note) VALUES ($1, $2, $3)',
      [transactionId, 'DISPUTED', 'Automated verification failed, escalated to manual review']);
    await notify(tx.buyer_id, 'Verifikasi gagal', 'Transaksi dieskalasi ke tim untuk peninjauan manual.');
    return;
  }

  await pool.query('UPDATE transactions SET status = $1, updated_at = now() WHERE id = $2', ['DELIVERED', transactionId]);
  await pool.query('INSERT INTO transaction_events (transaction_id, status) VALUES ($1, $2)', [transactionId, 'DELIVERED']);
  await notify(tx.buyer_id, 'Akun terverifikasi', 'Data akun sudah bisa diambil. Konfirmasi penerimaan untuk mencairkan dana ke penjual.');
}

// Buyer confirms they can access the account; releases funds to seller.
async function confirmAndRelease({ transactionId, buyerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
    const tx = txRes.rows[0];
    if (!tx) throw new AppError(404, 'Transaction not found');
    if (tx.buyer_id !== buyerId) throw new AppError(403, 'Not your transaction');
    if (tx.status !== 'DELIVERED') throw new AppError(400, `Cannot release funds from status ${tx.status}`);

    const payout = tx.amount_cents - tx.fee_cents;
    await client.query(
      'UPDATE wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE user_id = $2',
      [payout, tx.seller_id]
    );
    await client.query('UPDATE transactions SET status = $1, updated_at = now() WHERE id = $2', ['RELEASED', transactionId]);
    await client.query('INSERT INTO transaction_events (transaction_id, status, note) VALUES ($1, $2, $3)',
      [transactionId, 'RELEASED', 'Buyer confirmed, funds released to seller']);

    await client.query('COMMIT');

    await notify(tx.seller_id, 'Dana dicairkan', `Pembeli mengonfirmasi, dana sebesar Rp ${payout} sudah masuk ke saldo kamu.`);
    return tx;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function raiseDispute({ transactionId, userId, issue }) {
  const tx = (await pool.query('SELECT * FROM transactions WHERE id = $1', [transactionId])).rows[0];
  if (!tx) throw new AppError(404, 'Transaction not found');
  if (![tx.buyer_id, tx.seller_id].includes(userId)) throw new AppError(403, 'Not part of this transaction');
  if (tx.status === 'RELEASED') throw new AppError(400, 'Transaction already completed, cannot dispute');

  await pool.query('UPDATE transactions SET status = $1, updated_at = now() WHERE id = $2', ['DISPUTED', transactionId]);
  await pool.query('INSERT INTO complaints (transaction_id, raised_by, issue) VALUES ($1, $2, $3)', [transactionId, userId, issue]);
  await pool.query('INSERT INTO transaction_events (transaction_id, status, note) VALUES ($1, $2, $3)', [transactionId, 'DISPUTED', issue]);
}

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { createEscrow, confirmAndRelease, raiseDispute, AppError };
