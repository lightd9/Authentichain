-- Organizations (manufacturers, suppliers, retailers)
CREATE TABLE IF NOT EXISTS organizations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL CHECK (role IN ('manufacturer', 'supplier', 'retailer')),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Registered wallets linked to organizations
CREATE TABLE IF NOT EXISTS wallets (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address         VARCHAR(42) UNIQUE NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER UNIQUE NOT NULL,   -- on-chain product ID
  name            VARCHAR(255) NOT NULL,
  sku             VARCHAR(255) NOT NULL,
  batch_number    VARCHAR(255) NOT NULL,
  expiry_date     DATE,
  metadata_hash   VARCHAR(66) NOT NULL,      -- bytes32 hex
  tx_hash         VARCHAR(66),               -- registration tx
  qr_code         TEXT,                      -- base64 QR image
  manufacturer_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Transfer log (mirrors on-chain events with extra metadata)
CREATE TABLE IF NOT EXISTS transfers (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(product_id),
  from_org_id     INTEGER REFERENCES organizations(id),
  to_org_id       INTEGER NOT NULL REFERENCES organizations(id),
  from_wallet     VARCHAR(42),
  to_wallet       VARCHAR(42) NOT NULL,
  tx_hash         VARCHAR(66),
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  ip_address      VARCHAR(45),
  created_at      TIMESTAMP DEFAULT NOW()
);