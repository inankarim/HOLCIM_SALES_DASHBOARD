import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { setAuthToken } from "../api/axios";
interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const login = useCallback((token: string, userData: User) => {
    // Store token in memory only - never localStorage or cookies
    setAuthToken(token);
    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    // Clear token from memory
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}