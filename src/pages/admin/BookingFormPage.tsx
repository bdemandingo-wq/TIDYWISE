import { useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function BookingFormPage() {
  useEffect(() => {
    // Load BookingKoala embed script
    const script = document.createElement('script');
    script.src = 'https://agencyfootprintcleaning.bookingkoala.com/resources/embed.js';
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      const existingScript = document.querySelector(
        'script[src="https://agencyfootprintcleaning.bookingkoala.com/resources/embed.js"]'
      );
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return (
    <AdminLayout
      title="Booking Form"
      subtitle="BookingKoala booking form for customers"
    >
      <div className="bg-card rounded-lg border p-4">
        <iframe
          src="https://agencyfootprintcleaning.bookingkoala.com/booknow?embed=true"
          style={{ border: 'none', minHeight: '1000px' }}
          width="100%"
          scrolling="no"
          title="Book a Cleaning Service"
        />
      </div>
    </AdminLayout>
  );
}
