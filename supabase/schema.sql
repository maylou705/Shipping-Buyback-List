-- ============================================================
-- LIQOA Ship — Supabase Schema
-- ============================================================

-- 出荷テーブル
CREATE TABLE IF NOT EXISTS shipments (
  id              TEXT PRIMARY KEY,
  date            DATE NOT NULL,
  carrier         TEXT NOT NULL CHECK (carrier IN ('FedEx','DHL','ヤマト','UPS','海外代行')),
  pack_no         INTEGER NOT NULL DEFAULT 1,
  domestic        BOOLEAN DEFAULT FALSE,
  order_note      TEXT,
  carry_over      TEXT,
  product_name    TEXT,
  qty             INTEGER DEFAULT 0,
  unit_price      NUMERIC(12,0) DEFAULT 0,
  weight          NUMERIC(8,3) DEFAULT 0,
  total_weight    NUMERIC(8,3) DEFAULT 0,
  tracking_no     TEXT,
  recipient       TEXT,
  agent           TEXT,
  remarks         TEXT,
  send_op         TEXT,
  freight         NUMERIC(12,0) DEFAULT 0,
  amount          NUMERIC(12,0) DEFAULT 0,
  invoice_no      TEXT,
  inventory_note  TEXT,
  chk_liqoa       BOOLEAN DEFAULT FALSE,
  chk_pack        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 入荷テーブル
CREATE TABLE IF NOT EXISTS inbounds (
  id              TEXT PRIMARY KEY,
  date            DATE NOT NULL,
  inb_section     TEXT NOT NULL DEFAULT 'corporate'
                  CHECK (inb_section IN ('corporate','purchase','postal')),
  arrived         BOOLEAN DEFAULT FALSE,
  chk_liqoa       BOOLEAN DEFAULT FALSE,
  company         TEXT,
  product_name    TEXT,
  qty             INTEGER DEFAULT 0,
  unit_price      NUMERIC(12,0) DEFAULT 0,
  amount          NUMERIC(12,0) DEFAULT 0,
  tracking_no     TEXT,
  recore_no       TEXT,
  payment_date    DATE,
  remarks         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_shipments_date    ON shipments(date);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier ON shipments(carrier);
CREATE INDEX IF NOT EXISTS idx_shipments_pack    ON shipments(date, carrier, pack_no);
CREATE INDEX IF NOT EXISTS idx_inbounds_date     ON inbounds(date);
CREATE INDEX IF NOT EXISTS idx_inbounds_section  ON inbounds(inb_section);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ship_upd ON shipments;
DROP TRIGGER IF EXISTS trg_inb_upd  ON inbounds;
CREATE TRIGGER trg_ship_upd BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inb_upd  BEFORE UPDATE ON inbounds  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS（認証ユーザーのみ）
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbounds  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_shipments" ON shipments;
DROP POLICY IF EXISTS "auth_inbounds"  ON inbounds;

CREATE POLICY "auth_shipments" ON shipments FOR ALL
  USING (auth.role() = 'authenticated');
CREATE POLICY "auth_inbounds" ON inbounds FOR ALL
  USING (auth.role() = 'authenticated');
