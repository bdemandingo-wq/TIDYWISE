import { useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PublicBookingPage() {
  useEffect(() => {
    // Load BookingKoala embed script
    const script = document.createElement('script');
    script.src = 'https://agencyfootprintcleaning.bookingkoala.com/resources/embed.js';
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector(
        'script[src="https://agencyfootprintcleaning.bookingkoala.com/resources/embed.js"]'
      );
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Footprint Cleaning</h1>
                <p className="text-sm text-sidebar-foreground/70">Book your service online</p>
              </div>
            </div>
            <Link to="/admin">
              <Button variant="outline" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80">
                Admin Login
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* BookingKoala Embed */}
      <main className="container mx-auto px-4 py-8">
        <iframe
          src="https://agencyfootprintcleaning.bookingkoala.com/booknow?embed=true"
          style={{ border: 'none', height: '1000px' }}
          width="100%"
          scrolling="no"
          title="Book a Cleaning Service"
        />
      </main>
    </div>
  );
}
