import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const CANONICAL_TARGET = "https://www.jointidywise.com/login";

export function AuthRedirect() {
  useEffect(() => {
    const tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (tag) tag.href = CANONICAL_TARGET;
  }, []);

  return (
    <>
      <SEOHead
        title="Sign In to TidyWise – Cleaning Business Software"
        description="Sign in to TidyWise to run your cleaning business from one dashboard — online bookings, scheduling, invoicing, payments, payroll, and team dispatch."
        canonical={CANONICAL_TARGET}
        noIndex
      />
      <Navigate to="/login" replace />
    </>
  );
}
