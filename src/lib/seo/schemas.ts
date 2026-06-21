// Reusable schema.org JSON-LD builders for TidyWise pages.
//
// IMPORTANT: We intentionally do NOT include aggregateRating anywhere.
// Google's structured-data policy forbids fabricated ratings, and we don't
// yet have a verified review corpus. Wire it in only when there are real
// numbers to back it.

const SITE = "https://www.jointidywise.com";

const PRICE_LOW = "49";
const PRICE_HIGH = "300";

const CORE_FEATURES = [
  "Online booking",
  "Drag-and-drop scheduling",
  "Automated payroll",
  "GPS tracking & on-the-way alerts",
  "Invoicing and payments",
  "CRM and customer messaging",
  "Recurring jobs and reminders",
  "Estimates and quotes",
  "Route optimization",
  "Two-way SMS via OpenPhone",
];

export function organizationSchema() {
  return {
    "@type": "Organization",
    name: "TIDYWISE",
    url: SITE,
    logo: `${SITE}/images/tidywise-logo.png`,
    sameAs: [] as string[],
  };
}

/**
 * LocalBusiness-style entry for the homepage. TidyWise is SaaS (no
 * physical storefront), so we describe the service area as the United
 * States rather than fabricating an address.
 */
export function localBusinessSchema() {
  return {
    "@type": "LocalBusiness",
    "@id": `${SITE}#localbusiness`,
    name: "TIDYWISE",
    url: SITE,
    image: `${SITE}/images/tidywise-og.png`,
    logo: `${SITE}/images/tidywise-logo.png`,
    description:
      "Cleaning business management software — booking, scheduling, invoicing, payroll, CRM, and GPS tracking for residential and commercial cleaning companies.",
    priceRange: "$49 – $300",
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
    serviceType: "Cleaning business management software",
  };
}

export function softwareApplicationSchema(opts?: {
  name?: string;
  description?: string;
  featureList?: string[];
}) {
  return {
    "@type": "SoftwareApplication",
    name: opts?.name ?? "TIDYWISE",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description:
      opts?.description ??
      "All-in-one cleaning business software: booking, scheduling, CRM, invoicing, payroll, and GPS tracking. Plans from $49/mo.",
    featureList: opts?.featureList ?? CORE_FEATURES,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: PRICE_LOW,
      highPrice: PRICE_HIGH,
      priceCurrency: "USD",
      offerCount: "4",
    },
  };
}

export interface Crumb {
  name: string;
  path: string; // site-relative, e.g. "/features/booking"
}

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path.startsWith("http") ? c.path : `${SITE}${c.path}`,
    })),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqSchema(faqs: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/**
 * Convenience helper — every /features/* page gets a SoftwareApplication
 * scoped to the feature, plus a Home > Features > {feature} breadcrumb.
 */
export function featurePageSchemas(args: {
  featureName: string; // e.g. "Online Booking Software"
  description: string;
  path: string; // e.g. "/features/booking"
  crumbLabel?: string; // override the leaf label
  featureList?: string[];
}) {
  return [
    softwareApplicationSchema({
      name: `TIDYWISE — ${args.featureName}`,
      description: args.description,
      featureList: args.featureList,
    }),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Features", path: "/#features" },
      { name: args.crumbLabel ?? args.featureName, path: args.path },
    ]),
  ];
}
