import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { AdminRoute } from "@/components/AdminRoute";
import { StaffRoute } from "@/components/StaffRoute";
import PublicBookingPage from "./pages/PublicBookingPage";
import AuthPage from "./pages/AuthPage";
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
import StaffPortal from "./pages/staff/StaffPortal";
import StaffLoginPage from "./pages/staff/StaffLoginPage";
import StaffResetPasswordPage from "./pages/staff/StaffResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TestModeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<PublicBookingPage />} />
                <Route path="/auth" element={<AuthPage />} />

                {/* Staff Portal */}
                <Route path="/staff/login" element={<StaffLoginPage />} />
                <Route path="/staff/reset-password" element={<StaffResetPasswordPage />} />
                <Route path="/staff" element={<StaffRoute><StaffPortal /></StaffRoute>} />

                {/* Admin Routes (Admin-only) */}
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/scheduler" element={<AdminRoute><SchedulerPage /></AdminRoute>} />
                <Route path="/admin/bookings" element={<AdminRoute><BookingsPage /></AdminRoute>} />
                <Route path="/admin/customers" element={<AdminRoute><CustomersPage /></AdminRoute>} />
                <Route path="/admin/services" element={<AdminRoute><ServicesPage /></AdminRoute>} />
                <Route path="/admin/staff" element={<AdminRoute><StaffPage /></AdminRoute>} />
                <Route path="/admin/payroll" element={<AdminRoute><PayrollPage /></AdminRoute>} />
                <Route path="/admin/finance" element={<AdminRoute><FinancePage /></AdminRoute>} />
                <Route path="/admin/expenses" element={<AdminRoute><ExpensesPage /></AdminRoute>} />
                <Route path="/admin/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
                <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
                <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
                <Route path="/admin/recurring" element={<AdminRoute><RecurringBookingsPage /></AdminRoute>} />
                <Route path="/admin/leads" element={<AdminRoute><LeadsPage /></AdminRoute>} />
                <Route path="/admin/inventory" element={<AdminRoute><InventoryPage /></AdminRoute>} />
                <Route path="/admin/invoices" element={<AdminRoute><InvoicesPage /></AdminRoute>} />
                <Route path="/admin/operations" element={<AdminRoute><OperationsTrackerPage /></AdminRoute>} />
                <Route path="/admin/feedback" element={<AdminRoute><ClientFeedbackPage /></AdminRoute>} />
                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </TestModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
