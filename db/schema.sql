-- Signal Desk ma'lumotlar bazasi (PostgreSQL). Har bir buyruq qayta ishga tushirishga xavfsiz.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS plans (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  price_uzs integer NOT NULL CHECK (price_uzs >= 0),
  days      integer NOT NULL CHECK (days > 0),
  active    boolean NOT NULL DEFAULT true,
  sort      integer NOT NULL DEFAULT 0
);

-- Obuna davri. Faol obuna: now() BETWEEN starts_at AND ends_at.
CREATE TABLE IF NOT EXISTS subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id    text REFERENCES plans(id),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  source     text NOT NULL DEFAULT 'manual', -- manual, payme, click, ...
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id, ends_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id     text NOT NULL REFERENCES plans(id),
  amount_uzs  integer NOT NULL,
  provider    text NOT NULL DEFAULT 'manual',
  external_id text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, created_at DESC);

-- Robot bergan har bir signal: ochiq statistika shu jadvaldan hisoblanadi.
CREATE TABLE IF NOT EXISTS signal_log (
  id          bigserial PRIMARY KEY,
  pair        text NOT NULL,
  category    text NOT NULL,
  timeframe   text NOT NULL,
  side        text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  entry       double precision NOT NULL,
  tp1         double precision NOT NULL,
  tp2         double precision NOT NULL,
  sl          double precision NOT NULL,
  confidence  integer NOT NULL,
  signal_time timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'tp1', 'tp2', 'sl')),
  result_r    double precision,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pair, timeframe, signal_time)
);
CREATE INDEX IF NOT EXISTS signal_log_time_idx ON signal_log(signal_time DESC);

INSERT INTO plans (id, name, price_uzs, days, sort) VALUES
  ('month',   '1 oy',  199000,  30, 1),
  ('quarter', '3 oy',  499000,  90, 2),
  ('year',    '12 oy', 1590000, 365, 3)
ON CONFLICT (id) DO NOTHING;

