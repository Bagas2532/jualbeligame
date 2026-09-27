-- GearVault escrow marketplace schema (PostgreSQL)

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- user | admin
  is_seller_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_cents BIGINT NOT NULL,
  -- account_secret_encrypted holds credentials only after escrow reaches DELIVERED;
  -- encrypted with AES-256-GCM, key never stored in this DB.
  account_secret_encrypted TEXT,
  account_secret_iv TEXT,
  account_secret_tag TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | sold | removed
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'FUNDS_HELD',
  -- FUNDS_HELD -> VERIFYING -> DELIVERED -> CONFIRMED -> RELEASED
  -- can branch to DISPUTED at any point before RELEASED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  transaction_id UUID REFERENCES transactions(id),
  check_type TEXT NOT NULL, -- ownership_email | ban_history | login_challenge
  result TEXT NOT NULL,     -- pass | fail | pending
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  raised_by UUID NOT NULL REFERENCES users(id),
  issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  direction TEXT NOT NULL, -- deposit | withdrawal
  amount_cents BIGINT NOT NULL,
  method TEXT NOT NULL,    -- qris | bank_transfer | gopay | ovo
  gateway_ref TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
