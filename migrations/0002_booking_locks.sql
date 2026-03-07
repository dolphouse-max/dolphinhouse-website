-- Add temporary booking locks and improve booking system
-- Add booking locks table for 5-minute temporary lock mechanism
CREATE TABLE IF NOT EXISTS booking_locks (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL,
  rooms_requested INTEGER NOT NULL,
  room_type TEXT NOT NULL, -- 'ac' or 'nonac'
  customer_name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  customer_email TEXT,
  lock_expiry TEXT NOT NULL, -- ISO timestamp when lock expires
  created_at TEXT NOT NULL,
  UNIQUE(room, checkin, checkout, room_type)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_locks_expiry ON booking_locks(lock_expiry);
CREATE INDEX IF NOT EXISTS idx_booking_locks_room_dates ON booking_locks(room, checkin, checkout);

-- Add new columns to bookings table for better tracking
ALTER TABLE bookings ADD COLUMN rooms_requested INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN room_type TEXT DEFAULT 'ac'; -- 'ac' or 'nonac'
ALTER TABLE bookings ADD COLUMN base_total REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN extra_charge REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN advance_amount REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN payment_id TEXT;
ALTER TABLE bookings ADD COLUMN lock_id TEXT; -- Reference to the lock that created this booking
ALTER TABLE bookings ADD COLUMN whatsapp_sent INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN email_sent INTEGER DEFAULT 0;

-- Add notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'whatsapp' or 'email'
  recipient TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed', 'pending'
  message TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- Create index for notification logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_booking_id ON notification_logs(booking_id);
