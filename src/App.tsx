import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { ProtectedOrgRoute } from "@/components/ProtectedOrgRoute";
import { StaffRoute } from "@/components/StaffRoute";
import { SessionTrackerProvider } from "@/components/SessionTrackerProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LandingPage from "./pages/LandingPage";
import PublicBookingPage from "./pages/PublicBookingPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import SchedulerPage from "./pages/admin/SchedulerPage";
import BookingsPage from "./pages/admin/BookingsPage";
import CustomersPage from "./pages/admin/CustomersPage";
import ServicesPage from "./pages/admin/ServicesPage";
import StaffPage from "./pages/admin/StaffPage";
import PayrollPage from "./pages/admin/PayrollPage";
import FinancePage from "./pages/admin/FinancePage";
import ExpensesPage from "./pages/admin/ExpensesPage";
import ReportsPage from "./pages/admin/ReportsPage";
import SettingsPage from "./pages/admin/SettingsPage";
import NotificationsPage from "./pages/admin/NotificationsPage";
import RecurringBookingsPage from "./pages/admin/RecurringBookingsPage";
import LeadsPage from "./pages/admin/LeadsPage";
import InventoryPage from "./pages/admin/InventoryPage";
import InvoicesPage from "./pages/admin/InvoicesPage";
import OperationsTrackerPage from "./pages/admin/OperationsTrackerPage";
import ClientFeedbackPage from "./pages/admin/ClientFeedbackPage";
import CampaignsPage from "./pages/admin/CampaignsPage";
import ChecklistsPage from "./pages/admin/ChecklistsPage";
import PaymentIntegrationPage from "./pages/admin/PaymentIntegrationPage";
import SubscriptionPage from "./pages/admin/SubscriptionPage";
import HelpPage from "./pages/admin/HelpPage";
import DiscountsPage from "./pages/admin/DiscountsPage";
import PlatformAnalyticsPage from "./pages/admin/PlatformAnalyticsPage";
import MessagesPage from "./pages/admin/MessagesPage";
import TasksPage from "./pages/admin/TasksPage";
import StaffPortal from "./pages/staff/StaffPortal";
import StaffLoginPage from "./pages/staff/StaffLoginPage";
import StaffResetPasswordPage from "./pages/staff/StaffResetPasswordPage";
import ReviewPage from "./pages/ReviewPage";
import BlogIndex from "./pages/blog/BlogIndex";
import HowToStartCleaningBusiness from "./pages/blog/HowToStartCleaningBusiness";
import BookingKoalaVsJobberVsTidywise from "./pages/blog/BookingKoalaVsJobberVsTidywise";
import DynamicBlogPost from "./pages/blog/DynamicBlogPost";
import NotFound from "./pages/NotFound";
import CompareJobber from "./pages/compare/CompareJobber";
import CompareBookingKoala from "./pages/compare/CompareBookingKoala";
import AutomatedDispatching from "./pages/features/AutomatedDispatching";
import QuoteSoftware from "./pages/features/QuoteSoftware";
import SMSNotifications from "./pages/features/SMSNotifications";
import PaymentProcessing from "./pages/features/PaymentProcessing";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";

const queryClient = new QueryClient();

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
              <BrowserRouter>
                <Routes>
                {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
                  <Route path="/auth" element={<AuthPage />} />
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
                  
                  {/* Feature Pages */}
                  <Route path="/features/automated-dispatching" element={<AutomatedDispatching />} />
                  <Route path="/features/quote-software" element={<QuoteSoftware />} />
                  <Route path="/features/sms-notifications" element={<SMSNotifications />} />
                  <Route path="/features/payment-processing" element={<PaymentProcessing />} />

                  {/* Staff Portal (legacy - for staff invited by org owners) */}
                  <Route path="/staff/login" element={<StaffLoginPage />} />
                  <Route path="/staff/reset-password" element={<StaffResetPasswordPage />} />
                  <Route path="/staff" element={<StaffRoute><ErrorBoundary featureName="Staff Portal"><StaffPortal /></ErrorBoundary></StaffRoute>} />

                  {/* Dashboard Routes (Protected by Organization) - All wrapped in ErrorBoundary */}
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

                  {/* Legacy admin routes - redirect to dashboard */}
                  <Route path="/admin" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />
                  <Route path="/admin/*" element={<ProtectedOrgRoute><ErrorBoundary featureName="Dashboard"><AdminDashboard /></ErrorBoundary></ProtectedOrgRoute>} />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
              </TooltipProvider>
            </TestModeProvider>
          </OrganizationProvider>
        </SessionTrackerProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
