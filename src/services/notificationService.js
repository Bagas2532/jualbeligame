const pool = require('../config/db');

// Map<userId, Set<ws>> — in production with multiple server instances,
// back this with Redis pub/sub instead of an in-memory map.
const sockets = new Map();

function registerSocket(userId, ws) {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId).add(ws);
  ws.on('close', () => sockets.get(userId)?.delete(ws));
}

async function notify(userId, title, body) {
  await pool.query(
    'INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)',
    [userId, title, body]
  );

  const payload = JSON.stringify({ type: 'notification', title, body, at: new Date().toISOString() });
  const conns = sockets.get(userId);
  if (conns) {
    for (const ws of conns) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
  // Production upgrade: also send a native push via web-push (VAPID) or FCM
  // here so users get a notification even when the app/browser is closed.
}

module.exports = { registerSocket, notify };
