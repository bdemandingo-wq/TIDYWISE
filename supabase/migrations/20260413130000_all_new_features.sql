-- ============================================================
-- Property Notes per address (persistent notes for cleaners)
-- ============================================================
CREATE TABLE IF NOT EXISTS property_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  notes TEXT,
  access_instructions TEXT,
  gate_code TEXT,
  alarm_code TEXT,
  has_pets BOOLEAN DEFAULT FALSE,
  pet_notes TEXT,
  parking_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_id)
);
ALTER TABLE property_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admin manages property notes" ON property_notes FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Staff can view property notes" ON property_notes FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- ============================================================
-- GPS Check-ins (verify cleaner is at property)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('check_in', 'check_out')),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  address_match BOOLEAN,
  distance_meters INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE booking_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manages own checkins" ON booking_checkins FOR ALL
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Org admin views checkins" ON booking_checkins FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- ============================================================
-- Surge / Dynamic Pricing on business_settings
-- ============================================================
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS surge_weekend_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS surge_weekend_multiplier NUMERIC(4,2) DEFAULT 1.15,
  ADD COLUMN IF NOT EXISTS surge_lastminute_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS surge_lastminute_hours INTEGER DEFAULT 48,
  ADD COLUMN IF NOT EXISTS surge_lastminute_multiplier NUMERIC(4,2) DEFAULT 1.20,
  ADD COLUMN IF NOT EXISTS surge_holiday_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS surge_holiday_multiplier NUMERIC(4,2) DEFAULT 1.25;

-- ============================================================
-- Loyalty Redemption Settings on business_settings
-- ============================================================
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar NUMERIC(6,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS loyalty_redemption_threshold INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS loyalty_redemption_dollar_value NUMERIC(10,2) DEFAULT 10.00;

-- ============================================================
-- Win-back drip tracking (prevent re-sending same step)
-- ============================================================
CREATE TABLE IF NOT EXISTS winback_drip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK (step IN (1, 2, 3)),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_id, step)
);
ALTER TABLE winback_drip_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admin views winback log" ON winback_drip_log FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
