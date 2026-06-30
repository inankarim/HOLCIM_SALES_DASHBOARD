import { Link, useLocation, useNavigate } from "react-router-dom";
import { BarChart3,  LogOut, Menu, Brain } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import logo from "../../images/lafarge.png"
import { useState } from "react";

export function AppHeader() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [open, setOpen] = useState(false);

  

  const isActive = (p: string) => loc.pathname === p;

  const linkBase =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

  const cls = (p: string) =>
    `${linkBase} ${
      isActive(p)
        ? "bg-white/20 text-white"
        : "text-white/70 hover:text-white hover:bg-white/10"
    }`;

  const navLinks = user?.role === "admin" ? [] : [
    { to: "/", label: "Dashboard", icon: BarChart3 },
    { to: "/insights", label: "Deep Insights", icon: Brain }
    
  ];

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        background: "linear-gradient(to right, #94C12E, #10BBE1, #1D4370)",
      }}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6 py-3">
        {/* Logo */}

      <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <img
          src={logo}
          alt="LafargeHolcim"
          className="h-12 w-12 object-contain rounded-md bg-white p-1 shadow-md shadow-black/20"
        />
      </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={cls(to)}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user && (
            <span className="text-white/70 text-sm hidden md:block">
              {user.name}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 hidden md:flex"
            onClick={() => { logout(); navigate("/login"); }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </Button>

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-white md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="flex flex-col gap-2 mt-6">
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(to)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                ))}
                <hr className="my-2" />
                {user && (
                  <p className="px-3 text-sm text-muted-foreground">{user.name}</p>
                )}
                <button
                  onClick={() => { logout(); navigate("/login"); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}