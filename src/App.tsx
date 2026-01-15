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
import DynamicBlogPost from "./pages/blog/DynamicBlogPost";
import NotFound from "./pages/NotFound";

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
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/review/:token" element={<ReviewPage />} />
                  <Route path="/blog" element={<BlogIndex />} />
                  <Route path="/blog/how-to-start-a-cleaning-business" element={<HowToStartCleaningBusiness />} />
                  <Route path="/blog/post/:slug" element={<DynamicBlogPost />} />

                  {/* Staff Portal (legacy - for staff invited by org owners) */}
                  <Route path="/staff/login" element={<StaffLoginPage />} />
                  <Route path="/staff/reset-password" element={<StaffResetPasswordPage />} />
                  <Route path="/staff" element={<StaffRoute><StaffPortal /></StaffRoute>} />

                  {/* Dashboard Routes (Protected by Organization) */}
                  <Route path="/dashboard" element={<ProtectedOrgRoute><AdminDashboard /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/scheduler" element={<ProtectedOrgRoute><SchedulerPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/bookings" element={<ProtectedOrgRoute><BookingsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/customers" element={<ProtectedOrgRoute><CustomersPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/services" element={<ProtectedOrgRoute><ServicesPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/staff" element={<ProtectedOrgRoute><StaffPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/payroll" element={<ProtectedOrgRoute><PayrollPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/finance" element={<ProtectedOrgRoute><FinancePage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/expenses" element={<ProtectedOrgRoute><ExpensesPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/reports" element={<ProtectedOrgRoute><ReportsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/settings" element={<ProtectedOrgRoute><SettingsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/notifications" element={<ProtectedOrgRoute><NotificationsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/recurring" element={<ProtectedOrgRoute><RecurringBookingsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/leads" element={<ProtectedOrgRoute><LeadsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/inventory" element={<ProtectedOrgRoute><InventoryPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/invoices" element={<ProtectedOrgRoute><InvoicesPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/operations" element={<ProtectedOrgRoute><OperationsTrackerPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/feedback" element={<ProtectedOrgRoute><ClientFeedbackPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/campaigns" element={<ProtectedOrgRoute><CampaignsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/checklists" element={<ProtectedOrgRoute><ChecklistsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/payment-integration" element={<ProtectedOrgRoute><PaymentIntegrationPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/subscription" element={<ProtectedOrgRoute><SubscriptionPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/help" element={<ProtectedOrgRoute><HelpPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/discounts" element={<ProtectedOrgRoute><DiscountsPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/messages" element={<ProtectedOrgRoute><MessagesPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/tasks" element={<ProtectedOrgRoute><TasksPage /></ProtectedOrgRoute>} />
                  <Route path="/dashboard/platform-analytics" element={<ProtectedOrgRoute><PlatformAnalyticsPage /></ProtectedOrgRoute>} />

                  {/* Legacy admin routes - redirect to dashboard */}
                  <Route path="/admin" element={<ProtectedOrgRoute><AdminDashboard /></ProtectedOrgRoute>} />
                  <Route path="/admin/*" element={<ProtectedOrgRoute><AdminDashboard /></ProtectedOrgRoute>} />

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
