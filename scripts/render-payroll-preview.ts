// Renders the PayrollPeriodReport email to ./preview/payroll-period-report.html
// using realistic sample data shaped like a real TidyWise Cleaning period.
//
// Usage:
//   deno run --allow-read --allow-write --allow-net --allow-env scripts/render-payroll-preview.ts
//
// The MCP / runtime doesn't have access to the prod jointidywise Supabase
// project (slwfkaqczvwvvvavkgpr), so this preview uses sample data that
// matches the schema and shape the cron will produce. Visual review is the
// point — real numbers populate once the function is deployed.

import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { PayrollPeriodReport } from "../supabase/functions/_shared/email-templates/payroll-period-report.tsx";

const props = {
  orgName: "TidyWise Cleaning",
  periodLabel: "Apr 28 – May 4, 2026",
  totals: {
    revenue: 14_240,
    payroll: 7_812,
    profit: 6_428,
    laborPct: 54.9,
    jobs: 47,
    cleanersWorked: 6,
  },
  changeVsPrevious: {
    revenuePct: 8.4,
    payrollPct: 5.1,
    jobsPct: 11.9,
  },
  cleaners: [
    {
      name: "Maria Sanchez",
      jobs: 14,
      revenue: 4_120,
      payout: 2_064.5,
      hours: 51.5,
      payoutChangePct: 12.3,
    },
    {
      name: "Aisha Williams",
      jobs: 11,
      revenue: 3_280,
      payout: 1_804.0,
      hours: 45.0,
      payoutChangePct: 4.8,
    },
    {
      name: "Jamal Thompson",
      jobs: 9,
      revenue: 2_580,
      payout: 1_419.0,
      hours: 35.5,
      payoutChangePct: -3.2,
    },
    {
      name: "Sofia Gutierrez",
      jobs: 7,
      revenue: 2_100,
      payout: 1_155.0,
      hours: 28.5,
      payoutChangePct: 21.0,
    },
    {
      name: "Devin Park",
      jobs: 4,
      revenue: 1_360,
      payout: 850.0,
      hours: 17.0,
      payoutChangePct: null,
    },
    {
      name: "Hannah Cole",
      jobs: 2,
      revenue: 800,
      payout: 519.5,
      hours: 10.0,
      payoutChangePct: -38.5,
    },
  ],
  standouts: {
    topEarner: { name: "Maria Sanchez", payout: 2_064.5 },
    mostJobs: { name: "Maria Sanchez", jobs: 14 },
    highestAvg: { name: "Devin Park", avgPayout: 212.5 },
  },
  warnings: {
    idleCleaners: ["Brian Lee", "Olivia Nakamura"],
    noStripeCleaners: ["Devin Park", "Hannah Cole"],
    negativeMarginBookings: 1,
    zeroPayBookings: 2,
  },
  ctaUrl: "https://app.jointidywise.com/dashboard/payroll",
};

const html = await renderAsync(
  React.createElement(PayrollPeriodReport, props),
);

const previewDir = new URL("../preview/", import.meta.url);
try {
  await Deno.mkdir(previewDir, { recursive: true });
} catch (_e) { /* exists */ }

const outFile = new URL("payroll-period-report.html", previewDir);
await Deno.writeTextFile(outFile, html);

console.log(`Wrote ${outFile.pathname}`);
console.log(`Open with: open ${outFile.pathname}`);
