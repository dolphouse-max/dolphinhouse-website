-- D1 initial schema for Dolphin House
-- Create core tables: inventory, bookings, availability_overrides, precheckin

-- Rooms inventory (base quantities and default rates)
CREATE TABLE IF NOT EXISTS inventory (
  room TEXT PRIMARY KEY,
  label TEXT,
  qty INTEGER,
  rateNonAC INTEGER,
  rateAC INTEGER,
  occupancy INTEGER,
  extraPerson INTEGER
);

-- Customer bookings
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  room TEXT NOT NULL,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL DEFAULT 2,
  nights INTEGER NOT NULL DEFAULT 1,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'payment_pending',
  created_at TEXT NOT NULL
);

-- Per-day overrides from Monthly Availability Editor
CREATE TABLE IF NOT EXISTS availability_overrides (
  room TEXT NOT NULL,
  date TEXT NOT NULL,
  available INTEGER NOT NULL,
  rateNonAC REAL,
  rateAC REAL,
  PRIMARY KEY (room, date)
);

-- Pre-checkin details (basic schema; columns may be extended later)
CREATE TABLE IF NOT EXISTS precheckin (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  guest_name TEXT,
  phone_e164 TEXT,
  email TEXT,
  checkin_date TEXT,
  checkout_date TEXT,
  adults INTEGER,
  children INTEGER,
  arrival_time TEXT,
  special_requests TEXT,
  whatsapp_opt_in INTEGER,
  created_at TEXT
);