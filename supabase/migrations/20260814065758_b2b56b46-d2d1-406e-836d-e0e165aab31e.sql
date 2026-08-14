CREATE TABLE public.external_booking_keys (
  key_hash text PRIMARY KEY,
  organization_id uuid NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

GRANT ALL ON public.external_booking_keys TO service_role;

ALTER TABLE public.external_booking_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_external_booking_keys_org ON public.external_booking_keys (organization_id);