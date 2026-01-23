import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { ProtectedOrgRoute } from "@/components/ProtectedOrgRoute";
import { StaffRoute } from "@/components/StaffRoute";
import { SessionTrackerProvider } from "@/components/SessionTrackerProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Capacitor } from "@capacitor/core";

// Critical path: keep the shell light; lazy-load even the public entry pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));

// Lazy-loaded page skeleton for loading states
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Lazy load all routes for code splitting
const PublicBookingPage = lazy(() => import("./pages/PublicBookingPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const SchedulerPage = lazy(() => import("./pages/admin/SchedulerPage"));
const BookingsPage = lazy(() => import("./pages/admin/BookingsPage"));
const CustomersPage = lazy(() => import("./pages/admin/CustomersPage"));
const ServicesPage = lazy(() => import("./pages/admin/ServicesPage"));
const StaffPage = lazy(() => import("./pages/admin/StaffPage"));
const PayrollPage = lazy(() => import("./pages/admin/PayrollPage"));
const FinancePage = lazy(() => import("./pages/admin/FinancePage"));
const ExpensesPage = lazy(() => import("./pages/admin/ExpensesPage"));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const NotificationsPage = lazy(() => import("./pages/admin/NotificationsPage"));
const RecurringBookingsPage = lazy(() => import("./pages/admin/RecurringBookingsPage"));
const LeadsPage = lazy(() => import("./pages/admin/LeadsPage"));
const InventoryPage = lazy(() => import("./pages/admin/InventoryPage"));
const InvoicesPage = lazy(() => import("./pages/admin/InvoicesPage"));
const OperationsTrackerPage = lazy(() => import("./pages/admin/OperationsTrackerPage"));
const ClientFeedbackPage = lazy(() => import("./pages/admin/ClientFeedbackPage"));
const CampaignsPage = lazy(() => import("./pages/admin/CampaignsPage"));
const ChecklistsPage = lazy(() => import("./pages/admin/ChecklistsPage"));
const PaymentIntegrationPage = lazy(() => import("./pages/admin/PaymentIntegrationPage"));
const SubscriptionPage = lazy(() => import("./pages/admin/SubscriptionPage"));
const HelpPage = lazy(() => import("./pages/admin/HelpPage"));
const DiscountsPage = lazy(() => import("./pages/admin/DiscountsPage"));
const PlatformAnalyticsPage = lazy(() => import("./pages/admin/PlatformAnalyticsPage"));
const MessagesPage = lazy(() => import("./pages/admin/MessagesPage"));
const TasksPage = lazy(() => import("./pages/admin/TasksPage"));
const StaffPortal = lazy(() => import("./pages/staff/StaffPortal"));
const StaffLoginPage = lazy(() => import("./pages/staff/StaffLoginPage"));
const StaffResetPasswordPage = lazy(() => import("./pages/staff/StaffResetPasswordPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const BlogIndex = lazy(() => import("./pages/blog/BlogIndex"));
const HowToStartCleaningBusiness = lazy(() => import("./pages/blog/HowToStartCleaningBusiness"));
const BookingKoalaVsJobberVsTidywise = lazy(() => import("./pages/blog/BookingKoalaVsJobberVsTidywise"));
const DynamicBlogPost = lazy(() => import("./pages/blog/DynamicBlogPost"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CompareJobber = lazy(() => import("./pages/compare/CompareJobber"));
const CompareBookingKoala = lazy(() => import("./pages/compare/CompareBookingKoala"));
const AutomatedDispatching = lazy(() => import("./pages/features/AutomatedDispatching"));
const QuoteSoftware = lazy(() => import("./pages/features/QuoteSoftware"));
const SMSNotifications = lazy(() => import("./pages/features/SMSNotifications"));
const PaymentProcessing = lazy(() => import("./pages/features/PaymentProcessing"));
const RouteOptimization = lazy(() => import("./pages/features/RouteOptimization"));
const InvoicingSoftware = lazy(() => import("./pages/features/InvoicingSoftware"));
const SchedulingSoftware = lazy(() => import("./pages/features/SchedulingSoftware"));
const CompareHousecallPro = lazy(() => import("./pages/compare/CompareHousecallPro"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));


// Optimized QueryClient with stale time and caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionTrackerProvider>
          <OrganizationProvider>
            <TestModeProvider>
              <TooltipProvider>
              <Toaster />
              <Sonner />
              {/*
                Native (Capacitor) builds should use HashRouter to avoid blank screens on launch
                due to history-based routing not being handled by the embedded webview.
              */}
              {Capacitor.isNativePlatform() ? (
                <HashRouter>
                   <ErrorBoundary featureName="App">
                     <Suspense fallback={<PageLoader />}>
                       <Routes>
                    {/* Public Routes - Critical Path */}
                      <Route path="/" element={<LandingPage />} />
                      <Route path="/auth" element={<AuthPage />} />

                      {/* Public Routes - Lazy Loaded */}
                      <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
                      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                      <Route path="/onboarding" element={<OnboardingPage />} />
                      <Route path="/review/:token" element={<ReviewPage />} />
                      <Route path="/blog" element={<BlogIndex />} />
                      <Route path="/blog/how-to-start-a-cleaning-business" element={<HowToStartCleaningBusiness />} />
                      <Route path="/blog/booking-koala-vs-jobber-vs-tidywise" element={<BookingKoalaVsJobberVsTidywise />} />
                      <Route path="/blog/post/:slug" element={<DynamicBlogPost />} />
                      
                      {/* Comparison Pages */}
                      <Route path="/compare/jobber" element={<CompareJobber />} />
                      <Route path="/compare/booking-koala" element={<CompareBookingKoala />} />
                      <Route path="/compare/housecall-pro" element={<CompareHousecallPro />} />
                      
                      {/* Feature Pages */}
                      <Route path="/features/automated-dispatching" element={<AutomatedDispatching />} />
                      <Route path="/features/quote-software" element={<QuoteSoftware />} />
                      <Route path="/features/sms-notifications" element={<SMSNotifications />} />
                      <Route path="/features/payment-processing" element={<PaymentProcessing />} />
                      <Route path="/features/route-optimization" element={<RouteOptimization />} />
                      <Route path="/features/invoicing-software" element={<InvoicingSoftware />} />
                      <Route path="/features/scheduling-software" element={<SchedulingSoftware />} />

                      {/* Staff Portal */}
                      <Route path="/staff/login" element={<StaffLoginPage />} />
                      <Route path="/staff/reset-password" element={<StaffResetPasswordPage />} />
                      <Route path="/staff" element={<StaffRoute><ErrorBoundary featureName="Staff Portal"><StaffPortal /></ErrorBoundary></StaffRoute>} />

                      {/* Dashboard Routes - All Lazy Loaded */}
                      <Route path="/dashboard" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/scheduler" element={<ProtectedOrgRoute><ErrorBoundary featureName="Scheduler"><SchedulerPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/bookings" element={<ProtectedOrgRoute><ErrorBoundary featureName="Bookings"><BookingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/customers" element={<ProtectedOrgRoute><ErrorBoundary featureName="Customers"><CustomersPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/services" element={<ProtectedOrgRoute><ErrorBoundary featureName="Services"><ServicesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/staff" element={<ProtectedOrgRoute><ErrorBoundary featureName="Staff Management"><StaffPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/payroll" element={<ProtectedOrgRoute><ErrorBoundary featureName="Payroll"><PayrollPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/finance" element={<ProtectedOrgRoute><ErrorBoundary featureName="Finance"><FinancePage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/expenses" element={<ProtectedOrgRoute><ErrorBoundary featureName="Expenses"><ExpensesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/reports" element={<ProtectedOrgRoute><ErrorBoundary featureName="Reports"><ReportsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/settings" element={<ProtectedOrgRoute><ErrorBoundary featureName="Settings"><SettingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/notifications" element={<ProtectedOrgRoute><ErrorBoundary featureName="Notifications"><NotificationsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/recurring" element={<ProtectedOrgRoute><ErrorBoundary featureName="Recurring Bookings"><RecurringBookingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/leads" element={<ProtectedOrgRoute><ErrorBoundary featureName="Leads"><LeadsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/inventory" element={<ProtectedOrgRoute><ErrorBoundary featureName="Inventory"><InventoryPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/invoices" element={<ProtectedOrgRoute><ErrorBoundary featureName="Invoices"><InvoicesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/operations" element={<ProtectedOrgRoute><ErrorBoundary featureName="Operations Tracker"><OperationsTrackerPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/feedback" element={<ProtectedOrgRoute><ErrorBoundary featureName="Client Feedback"><ClientFeedbackPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/campaigns" element={<ProtectedOrgRoute><ErrorBoundary featureName="Campaigns"><CampaignsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/checklists" element={<ProtectedOrgRoute><ErrorBoundary featureName="Checklists"><ChecklistsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/payment-integration" element={<ProtectedOrgRoute><ErrorBoundary featureName="Payment Integration"><PaymentIntegrationPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/subscription" element={<ProtectedOrgRoute><ErrorBoundary featureName="Subscription"><SubscriptionPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/help" element={<ProtectedOrgRoute><ErrorBoundary featureName="Help Center"><HelpPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/discounts" element={<ProtectedOrgRoute><ErrorBoundary featureName="Discounts"><DiscountsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/messages" element={<ProtectedOrgRoute><ErrorBoundary featureName="Messages"><MessagesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/tasks" element={<ProtectedOrgRoute><ErrorBoundary featureName="Tasks"><TasksPage /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/dashboard/platform-analytics" element={<ProtectedOrgRoute><ErrorBoundary featureName="Platform Analytics"><PlatformAnalyticsPage /></ErrorBoundary></ProtectedOrgRoute>} />

                      {/* Legacy admin routes */}
                      <Route path="/admin" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />
                      <Route path="/admin/*" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />

                      {/* Catch-all */}
                      <Route path="*" element={<NotFound />} />
                       </Routes>
                     </Suspense>
                   </ErrorBoundary>
                </HashRouter>
              ) : (
                <BrowserRouter>
                 <ErrorBoundary featureName="App">
                   <Suspense fallback={<PageLoader />}>
                     <Routes>
                  {/* Public Routes - Critical Path */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/auth" element={<AuthPage />} />

                    {/* Public Routes - Lazy Loaded */}
                    <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route path="/review/:token" element={<ReviewPage />} />
                    <Route path="/blog" element={<BlogIndex />} />
                    <Route path="/blog/how-to-start-a-cleaning-business" element={<HowToStartCleaningBusiness />} />
                    <Route path="/blog/booking-koala-vs-jobber-vs-tidywise" element={<BookingKoalaVsJobberVsTidywise />} />
                    <Route path="/blog/post/:slug" element={<DynamicBlogPost />} />
                    
                    {/* Comparison Pages */}
                    <Route path="/compare/jobber" element={<CompareJobber />} />
                    <Route path="/compare/booking-koala" element={<CompareBookingKoala />} />
                    <Route path="/compare/housecall-pro" element={<CompareHousecallPro />} />
                    
                    {/* Feature Pages */}
                    <Route path="/features/automated-dispatching" element={<AutomatedDispatching />} />
                    <Route path="/features/quote-software" element={<QuoteSoftware />} />
                    <Route path="/features/sms-notifications" element={<SMSNotifications />} />
                    <Route path="/features/payment-processing" element={<PaymentProcessing />} />
                    <Route path="/features/route-optimization" element={<RouteOptimization />} />
                    <Route path="/features/invoicing-software" element={<InvoicingSoftware />} />
                    <Route path="/features/scheduling-software" element={<SchedulingSoftware />} />

                    {/* Staff Portal */}
                    <Route path="/staff/login" element={<StaffLoginPage />} />
                    <Route path="/staff/reset-password" element={<StaffResetPasswordPage />} />
                    <Route path="/staff" element={<StaffRoute><ErrorBoundary featureName="Staff Portal"><StaffPortal /></ErrorBoundary></StaffRoute>} />

                    {/* Dashboard Routes - All Lazy Loaded */}
                    <Route path="/dashboard" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/scheduler" element={<ProtectedOrgRoute><ErrorBoundary featureName="Scheduler"><SchedulerPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/bookings" element={<ProtectedOrgRoute><ErrorBoundary featureName="Bookings"><BookingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/customers" element={<ProtectedOrgRoute><ErrorBoundary featureName="Customers"><CustomersPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/services" element={<ProtectedOrgRoute><ErrorBoundary featureName="Services"><ServicesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/staff" element={<ProtectedOrgRoute><ErrorBoundary featureName="Staff Management"><StaffPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/payroll" element={<ProtectedOrgRoute><ErrorBoundary featureName="Payroll"><PayrollPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/finance" element={<ProtectedOrgRoute><ErrorBoundary featureName="Finance"><FinancePage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/expenses" element={<ProtectedOrgRoute><ErrorBoundary featureName="Expenses"><ExpensesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/reports" element={<ProtectedOrgRoute><ErrorBoundary featureName="Reports"><ReportsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/settings" element={<ProtectedOrgRoute><ErrorBoundary featureName="Settings"><SettingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/notifications" element={<ProtectedOrgRoute><ErrorBoundary featureName="Notifications"><NotificationsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/recurring" element={<ProtectedOrgRoute><ErrorBoundary featureName="Recurring Bookings"><RecurringBookingsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/leads" element={<ProtectedOrgRoute><ErrorBoundary featureName="Leads"><LeadsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/inventory" element={<ProtectedOrgRoute><ErrorBoundary featureName="Inventory"><InventoryPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/invoices" element={<ProtectedOrgRoute><ErrorBoundary featureName="Invoices"><InvoicesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/operations" element={<ProtectedOrgRoute><ErrorBoundary featureName="Operations Tracker"><OperationsTrackerPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/feedback" element={<ProtectedOrgRoute><ErrorBoundary featureName="Client Feedback"><ClientFeedbackPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/campaigns" element={<ProtectedOrgRoute><ErrorBoundary featureName="Campaigns"><CampaignsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/checklists" element={<ProtectedOrgRoute><ErrorBoundary featureName="Checklists"><ChecklistsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/payment-integration" element={<ProtectedOrgRoute><ErrorBoundary featureName="Payment Integration"><PaymentIntegrationPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/subscription" element={<ProtectedOrgRoute><ErrorBoundary featureName="Subscription"><SubscriptionPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/help" element={<ProtectedOrgRoute><ErrorBoundary featureName="Help Center"><HelpPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/discounts" element={<ProtectedOrgRoute><ErrorBoundary featureName="Discounts"><DiscountsPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/messages" element={<ProtectedOrgRoute><ErrorBoundary featureName="Messages"><MessagesPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/tasks" element={<ProtectedOrgRoute><ErrorBoundary featureName="Tasks"><TasksPage /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/dashboard/platform-analytics" element={<ProtectedOrgRoute><ErrorBoundary featureName="Platform Analytics"><PlatformAnalyticsPage /></ErrorBoundary></ProtectedOrgRoute>} />

                    {/* Legacy admin routes */}
                    <Route path="/admin" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />
                    <Route path="/admin/*" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />

                    {/* Catch-all */}
                    <Route path="*" element={<NotFound />} />
                     </Routes>
                   </Suspense>
                 </ErrorBoundary>
                </BrowserRouter>
              )}
              </TooltipProvider>
            </TestModeProvider>
          </OrganizationProvider>
        </SessionTrackerProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
