"use client";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
export function AuthorAccess() {
  const user = useAuth();
  return (
    <Link className="subtle" href={user ? "/account" : "/login"}>{user ? "Tài khoản và quyền" : "Đăng nhập"}</Link>
  );
}
