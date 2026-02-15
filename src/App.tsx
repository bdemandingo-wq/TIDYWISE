import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthProviderNoSession } from "@/hooks/useAuthNoSession";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { ClientPortalProvider } from "@/contexts/ClientPortalContext";
import { AdminRoute } from "@/components/AdminRoute";
import { StaffRoute } from "@/components/StaffRoute";
import { ProtectedPortalRoute } from "@/components/ProtectedPortalRoute";
import { SessionTrackerProvider } from "@/components/SessionTrackerProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Capacitor } from "@capacitor/core";

// Critical path: keep the shell light; lazy-load even the public entry pages
const LandingPage = lazy(() => import("./pages/LandingPage"));

// New auth pages with no session persistence
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
// Native redirect for signup (App Store compliance - no in-app signup on native)
const NativeSignupRedirect = lazy(() => import("./pages/NativeSignupRedirect"));
const LogoutPage = lazy(() => import("./pages/LogoutPage"));

// Legacy auth page (kept for backwards compatibility)
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
// Platform-aware subscription page: native apps show compliant version (no prices/payments)
const SubscriptionPage = lazy(() => 
  Capacitor.isNativePlatform() 
    ? import("./pages/admin/SubscriptionPageNative")
    : import("./pages/admin/SubscriptionPage")
);
const HelpPage = lazy(() => import("./pages/admin/HelpPage"));
const DiscountsPage = lazy(() => import("./pages/admin/DiscountsPage"));
const PlatformAnalyticsPage = lazy(() => import("./pages/admin/PlatformAnalyticsPage"));
const MessagesPage = lazy(() => import("./pages/admin/MessagesPage"));
const TasksPage = lazy(() => import("./pages/admin/TasksPage"));
const AIIntelligencePage = lazy(() => import("./pages/admin/AIIntelligencePage"));
const ClientPortalAdminPage = lazy(() => import("./pages/admin/ClientPortalPage"));
const StaffPortal = lazy(() => import("./pages/staff/StaffPortal"));
const StaffLoginPage = lazy(() => import("./pages/staff/StaffLoginPage"));
const StaffResetPasswordPage = lazy(() => import("./pages/staff/StaffResetPasswordPage"));

// Client Portal Pages
const PortalLoginPage = lazy(() => import("./pages/portal/PortalLoginPage"));
const PortalDashboardPage = lazy(() => import("./pages/portal/PortalDashboardPage"));
const PortalRequestPage = lazy(() => import("./pages/portal/PortalRequestPage"));

