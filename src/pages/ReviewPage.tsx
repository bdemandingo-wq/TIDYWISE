import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Star, Send, CheckCircle, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

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
  const [redirectedToGoogle, setRedirectedToGoogle] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) { setIsLoading(false); return; }
      try {
        const { data, error } = await supabase
          .from('review_requests')
          .select('*')
          .eq('review_link_token', token)
          .single();

        if (error || !data) { setIsLoading(false); return; }

        setIsValid(true);
        setGoogleUrl(data.google_review_url);
        setReviewData(data);

        await supabase
          .from('review_requests')
          .update({ opened_at: new Date().toISOString() })
          .eq('review_link_token', token);

        // If user clicked a star from email (4-5), auto-redirect to Google
        if (initialRating >= 4 && data.google_review_url) {
          await handleHighRating(initialRating, data);
        } else if (initialRating >= 1 && initialRating <= 3) {
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

  const handleHighRating = async (stars: number, data?: any) => {
    const reqData = data || reviewData;
    // Save rating internally
    await supabase
      .from('review_requests')
      .update({
        rating: stars,
        responded_at: new Date().toISOString(),
        status: 'completed'
      })
      .eq('review_link_token', token);

    // Redirect to Google immediately
    const url = data?.google_review_url || googleUrl;
    if (url) {
      setRedirectedToGoogle(true);
      window.location.href = url;
    } else {
      // No Google URL, just show thank you
      setIsSubmitted(true);
      setRating(stars);
    }
  };

  const handleStarClick = async (stars: number) => {
    setRating(stars);
    if (stars >= 4 && googleUrl) {
      await handleHighRating(stars);
    }
    // 1-3 stars: just set rating, user fills feedback form
  };

  const handleSubmitLowRating = async () => {
    if (rating === 0) {
      toast({ title: "Please select a rating", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: updatedReview, error } = await supabase
        .from('review_requests')
        .update({
          rating,
          review_text: feedback || null,
          responded_at: new Date().toISOString(),
          status: 'completed'
        })
        .eq('review_link_token', token)
        .select('booking_id, customer_id, staff_id')
        .single();

      if (error) throw error;

      if (updatedReview) {
        const { data: customerData } = await supabase
          .from('customers')
          .select('first_name, last_name, organization_id')
          .eq('id', updatedReview.customer_id)
          .single();

        if (customerData) {
          await supabase
            .from('client_feedback')
            .insert({
              customer_name: `${customerData.first_name} ${customerData.last_name}`,
              issue_description: feedback || `Customer gave ${rating} star rating`,
              organization_id: customerData.organization_id,
              feedback_date: new Date().toISOString().split('T')[0],
              is_resolved: false,
              followup_needed: true
            });
        }
      }

      setIsSubmitted(true);
      toast({ title: "Thank you!", description: "Your feedback has been submitted." });
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({ title: "Error", description: "Failed to submit review. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || redirectedToGoogle) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          {redirectedToGoogle && <p className="text-muted-foreground">Taking you to Google Reviews...</p>}
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Thank You!</h1>
          <p className="text-gray-600 mb-4">Your feedback means the world to us. We're always working to improve our service.</p>
          <div className="flex items-center justify-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className={`h-6 w-6 ${star <= rating ? 'fill-current' : 'fill-none'}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">How was your cleaning?</h1>
          <p className="text-gray-600 mt-2">
            {googleUrl
              ? 'Tap a star — 4-5 stars takes you straight to Google Reviews!'
              : 'Your feedback helps us serve you better'}
          </p>
        </div>

        {/* Star Rating */}
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

        {/* Low rating feedback form (1-3 stars) */}
        {rating >= 1 && rating <= 3 && (
          <>
            <div className="text-center mb-6">
              <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${
                rating === 3 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {rating === 3 && "Good 👍"}
                {rating === 2 && "Could be better 😕"}
                {rating === 1 && "Not satisfied 😞"}
              </span>
            </div>

            <div className="mb-6">
              <Textarea
                placeholder="We're sorry to hear that. Please tell us what went wrong so we can make it right..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[120px] resize-none border-gray-200 focus:border-primary focus:ring-primary"
              />
            </div>

            <Button
              onClick={handleSubmitLowRating}
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Submit Feedback
                </>
              )}
            </Button>
          </>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          Your feedback is confidential and helps us improve our service.
        </p>
      </div>
    </div>
  );
}
