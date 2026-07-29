CREATE TABLE public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  clinician_role text,
  practice_name text,
  country text,
  phone text,
  joined_whatsapp boolean NOT NULL DEFAULT false,
  booking_uid text,
  booking_start timestamptz,
  booking_end timestamptz,
  booking_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beta_nda_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tester_id uuid REFERENCES public.beta_testers(id) ON DELETE CASCADE,
  signed_name text NOT NULL,
  email text NOT NULL,
  nda_version text NOT NULL,
  nda_hash text,
  affirmed boolean NOT NULL DEFAULT true,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  booking_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beta_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.beta_testers TO service_role;
GRANT ALL ON public.beta_nda_signatures TO service_role;
GRANT ALL ON public.beta_events TO service_role;
GRANT INSERT ON public.beta_events TO anon, authenticated;

ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_nda_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a beta event"
  ON public.beta_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX idx_beta_testers_email ON public.beta_testers (email);
CREATE INDEX idx_beta_nda_email ON public.beta_nda_signatures (email);

CREATE TRIGGER beta_testers_updated_at
  BEFORE UPDATE ON public.beta_testers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();