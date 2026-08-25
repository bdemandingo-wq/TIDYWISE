import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Star, Send, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { TrackingPixels } from '@/components/TrackingPixels';

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const initialRating = parseInt(searchParams.get('rating') || '0');

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [trackingIds, setTrackingIds] = useState<{ meta_pixel_id: string | null; google_analytics_id: string | null }>({ meta_pixel_id: null, google_analytics_id: null });

  // Fetch org tracking IDs once we know which customer/org
  useEffect(() => {
    const customerId = reviewData?.customer_id;
    if (!customerId) return;
    (async () => {
      const { data: customerData } = await supabase
        .from('customers')
        .select('organization_id')
        .eq('id', customerId)
        .maybeSingle();
      if (!customerData?.organization_id) return;
      const { data: settings } = await (supabase
        .from('business_settings' as any) as any)
        .select('meta_pixel_id, google_analytics_id')
        .eq('organization_id', customerData.organization_id)
        .maybeSingle();
      if (settings) {
        setTrackingIds({
          meta_pixel_id: (settings as any).meta_pixel_id ?? null,
          google_analytics_id: (settings as any).google_analytics_id ?? null,
        });
      }
    })();
  }, [reviewData?.customer_id]);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) { setIsLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc('get_review_request_by_token' as any, {
          p_token: token,
        });

        if (error || !data || data.length === 0) { setIsLoading(false); return; }

        const reviewRecord = data[0];
        setIsValid(true);
        setGoogleUrl(reviewRecord.google_review_url);
        setReviewData(reviewRecord);

        // Pre-select the star rating from the email link, but don't redirect
        if (initialRating >= 1 && initialRating <= 5) {
          setRating(initialRating);
        }
      } catch (err) {
        console.error('Error validating token:', err);
      } finally {
        setIsLoading(false);
      }
    };
    validateToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleStarClick = (stars: number) => {
    setRating(stars);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: "Please select a rating", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_review_by_token' as any, {
        p_token: token,
        p_rating: rating,
        p_review_text: feedback || null,
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({ title: "Thank you!", description: "Your feedback has been submitted." });
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({ title: "Error", description: "Failed to submit review. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="portal-v2 portal-v2-scroll min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <SEOHead title="Leave a Review" description="Share your feedback about your cleaning service experience." noIndex />
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="portal-v2 portal-v2-scroll min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invalid or Expired Link</h1>
          <p className="text-gray-600">This review link is no longer valid. Please contact us if you need assistance.</p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="portal-v2 portal-v2-scroll min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Thank You!</h1>
          <p className="text-gray-600 mb-4">Your feedback means the world to us. We're always working to improve our service.</p>
          <div className="flex items-center justify-center gap-1 text-amber-500 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className={`h-6 w-6 ${star <= rating ? 'fill-current' : 'fill-none'}`} />
            ))}
          </div>
          {googleUrl && (
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              You can also leave a review on Google
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-v2 portal-v2-scroll min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <TrackingPixels metaPixelId={trackingIds.meta_pixel_id} googleAnalyticsId={trackingIds.google_analytics_id} />
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">How was your cleaning?</h1>
          <p className="text-gray-600 mt-2">Your feedback helps us serve you better</p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleStarClick(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={`h-12 w-12 transition-colors ${
                  star <= (hoveredRating || rating)
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Show both options once a rating is selected — no gating */}
        {rating > 0 && (
          <div className="space-y-5">
            {/* Google review button — primary action, one tap to get there */}
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  // Record the rating before they leave for Google
                  supabase.rpc('submit_review_by_token' as any, {
                    p_token: token,
                    p_rating: rating,
                    p_review_text: null,
                  });
                }}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Leave a Google Review
              </a>
            )}

            {/* Divider */}
            {googleUrl && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            )}

            {/* Private feedback */}
            <div>
              <Textarea
                placeholder="Want to tell us something privately? We read every message..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[100px] resize-none border-gray-200 focus:border-primary focus:ring-primary"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant={googleUrl ? "outline" : "default"}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  {feedback.trim() ? 'Send Feedback' : 'Submit Rating'}
                </>
              )}
            </Button>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          Your feedback is confidential and helps us improve our service.
        </p>
      </div>
    </div>
  );
}
