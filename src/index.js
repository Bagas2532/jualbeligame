require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const listingsRoutes = require('./routes/listings');
const transactionsRoutes = require('./routes/transactions');
const paymentsRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const { registerSocket } = require('./services/notificationService');
const { AppError } = require('./services/escrowService');

const app = express();
app.use(cors());

// Webhook route needs the raw request body for HMAC signature verification,
// so it's registered before the global JSON parser and given its own raw parser.
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/listings', listingsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);

// Centralized error handler — AppError carries an intentional status code,
// anything else is treated as an unexpected 500 and logged server-side only.
app.use((err, req, res, next) => {
  if (err instanceof AppError || err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);

// Real-time push channel: client connects to wss://.../ws?token=<jwt>
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    registerSocket(payload.id, ws);
  } catch (err) {
    ws.close(4001, 'Invalid token');
  }
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`GearVault API listening on :${port}`));
