-- Create operations_tracker table for daily tracking
CREATE TABLE public.operations_tracker (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_date date NOT NULL DEFAULT CURRENT_DATE,
  incoming_calls integer DEFAULT 0,
  closed_deals integer DEFAULT 0,
  revenue_booked numeric DEFAULT 0,
  cold_emails_sent integer DEFAULT 0,
  cold_calls_made integer DEFAULT 0,
  leads_followed_up integer DEFAULT 0,
  jobs_completed integer DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(track_date)
);

-- Enable RLS
ALTER TABLE public.operations_tracker ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage operations tracker" 
ON public.operations_tracker 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create client_feedback table
CREATE TABLE public.client_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  feedback_date date NOT NULL DEFAULT CURRENT_DATE,
  is_resolved boolean DEFAULT false,
  followup_needed boolean DEFAULT false,
  issue_description text,
  resolution text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage client feedback" 
ON public.client_feedback 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on operations_tracker
CREATE TRIGGER update_operations_tracker_updated_at
BEFORE UPDATE ON public.operations_tracker
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on client_feedback
CREATE TRIGGER update_client_feedback_updated_at
BEFORE UPDATE ON public.client_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();