-- AI operator bilan yozishmalar (limit va admin ko'rishi uchun).
CREATE TABLE IF NOT EXISTS chat_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  client_key text NOT NULL, -- foydalanuvchi id yoki mehmon uchun IP xeshi
  question   text NOT NULL,
  answer     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_log_client_idx ON chat_log(client_key, created_at DESC);

-- Robot monitoringi (admin uchun).
CREATE TABLE IF NOT EXISTS robot_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  trigger     text NOT NULL,          -- cron, server, admin, sahifa
  analyzed    integer NOT NULL,       -- tahlil qilingan juftlik × taymfreym
  failed      integer NOT NULL,
  strong      integer NOT NULL,       -- faol kuchli signallar
  weak        integer NOT NULL,
  errors      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS robot_runs_time_idx ON robot_runs(started_at DESC);

-- Har bir juftlik va taymfreym bo'yicha robotning oxirgi qarori.
CREATE TABLE IF NOT EXISTS robot_state (
  pair       text NOT NULL,
  timeframe  text NOT NULL,
  updated_at timestamptz NOT NULL,
  side       text,
  quality    text,
  status     text,
  confidence integer NOT NULL DEFAULT 0,
  price      double precision,
  reason     text NOT NULL,
  PRIMARY KEY (pair, timeframe)
);

-- Muhim hodisalar: yangi signal, signal yopilishi, narx olinmagan va h.k.
CREATE TABLE IF NOT EXISTS robot_events (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  kind      text NOT NULL,            -- signal, weak, closed, error
  pair      text,
  timeframe text,
  message   text NOT NULL
);
CREATE INDEX IF NOT EXISTS robot_events_time_idx ON robot_events(at DESC);

-- Tarif darajalari: standard, pro va vip.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard';
INSERT INTO plans (id, name, price_uzs, days, sort, tier) VALUES
  ('vip_month',   'VIP 1 oy',  399000,  30, 11, 'vip'),
  ('vip_quarter', 'VIP 3 oy',  999000,  90, 12, 'vip'),
  ('vip_year',    'VIP 12 oy', 2990000, 365, 13, 'vip')
ON CONFLICT (id) DO NOTHING;

-- Robot xotirasi: signal berilgan paytdagi reyting va o'xshash signallarning o'tmishdagi natijasi.
ALTER TABLE signal_log ADD COLUMN IF NOT EXISTS rating text;
ALTER TABLE signal_log ADD COLUMN IF NOT EXISTS memory_n integer;
ALTER TABLE signal_log ADD COLUMN IF NOT EXISTS memory_winrate double precision;

-- Email tasdiqlash: hisob faqat emailga kelgan kod kiritilgach faollashadi.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS email_codes (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_codes_user ON email_codes (user_id, created_at DESC);

-- To'lov USDT'da: foydalanuvchi hamyonga o'tkazadi va tranzaksiya hashini yuboradi, admin tekshiradi.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_usdt numeric(10, 2);
UPDATE plans SET price_usdt = v.p FROM (VALUES
  ('month', 15), ('quarter', 39), ('year', 119),
  ('vip_month', 30), ('vip_quarter', 79), ('vip_year', 229)
) AS v(id, p) WHERE plans.id = v.id AND plans.price_usdt IS NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_usdt numeric(10, 2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS network text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tx_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_tx_hash ON payments (lower(tx_hash)) WHERE tx_hash IS NOT NULL AND status <> 'rejected';

-- PRO: Standart va VIP orasidagi tarif (kuniga 9 tagacha signal).
INSERT INTO plans (id, name, price_uzs, days, sort, tier, price_usdt) VALUES
  ('pro_month',   'PRO 1 oy',  0,  30, 6, 'pro', 22),
  ('pro_quarter', 'PRO 3 oy',  0,  90, 7, 'pro', 59),
  ('pro_year',    'PRO 12 oy', 0, 365, 8, 'pro', 179)
ON CONFLICT (id) DO NOTHING;

-- Robotning demo (virtual) hisobi: har bir A/B signalda o'zi savdoga kiradi. Haqiqiy pul emas.
CREATE TABLE IF NOT EXISTS demo_trades (
  id             bigserial PRIMARY KEY,
  signal_id      bigint NOT NULL UNIQUE REFERENCES signal_log(id) ON DELETE CASCADE,
  pair           text NOT NULL,
  category       text NOT NULL,
  timeframe      text NOT NULL,
  side           text NOT NULL,
  rating         text,
  entry          double precision NOT NULL,
  sl             double precision NOT NULL,
  opened_at      timestamptz NOT NULL,
  balance_before double precision NOT NULL,
  risk_usdt      double precision NOT NULL,
  size           double precision NOT NULL,
  notional       double precision NOT NULL,
  fee            double precision NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  outcome        text,
  result_r       double precision,
  pnl            double precision,
  closed_at      timestamptz,
  balance_after  double precision
);
ALTER TABLE demo_trades ADD COLUMN IF NOT EXISTS tp1 double precision;
ALTER TABLE demo_trades ADD COLUMN IF NOT EXISTS tp2 double precision;
ALTER TABLE demo_trades ADD COLUMN IF NOT EXISTS lots double precision;
CREATE INDEX IF NOT EXISTS demo_trades_closed ON demo_trades (closed_at) WHERE status = 'closed';

-- Admin harakatlari jurnali: kim, qachon, nima qildi.
CREATE TABLE IF NOT EXISTS admin_log (
  id       bigserial PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email    text NOT NULL,
  action   text NOT NULL,
  target   text,
  details  text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log (at DESC);

-- Bozor manzarasi: har juftlik uchun H4, kunlik, haftalik, oylik trend (robot har aylanishda yangilaydi).
CREATE TABLE IF NOT EXISTS market_context (
  pair       text NOT NULL,
  timeframe  text NOT NULL,
  trend      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pair, timeframe)
);

-- Oltin pips rejimi: strategiya ustuni, kun oxirida yopilish holati ("close").
ALTER TABLE signal_log ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'trend';
ALTER TABLE signal_log DROP CONSTRAINT IF EXISTS signal_log_pair_timeframe_signal_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS signal_log_key ON signal_log (pair, timeframe, signal_time, strategy);
ALTER TABLE signal_log DROP CONSTRAINT IF EXISTS signal_log_status_check;
ALTER TABLE signal_log ADD CONSTRAINT signal_log_status_check CHECK (status IN ('active', 'tp1', 'tp2', 'sl', 'close'));
ALTER TABLE demo_trades ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'trend';

-- Bozorlar sinovi: har bir valyuta va kripto juftligining so'nggi ~60 kunlik tarixiy natijasi (haftada bir yangilanadi).
CREATE TABLE IF NOT EXISTS market_test (
  id     serial PRIMARY KEY,
  at     timestamptz NOT NULL DEFAULT now(),
  rows   jsonb NOT NULL,
  errors text NOT NULL DEFAULT ''
);

-- AI treyder (faqat demo): har soatdagi qaror (BUY/SELL/WAIT), darajalari, sababi va natijasi (R).
CREATE TABLE IF NOT EXISTS ai_trades (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  pair       text NOT NULL,
  action     text NOT NULL,
  status     text NOT NULL,
  entry      double precision,
  sl         double precision,
  tp1        double precision,
  tp2        double precision,
  confidence int NOT NULL DEFAULT 0,
  reason     text NOT NULL DEFAULT '',
  note       text NOT NULL DEFAULT '',
  model      text NOT NULL DEFAULT '',
  tp1_hit    boolean NOT NULL DEFAULT false,
  result_r   double precision,
  closed_at  timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_trades_at ON ai_trades (at DESC);
CREATE INDEX IF NOT EXISTS ai_trades_open ON ai_trades (status) WHERE status IN ('open', 'tp1');

-- Oylik tariflar (2026-10, Bek "o'zing halol qo'y" dedi): jonli natija hali yig'ilmagan, shuning uchun boshlang'ich narx past.
-- Kamida 3 oylik jonli natija foydali chiqqach oshiriladi. Uzoq muddatli tariflar sotuvdan olinadi.
UPDATE plans SET name = 'Standart · 1 oy', price_usdt = 19, sort = 1, active = true WHERE id = 'month';
UPDATE plans SET name = 'PRO · 1 oy', price_usdt = 39, sort = 2, active = true WHERE id = 'pro_month';
UPDATE plans SET name = 'VIP · 1 oy', price_usdt = 79, sort = 3, active = true WHERE id = 'vip_month';
UPDATE plans SET active = false WHERE id IN ('quarter', 'year', 'pro_quarter', 'pro_year', 'vip_quarter', 'vip_year');
