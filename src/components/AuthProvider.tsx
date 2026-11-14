"use client";
import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { setLearnerIdentity } from "@/lib/learner";
const AuthContext = createContext<AuthUser | null>(null);
export function AuthProvider({ user, children }: { user: AuthUser | null; children: React.ReactNode }) {
  if (typeof window !== "undefined") setLearnerIdentity(user?.status === "active" ? user.id : null);
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
