# GearVault Backend

Backend escrow untuk marketplace akun game yang memang boleh diperjualbelikan
sesuai EULA publisher-nya (mis. Steam, sebagian game yang mengizinkan transfer akun).
Melengkapi prototype frontend (`gearvault.html`) dengan logika nyata.

## Yang tersedia
- Skema database (`db/schema.sql`): users, wallets, listings, transactions,
  verifications, complaints, payments, notifications.
- Alur escrow (`src/services/escrowService.js`): dana ditahan → verifikasi
  otomatis → terkirim → dikonfirmasi pembeli → dana cair ke penjual, dengan
  jalur dispute di tiap tahap. Semua perubahan saldo jalan dalam DB transaction
  supaya tidak ada saldo yang "hilang" kalau ada error di tengah proses.
- Verifikasi otomatis (`src/services/verificationService.js`): kerangka untuk
  cek kepemilikan email, riwayat ban, dan login challenge — isi placeholder-nya
  dengan API resmi tiap game/publisher.
- Payment gateway (`src/services/paymentService.js`): pola integrasi ke gateway
  lokal (dicontohkan gaya Midtrans — QRIS/VA/e-wallet), termasuk verifikasi
  signature webhook dan alur penarikan saldo.
- Enkripsi (`src/utils/crypto.js`): AES-256-GCM untuk data kredensial akun yang
  disimpan sementara selama proses serah terima.
- Notifikasi real-time (`src/services/notificationService.js`) via WebSocket;
  untuk push notification ke HP saat app tertutup, tambahkan web-push (VAPID)
  atau FCM di titik yang sama.
- Dashboard admin (`src/routes/admin.js`): statistik, daftar transaksi live,
  daftar & penyelesaian keluhan.

## Menjalankan secara lokal

```bash
cp .env.example .env
# isi DATABASE_URL, JWT_SECRET, dan ACCOUNT_SECRET_KEY_BASE64
# generate key 32-byte: openssl rand -base64 32

npm install
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

Server jalan di `http://localhost:4000`, WebSocket notifikasi di
`ws://localhost:4000/ws?token=<jwt>`.

## Endpoint utama

| Method | Path | Keterangan |
|---|---|---|
| GET | /api/listings | Daftar akun aktif |
| POST | /api/listings | Buat listing baru (seller) |
| POST | /api/transactions | Mulai escrow (buyer beli listing) |
| GET | /api/transactions/mine | Transaksi milik user login |
| POST | /api/transactions/:id/confirm | Konfirmasi terima akun → cairkan dana |
| POST | /api/transactions/:id/dispute | Ajukan keluhan/dispute |
| POST | /api/payments/deposit | Mulai deposit saldo |
| POST | /api/payments/withdraw | Ajukan penarikan saldo |
| POST | /api/payments/webhook | Callback gateway (perlu signature valid) |
| GET | /api/admin/stats | Statistik untuk dashboard admin |
| GET | /api/admin/transactions | Semua transaksi (admin) |
| GET/POST | /api/admin/complaints | Kelola keluhan (admin) |

## Yang wajib disesuaikan sebelum produksi

1. **Autentikasi**: belum ada endpoint register/login di skeleton ini — tambahkan
   dengan bcrypt untuk hash password lalu keluarkan JWT berisi `{ id, role }`.
2. **Verifikasi akun nyata**: ganti placeholder di `verificationService.js`
   dengan pemanggilan API resmi tiap game/publisher, atau alur manual review
   oleh tim jika API resmi tidak tersedia.
3. **Payment gateway**: ganti `createChargeRequest` dan format payload webhook
   sesuai dokumentasi gateway pilihan (Midtrans, Xendit, dll) — setiap gateway
   punya nama field dan skema signature berbeda.
4. **Rate limiting & audit log** pada endpoint sensitif (deposit, withdraw,
   confirm) untuk mencegah penyalahgunaan.
5. **Kepatuhan hukum**: pastikan tiap game yang terdaftar memang mengizinkan
   transfer akun sesuai ToS/EULA masing-masing publisher, dan sertakan
   kebijakan privasi + syarat & ketentuan yang jelas untuk pengguna.
# jualbeligame
