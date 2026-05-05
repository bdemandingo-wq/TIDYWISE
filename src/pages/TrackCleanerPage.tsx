import { Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';

export default function TrackCleanerPage() {
  return (
    <>
      <SEOHead
        title="Your Cleaner Is On The Way | TidyWise"
        description="Real-time arrival tracking for your TidyWise cleaning service. Your cleaner is en route — sit tight, they'll be there soon."
        noIndex
      />
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <h1 className="sr-only">Tracking your cleaner's arrival</h1>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
              <div className="relative w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Car className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <h2 className="text-lg font-semibold">Your cleaner is on the way!</h2>
            <p className="text-muted-foreground text-sm">
              They'll be there soon. If you have any questions, feel free to contact your cleaning company directly.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