const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const BlogIndex = lazy(() => import("./pages/blog/BlogIndex"));
const HowToStartCleaningBusiness = lazy(() => import("./pages/blog/HowToStartCleaningBusiness"));
const BookingKoalaVsJobberVsTidywise = lazy(() => import("./pages/blog/BookingKoalaVsJobberVsTidywise"));
const CleaningBusinessCRM = lazy(() => import("./pages/blog/CleaningBusinessCRM"));
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
const PricingPage = lazy(() => import("./pages/PricingPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const RedirectPage = lazy(() => import("./pages/RedirectPage"));
const CardSavedPage = lazy(() => import("./pages/CardSavedPage"));
const TipPage = lazy(() => import("./pages/TipPage"));
const DepositPage = lazy(() => import("./pages/DepositPage"));

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
      {/* AuthProviderNoSession MUST wrap AuthProvider since AuthProvider uses useAuthNoSession */}
      <AuthProviderNoSession>
        <AuthProvider>
          <SessionTrackerProvider>
            <OrganizationProvider>
              <TestModeProvider>
                <ClientPortalProvider>
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
                      {/* Auth Routes - No Session Persistence */}
                        {/* On native: redirect signup to website (App Store compliance) */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<NativeSignupRedirect />} />
                        <Route path="/logout" element={<LogoutPage />} />
                        
                      {/* Public Routes - Critical Path */}
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/auth" element={<AuthPage />} />

                      {/* Public Routes - Lazy Loaded */}
                      <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
                      <Route path="/c/:code" element={<RedirectPage />} />
                      <Route path="/card-saved" element={<CardSavedPage />} />
                      <Route path="/tip/:token" element={<TipPage />} />
                      <Route path="/deposit/:token" element={<DepositPage />} />
                      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                      <Route path="/pricing" element={<PricingPage />} />
                      <Route path="/onboarding" element={<OnboardingPage />} />
                      <Route path="/review/:token" element={<ReviewPage />} />
                      <Route path="/blog" element={<BlogIndex />} />
                      <Route path="/blog/how-to-start-a-cleaning-business" element={<HowToStartCleaningBusiness />} />
                      <Route path="/blog/booking-koala-vs-jobber-vs-tidywise" element={<BookingKoalaVsJobberVsTidywise />} />
                      <Route path="/blog/crm-for-cleaning-business" element={<CleaningBusinessCRM />} />
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

                      {/* Client Portal */}
                      <Route path="/portal" element={<PortalLoginPage />} />
                      <Route path="/portal/dashboard" element={<ProtectedPortalRoute><PortalDashboardPage /></ProtectedPortalRoute>} />
                      <Route path="/portal/request" element={<ProtectedPortalRoute><PortalRequestPage /></ProtectedPortalRoute>} />

                      {/* Dashboard Routes - All Lazy Loaded (AdminRoute enforces owner/admin role) */}
                      <Route path="/dashboard" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/scheduler" element={<AdminRoute><ErrorBoundary featureName="Scheduler"><SchedulerPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/bookings" element={<AdminRoute><ErrorBoundary featureName="Bookings"><BookingsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/customers" element={<AdminRoute><ErrorBoundary featureName="Customers"><CustomersPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/services" element={<AdminRoute><ErrorBoundary featureName="Services"><ServicesPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/staff" element={<AdminRoute><ErrorBoundary featureName="Staff Management"><StaffPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/payroll" element={<AdminRoute><ErrorBoundary featureName="Payroll"><PayrollPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/finance" element={<AdminRoute><ErrorBoundary featureName="Finance"><FinancePage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/expenses" element={<AdminRoute><ErrorBoundary featureName="Expenses"><ExpensesPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/reports" element={<AdminRoute><ErrorBoundary featureName="Reports"><ReportsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/settings" element={<AdminRoute><ErrorBoundary featureName="Settings"><SettingsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/notifications" element={<AdminRoute><ErrorBoundary featureName="Notifications"><NotificationsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/recurring" element={<AdminRoute><ErrorBoundary featureName="Recurring Bookings"><RecurringBookingsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/leads" element={<AdminRoute><ErrorBoundary featureName="Leads"><LeadsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/inventory" element={<AdminRoute><ErrorBoundary featureName="Inventory"><InventoryPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/invoices" element={<AdminRoute><ErrorBoundary featureName="Invoices"><InvoicesPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/operations" element={<AdminRoute><ErrorBoundary featureName="Operations Tracker"><OperationsTrackerPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/feedback" element={<AdminRoute><ErrorBoundary featureName="Client Feedback"><ClientFeedbackPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/campaigns" element={<AdminRoute><ErrorBoundary featureName="Campaigns"><CampaignsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/checklists" element={<AdminRoute><ErrorBoundary featureName="Checklists"><ChecklistsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/payment-integration" element={<AdminRoute><ErrorBoundary featureName="Payment Integration"><PaymentIntegrationPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/subscription" element={<AdminRoute><ErrorBoundary featureName="Subscription"><SubscriptionPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/help" element={<AdminRoute><ErrorBoundary featureName="Help Center"><HelpPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/discounts" element={<AdminRoute><ErrorBoundary featureName="Discounts"><DiscountsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/messages" element={<AdminRoute><ErrorBoundary featureName="Messages"><MessagesPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/tasks" element={<AdminRoute><ErrorBoundary featureName="Tasks"><TasksPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/platform-analytics" element={<AdminRoute><ErrorBoundary featureName="Platform Analytics"><PlatformAnalyticsPage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/ai-intelligence" element={<AdminRoute><ErrorBoundary featureName="AI Intelligence"><AIIntelligencePage /></ErrorBoundary></AdminRoute>} />
                      <Route path="/dashboard/client-portal" element={<AdminRoute><ErrorBoundary featureName="Client Portal"><ClientPortalAdminPage /></ErrorBoundary></AdminRoute>} />

                      <Route path="/admin" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />
                      <Route path="/admin/*" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />

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
                  {/* Auth Routes - No Session Persistence */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignupPage />} />
                    <Route path="/logout" element={<LogoutPage />} />
                    
                  {/* Public Routes - Critical Path */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/auth" element={<AuthPage />} />

                    {/* Public Routes - Lazy Loaded */}
                    <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
                    <Route path="/c/:code" element={<RedirectPage />} />
                    <Route path="/card-saved" element={<CardSavedPage />} />
                    <Route path="/tip/:token" element={<TipPage />} />
                    <Route path="/deposit/:token" element={<DepositPage />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route path="/review/:token" element={<ReviewPage />} />
                    <Route path="/blog" element={<BlogIndex />} />
                    <Route path="/blog/how-to-start-a-cleaning-business" element={<HowToStartCleaningBusiness />} />
                    <Route path="/blog/booking-koala-vs-jobber-vs-tidywise" element={<BookingKoalaVsJobberVsTidywise />} />
                    <Route path="/blog/crm-for-cleaning-business" element={<CleaningBusinessCRM />} />
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

                    {/* Client Portal */}
                    <Route path="/portal" element={<PortalLoginPage />} />
                    <Route path="/portal/dashboard" element={<ProtectedPortalRoute><PortalDashboardPage /></ProtectedPortalRoute>} />
                    <Route path="/portal/request" element={<ProtectedPortalRoute><PortalRequestPage /></ProtectedPortalRoute>} />

                    <Route path="/dashboard" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/scheduler" element={<AdminRoute><ErrorBoundary featureName="Scheduler"><SchedulerPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/bookings" element={<AdminRoute><ErrorBoundary featureName="Bookings"><BookingsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/customers" element={<AdminRoute><ErrorBoundary featureName="Customers"><CustomersPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/services" element={<AdminRoute><ErrorBoundary featureName="Services"><ServicesPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/staff" element={<AdminRoute><ErrorBoundary featureName="Staff Management"><StaffPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/payroll" element={<AdminRoute><ErrorBoundary featureName="Payroll"><PayrollPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/finance" element={<AdminRoute><ErrorBoundary featureName="Finance"><FinancePage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/expenses" element={<AdminRoute><ErrorBoundary featureName="Expenses"><ExpensesPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/reports" element={<AdminRoute><ErrorBoundary featureName="Reports"><ReportsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/settings" element={<AdminRoute><ErrorBoundary featureName="Settings"><SettingsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/notifications" element={<AdminRoute><ErrorBoundary featureName="Notifications"><NotificationsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/recurring" element={<AdminRoute><ErrorBoundary featureName="Recurring Bookings"><RecurringBookingsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/leads" element={<AdminRoute><ErrorBoundary featureName="Leads"><LeadsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/inventory" element={<AdminRoute><ErrorBoundary featureName="Inventory"><InventoryPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/invoices" element={<AdminRoute><ErrorBoundary featureName="Invoices"><InvoicesPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/operations" element={<AdminRoute><ErrorBoundary featureName="Operations Tracker"><OperationsTrackerPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/feedback" element={<AdminRoute><ErrorBoundary featureName="Client Feedback"><ClientFeedbackPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/campaigns" element={<AdminRoute><ErrorBoundary featureName="Campaigns"><CampaignsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/checklists" element={<AdminRoute><ErrorBoundary featureName="Checklists"><ChecklistsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/payment-integration" element={<AdminRoute><ErrorBoundary featureName="Payment Integration"><PaymentIntegrationPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/subscription" element={<AdminRoute><ErrorBoundary featureName="Subscription"><SubscriptionPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/help" element={<AdminRoute><ErrorBoundary featureName="Help Center"><HelpPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/discounts" element={<AdminRoute><ErrorBoundary featureName="Discounts"><DiscountsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/messages" element={<AdminRoute><ErrorBoundary featureName="Messages"><MessagesPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/tasks" element={<AdminRoute><ErrorBoundary featureName="Tasks"><TasksPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/platform-analytics" element={<AdminRoute><ErrorBoundary featureName="Platform Analytics"><PlatformAnalyticsPage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/ai-intelligence" element={<AdminRoute><ErrorBoundary featureName="AI Intelligence"><AIIntelligencePage /></ErrorBoundary></AdminRoute>} />
                    <Route path="/dashboard/client-portal" element={<AdminRoute><ErrorBoundary featureName="Client Portal"><ClientPortalAdminPage /></ErrorBoundary></AdminRoute>} />

                    {/* Legacy admin routes */}
                    <Route path="/admin" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />
                    <Route path="/admin/*" element={<AdminRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></AdminRoute>} />

                    {/* Catch-all */}
                    <Route path="*" element={<NotFound />} />
                     </Routes>
                   </Suspense>
                 </ErrorBoundary>
                </BrowserRouter>
              )}
              </TooltipProvider>
              </ClientPortalProvider>
              </TestModeProvider>
            </OrganizationProvider>
          </SessionTrackerProvider>
        </AuthProvider>
      </AuthProviderNoSession>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
