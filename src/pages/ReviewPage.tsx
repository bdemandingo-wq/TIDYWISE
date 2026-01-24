import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Star, Send, ExternalLink, CheckCircle, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const initialRating = parseInt(searchParams.get('rating') || '0');
  
  const [rating, setRating] = useState(initialRating || 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [showGoogleRedirect, setShowGoogleRedirect] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('review_requests')
          .select('*')
          .eq('review_link_token', token)
          .single();

        if (error || !data) {
          console.error('Invalid token:', error);
          setIsLoading(false);
          return;
        }

        setIsValid(true);
        setGoogleUrl(data.google_review_url);
        
        // Mark as opened
        await supabase
          .from('review_requests')
          .update({ opened_at: new Date().toISOString() })
          .eq('review_link_token', token);

      } catch (err) {
        console.error('Error validating token:', err);
      } finally {
        setIsLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: "Please select a rating", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update the review request with rating and feedback
      const { data: reviewData, error } = await supabase
        .from('review_requests')
        .update({
          rating,
          review_text: feedback || null,
          responded_at: new Date().toISOString(),
          status: 'completed'
        })
        .eq('review_link_token', token)
        .select('booking_id, customer_id')
        .single();

      if (error) throw error;

      // If rating is 3 or below, route to internal feedback system
      if (rating <= 3 && reviewData) {
        // Get customer name from the review context
        const { data: customerData } = await supabase
          .from('customers')
          .select('first_name, last_name, organization_id')
          .eq('id', reviewData.customer_id)
          .single();

        if (customerData) {
          // Create client feedback entry for low ratings
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

      // If 4+ stars and Google URL exists, show redirect option
      if (rating >= 4 && googleUrl) {
        setShowGoogleRedirect(true);
      }

      toast({ title: "Thank you!", description: "Your feedback has been submitted." });
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({ title: "Error", description: "Failed to submit review. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleRedirect = () => {
    if (googleUrl) {
      window.open(googleUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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

  if (isSubmitted && !showGoogleRedirect) {
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
              <Star
                key={star}
                className={`h-6 w-6 ${star <= rating ? 'fill-current' : 'fill-none'}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (showGoogleRedirect) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart className="h-10 w-10 text-blue-600 fill-current" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">We're So Glad You Had a Great Experience!</h1>
          <p className="text-gray-600 mb-6">
            Would you mind sharing your review on Google? It helps other people find great cleaning services and means so much to our team!
          </p>
          <Button 
            onClick={handleGoogleRedirect}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <ExternalLink className="h-5 w-5" />
            Leave a Google Review
          </Button>
          <button 
            onClick={() => setShowGoogleRedirect(false)}
            className="mt-4 text-gray-500 hover:text-gray-700 text-sm"
          >
            No thanks, I'm done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">How was your cleaning?</h1>
          <p className="text-gray-600 mt-2">Your feedback helps us serve you better</p>
        </div>

        {/* Star Rating */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
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

        {/* Rating Label */}
        {rating > 0 && (
          <div className="text-center mb-6">
            <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${
              rating >= 4 
                ? 'bg-emerald-100 text-emerald-700' 
                : rating >= 3 
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
            }`}>
              {rating === 5 && "Excellent! 🎉"}
              {rating === 4 && "Great! 😊"}
              {rating === 3 && "Good 👍"}
              {rating === 2 && "Could be better 😕"}
              {rating === 1 && "Not satisfied 😞"}
            </span>
          </div>
        )}

        {/* Feedback Textarea */}
        <div className="mb-6">
          <Textarea
            placeholder={
              rating <= 3 && rating > 0
                ? "We're sorry to hear that. Please tell us what went wrong so we can make it right..."
                : "Tell us more about your experience (optional)..."
            }
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[120px] resize-none border-gray-200 focus:border-primary focus:ring-primary"
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
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

        {/* Privacy Note */}
        <p className="text-xs text-gray-400 text-center mt-4">
          Your feedback is confidential and helps us improve our service.
        </p>
      </div>
    </div>
  );
}
