import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { UploadPage } from "./pages/UploadPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DeepInsightsPage } from "./pages/DeepInsightsPage";
import { AppHeader } from "./components/layout/AppHeader";
import { useState, useEffect } from "react";
import { salesApi } from "./api/salesApi";
import { FilterSidebar } from "./components/shared/FilterSidebar";
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet";
import { Button } from "./components/ui/button";
import { Filter } from "lucide-react";
import type { FilterParams } from "./api/salesApi";

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function UserRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === "admin") return <Navigate to="/upload" replace />;
  return <>{children}</>;
}

function AppLayout({ children, filters, dates, onFiltersChange, showFilters }: {
  children: React.ReactNode;
  filters?: FilterParams;
  dates?: string[];
  onFiltersChange?: (f: FilterParams) => void;
  showFilters?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-[1600px] px-4 py-6">
        {showFilters && filters && dates && onFiltersChange ? (
          <div className="flex gap-6">
            {/* Desktop Sidebar */}
            <aside className="hidden md:block w-52 shrink-0">
              <div className="sticky top-20 overflow-y-auto max-h-[calc(100vh-5rem)]">
                <FilterSidebar
                  filters={filters}
                  dates={dates}
                  onChange={onFiltersChange}
                />
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0">
              {/* Mobile filter button */}
              <div className="flex items-center justify-between mb-4 md:hidden">
                <h1 className="text-lg font-bold">Sales Dashboard</h1>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-1" /> Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 overflow-y-auto">
                    <div className="mt-6">
                      <FilterSidebar
                        filters={filters}
                        dates={dates}
                        onChange={onFiltersChange}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              {children}
            </main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  const [filters, setFilters] = useState<FilterParams>({});
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    if (isAuthenticated && user?.role !== "admin") {
      salesApi
        .getDates()
        .then((res) => {
          const d = res.data.dates || [];
          setDates(d);
          if (d.length > 0) {
            setFilters((prev) => ({ ...prev, date: d[0] }));
          }
        })
        .catch(console.error);
    }
  }, [isAuthenticated, user]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === "admin" ? "/upload" : "/"} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/"
        element={
          <UserRoute>
            <AppLayout
              filters={filters}
              dates={dates}
              onFiltersChange={setFilters}
              showFilters={true}
            >
              <DashboardPage filters={filters} />
            </AppLayout>
          </UserRoute>
        }
      />
      <Route
        path="/insights"
        element={
          <UserRoute>
            <AppLayout
              filters={filters}
              dates={dates}
              onFiltersChange={setFilters}
              showFilters={true}
            >
              <DeepInsightsPage filters={filters} />
            </AppLayout>
          </UserRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <AdminRoute>
            <AppLayout>
              <UploadPage />
            </AppLayout>
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}