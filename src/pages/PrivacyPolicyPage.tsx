import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Privacy Policy | TidyWise"
        description="Read TidyWise's Privacy Policy. Learn what information we collect and how we use it to provide app functionality."
        canonicalPath="/privacy-policy"
      />

      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">TIDYWISE</span>
            <span className="text-sm text-muted-foreground">Privacy Policy</span>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">Back</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-sm mt-8 max-w-none text-foreground dark:prose-invert">
            <p>
              This Privacy Policy explains how <strong>TidyWise</strong> ("we", "us", "our") collects, uses, and shares
              information when you use our website and app (the "Services").
            </p>

            <h2>Information We Collect</h2>
            <p>We collect the following categories of information, primarily to provide app functionality:</p>
            <ul>
              <li>
                <strong>Name</strong>
              </li>
              <li>
                <strong>Email</strong>
              </li>
              <li>
                <strong>Phone Number</strong>
              </li>
              <li>
                <strong>Physical Address</strong>
              </li>
              <li>
                <strong>Precise Location</strong> (for features like GPS check-ins and location-aware workflows, when enabled)
              </li>
              <li>
                <strong>Payment Information</strong> (processed for purchases and billing)
              </li>
            </ul>

            <p>
              Payment details may be processed by our payment service providers. We do not store full payment card numbers on
              our servers.
            </p>

            <h2>How We Use Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide and operate the Services (e.g., managing bookings and providing cleaning services).</li>
              <li>Communicate with you about your account, bookings, receipts, and support requests.</li>
              <li>Improve, maintain, and secure the Services.</li>
              <li>Comply with legal obligations and enforce our terms.</li>
            </ul>

            <h2>Data Sharing</h2>
            <p>
              We may share information with service providers that help us run the Services (for example, hosting, analytics,
              customer support, messaging, and payment processing). These providers are permitted to use information only to
              perform services for us.
            </p>
            <p>
              <strong>We do not sell your personal data to third parties for advertising.</strong>
            </p>

            <h2>Security</h2>
            <p>
              We use reasonable administrative, technical, and physical safeguards designed to protect your information.
              However, no method of transmission or storage is 100% secure.
            </p>

            <h2>Data Retention</h2>
            <p>
              We retain information for as long as needed to provide the Services and for legitimate business purposes, such
              as complying with legal obligations, resolving disputes, and enforcing agreements.
            </p>

            <h2>Your Choices</h2>
            <ul>
              <li>You may update certain account information within the app.</li>
              <li>
                You can control device permissions (like location access) through your device settings. Some features may not
                work if permissions are disabled.
              </li>
            </ul>

            <h2>Children's Privacy</h2>
            <p>The Services are not directed to children under 13, and we do not knowingly collect information from them.</p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make changes, we will update the effective date
              above.
            </p>

            <h2>Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at <strong>support@tidywisecleaning.com</strong>.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
