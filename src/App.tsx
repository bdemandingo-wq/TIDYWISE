import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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

                {/* Admin Routes (Protected) */}
                <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin/scheduler" element={<ProtectedRoute><SchedulerPage /></ProtectedRoute>} />
                <Route path="/admin/bookings" element={<ProtectedRoute><BookingsPage /></ProtectedRoute>} />
                <Route path="/admin/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
                <Route path="/admin/services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
                <Route path="/admin/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
                <Route path="/admin/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
                <Route path="/admin/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
                <Route path="/admin/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
                <Route path="/admin/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/admin/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                <Route path="/admin/recurring" element={<ProtectedRoute><RecurringBookingsPage /></ProtectedRoute>} />
                <Route path="/admin/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
                <Route path="/admin/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
                <Route path="/admin/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />

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
