"use client";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { canAuthor } from "@/lib/auth/types";
export function AccessGate({ author = false, children }: { author?: boolean; children: React.ReactNode }) {
  const user = useAuth();
  if (user?.status === "active" && (!author || canAuthor(user))) return <>{children}</>;
  return <main className="auth-page"><section className="auth-card"><h1>{user ? "Quyền truy cập" : "Đăng nhập để tiếp tục"}</h1><p>{user?.status === "suspended" ? "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên." : user ? "Cần quyền tác giả để biên soạn lộ trình." : "Lưu bài giải, theo dõi tiến độ và mở lại công việc trên tài khoản của bạn."}</p><Link className="primary" href={user ? "/account" : "/login"}>{user ? "Về tài khoản" : "Đăng nhập"}</Link></section></main>;
}
