export type Role = "learner" | "author" | "admin";
export type AccountStatus = "active" | "suspended";
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  canAuthor?: boolean;
};
export function canAuthor(user: AuthUser | null) { return user?.status === "active" && (user.role === "author" || user.role === "admin" && user.canAuthor === true); }
export function ownsMaterial(user: AuthUser | null, ownerId: string | null | undefined) {
  return user?.status === "active" && user.id === ownerId;
}
export const SESSION_COOKIE = "mv_session";
export const REFRESH_COOKIE = "mv_refresh";
export function ownerKeyFor(userId: string) { return `user_${userId.replace(/-/g, "")}`; }
export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/overview";
  return value;
}
