-- Allow anonymous users to read and update review_requests by token
CREATE POLICY "Anyone can read review request by token"
ON public.review_requests
FOR SELECT
USING (review_link_token IS NOT NULL);

CREATE POLICY "Anyone can update review request by token"
ON public.review_requests
FOR UPDATE
USING (review_link_token IS NOT NULL)
WITH CHECK (review_link_token IS NOT NULL);