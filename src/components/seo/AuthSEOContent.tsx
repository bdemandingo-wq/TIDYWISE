import { Link } from "react-router-dom";

type AuthSEOContentProps = {
  /** The single H1 for the page */
  heading: string;
  /** Short intro line under the H1 */
  intro: string;
  /** Variant: tweaks the supporting copy for the audience */
  variant?: "owner" | "client" | "staff";
};

/**
 * Long-form, indexable SEO content rendered below auth forms.
 * Provides 300+ words of supporting copy, internal links, and an FAQ
 * so /auth, /login, /signup, /portal/login, /staff/login are not thin pages.
 *
 * Visual styling is intentionally minimal — uses the existing design
 * system tokens and stays out of the way of the auth form above it.
 */
export function AuthSEOContent({ heading, intro, variant = "owner" }: AuthSEOContentProps) {
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-10 text-foreground">
      <h1 className="text-2xl sm:text-3xl font-semibold mb-3">{heading}</h1>
      <p className="text-muted-foreground mb-6">{intro}</p>

      <div className="space-y-4 text-sm sm:text-base text-foreground/90 leading-relaxed">
        <p>
          TidyWise is the all-in-one operating system for cleaning businesses.
          Once you sign in, you can manage your full day from a single
          dashboard — view today&apos;s jobs, dispatch cleaners, accept new
          bookings from your website, send invoices, and run payroll without
          juggling separate tools.
        </p>

        {variant === "owner" && (
          <p>
            Owners and managers use TidyWise to handle{" "}
            <Link to="/features/scheduling-software" className="text-primary underline underline-offset-2">
              scheduling
            </Link>
            ,{" "}
            <Link to="/features/invoicing-software" className="text-primary underline underline-offset-2">
              invoicing
            </Link>
            ,{" "}
            <Link to="/features/crm" className="text-primary underline underline-offset-2">
              client CRM
            </Link>
            , automated dispatching, route optimization, recurring jobs, SMS
            reminders, and end-of-period payroll. Everything stays connected,
            so a booking that gets rescheduled on your calendar updates your
            customer&apos;s confirmation, your cleaner&apos;s job list, and your
            payroll record automatically.
          </p>
        )}

        {variant === "client" && (
          <p>
            The client portal lets your customers view upcoming appointments,
            request new bookings, update their address, and message your team
            without calling. Account access is scoped to the customer, so they
            only ever see their own job history and invoices. Business owners
            can read more about the tools powering it on the{" "}
            <Link to="/features/crm" className="text-primary underline underline-offset-2">
              CRM page
            </Link>
            , the{" "}
            <Link to="/features/invoicing-software" className="text-primary underline underline-offset-2">
              invoicing page
            </Link>
            , and the{" "}
            <Link to="/pricing" className="text-primary underline underline-offset-2">
              pricing page
            </Link>
            .
          </p>
        )}

        {variant === "staff" && (
          <p>
            The staff portal is built for the field. Sign in to see your route
            for the day, check in and out of jobs, mark checklist items
            complete, upload before/after photos, and review your earnings.
            Owners can configure pay rates and approve payouts from the main
            dashboard — see the{" "}
            <Link to="/features/payroll-software" className="text-primary underline underline-offset-2">
              payroll software
            </Link>{" "}
            and{" "}
            <Link to="/features/scheduling-software" className="text-primary underline underline-offset-2">
              scheduling software
            </Link>{" "}
            features for the full picture.
          </p>
        )}

        <p>
          TidyWise is used by independent cleaners, growing maid services, and
          multi-crew commercial operations. Your data is encrypted in transit
          and at rest, every organization is fully isolated, and you can export
          your information at any time. We do not sell or share customer
          information with third parties.
        </p>

        <p>
          Curious how TidyWise compares to other tools, or what features come
          standard? Read our deep-dive guides on the{" "}
          <Link to="/blog" className="text-primary underline underline-offset-2">
            TidyWise blog
          </Link>
          , see what&apos;s included on the{" "}
          <Link to="/pricing" className="text-primary underline underline-offset-2">
            pricing page
          </Link>
          , or head back to the{" "}
          <Link to="/" className="text-primary underline underline-offset-2">
            homepage
          </Link>{" "}
          for a quick overview.
        </p>

        <h2 className="text-xl font-semibold pt-6">Frequently asked questions</h2>

        <div>
          <h3 className="font-semibold">Is there a free version of TidyWise?</h3>
          <p className="text-muted-foreground">
            Yes. TidyWise is free forever for the core scheduling, CRM,
            invoicing, and payroll features. See the{" "}
            <Link to="/pricing" className="text-primary underline underline-offset-2">
              pricing page
            </Link>{" "}
            for what&apos;s included.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">I forgot my password — how do I reset it?</h3>
          <p className="text-muted-foreground">
            Use the &ldquo;Forgot password&rdquo; link on the sign-in form to
            receive a reset email. If you do not receive it within a few
            minutes, check your spam folder or contact your business admin.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">What is the difference between the admin, client, and staff logins?</h3>
          <p className="text-muted-foreground">
            Business owners and managers sign in at{" "}
            <Link to="/login" className="text-primary underline underline-offset-2">
              /login
            </Link>
            , customers use the client portal, and field cleaners use the staff
            portal. Each role has its own dashboard with the tools it needs.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Do I need a credit card to sign up?</h3>
          <p className="text-muted-foreground">
            No. You can{" "}
            <Link to="/signup" className="text-primary underline underline-offset-2">
              create your TidyWise account
            </Link>{" "}
            without entering payment information.
          </p>
        </div>

        <h2 className="text-xl font-semibold pt-6">About TidyWise</h2>
        <p>
          TidyWise was built by people who have run cleaning businesses, for
          people who run cleaning businesses. Every feature — from the
          recurring scheduler to the on-the-way SMS alerts to the payroll
          generator — exists because a working cleaning company needed it.
          Learn more on the{" "}
          <Link to="/" className="text-primary underline underline-offset-2">
            homepage
          </Link>{" "}
          or browse the{" "}
          <Link to="/blog" className="text-primary underline underline-offset-2">
            blog
          </Link>{" "}
          for tips on growing a cleaning business.
        </p>
      </div>
    </section>
  );
}
