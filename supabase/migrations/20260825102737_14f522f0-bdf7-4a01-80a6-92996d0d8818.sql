ALTER TABLE public.broadcasts
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT broadcasts_created_by_fkey,
  ADD CONSTRAINT broadcasts_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.estimates
  DROP CONSTRAINT estimates_created_by_fkey,
  ADD CONSTRAINT estimates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.facebook_page_connections
  DROP CONSTRAINT facebook_page_connections_connected_by_fkey,
  ADD CONSTRAINT facebook_page_connections_connected_by_fkey
    FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL;