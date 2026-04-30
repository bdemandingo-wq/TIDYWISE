import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-border bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="md:col-span-1">
            <span className="font-bold text-xl text-foreground mb-4 block">TIDYWISE</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The complete platform to grow your cleaning business.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-3">
              <li><Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Home</Link></li>
              <li><Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
              <li><Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link></li>
              <li><Link to="/cleaning-business-software" className="text-sm text-muted-foreground hover:text-foreground transition-colors">By Location</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Features</h3>
            <ul className="space-y-3">
              <li><Link to="/features/scheduling-software" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Scheduling</Link></li>
              <li><Link to="/features/crm" className="text-sm text-muted-foreground hover:text-foreground transition-colors">CRM</Link></li>
              <li><Link to="/features/payroll-software" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Payroll</Link></li>
              <li><Link to="/features/invoicing-software" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Invoicing</Link></li>
              <li><Link to="/features/route-optimization" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Route Optimization</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Compare</h3>
            <ul className="space-y-3">
              <li><Link to="/compare/jobber" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Jobber</Link></li>
              <li><Link to="/compare/booking-koala" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Booking Koala</Link></li>
              <li><Link to="/compare/housecall-pro" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Housecall Pro</Link></li>
              <li><Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link></li>
              <li><Link to="/delete-account" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Delete Account</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} TIDYWISE. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
