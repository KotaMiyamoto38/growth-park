import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import ResetPasswordRequestPage from "@/pages/reset-password-request";
import ResetPasswordPage from "@/pages/reset-password";
import DashboardPage from "@/pages/dashboard";
import LeadsPage from "@/pages/leads";
import SupportersPage from "@/pages/supporters";
import BillingPage from "@/pages/billing";
import MembersPage from "@/pages/members";
import ContractsPage from "@/pages/contracts";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import AdminConnectorDetailPage from "@/pages/admin-connector-detail";
import ConnectorPage from "@/pages/connector";
import ConnectorLeadsPage from "@/pages/connector-leads";
import ConnectorBillingPage from "@/pages/connector-billing";
import MeetingsPage from "@/pages/meetings";


function AuthenticatedApp() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/signup" component={SignupPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/reset-password-request" component={ResetPasswordRequestPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  // Role-based root redirect
  const getRootRedirect = () => {
    if (user?.role === "AddBox") {
      return "/admin";
    } else if (user?.role === "Connector") {
      return `/connectors/${user.id}`;
    }
    return "/admin";
  };

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto ml-64">
        <Switch>
          {/* Root redirect based on role */}
          <Route path="/">
            <Redirect to={getRootRedirect()} />
          </Route>
          
          {/* Admin routes (AddBox only) */}
          <Route path="/admin" component={AdminPage} />
          <Route path="/admin/connectors/:connectorId" component={AdminConnectorDetailPage} />
          
          {/* Connector-specific routes */}
          <Route path="/connectors/:connectorId" component={ConnectorPage} />
          <Route path="/connectors/:connectorId/leads" component={ConnectorLeadsPage} />
          <Route path="/connectors/:connectorId/billing" component={ConnectorBillingPage} />
          
          {/* Legacy routes for backward compatibility */}
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/leads" component={LeadsPage} />
          <Route path="/supporters" component={SupportersPage} />
          <Route path="/billing" component={BillingPage} />
          <Route path="/meetings" component={MeetingsPage} />
          <Route path="/members" component={MembersPage} />
          <Route path="/contracts" component={ContractsPage} />
          <Route path="/settings" component={SettingsPage} />
          
          <Route path="/login">
            <Redirect to={getRootRedirect()} />
          </Route>
          <Route path="/signup">
            <Redirect to={getRootRedirect()} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AuthenticatedApp />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
