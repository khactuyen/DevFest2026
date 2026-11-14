import type { Metadata } from "next";
import "../../node_modules/jsxgraph/distrib/jsxgraph.css";
import "./globals.css";
import "./auth.css";
import { SiteChrome } from "@/components/SiteChrome";
import { AuthProvider } from "@/components/AuthProvider";
import { getAuthContext } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MathCos · Không gian khám phá toán học",
  description: "Khám phá, giải toán và tạo học liệu tương tác.",
  icons: { icon: "/mathcos-icon.png", apple: "/mathcos-apple-touch-icon.png" },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext().catch(() => ({ user: null }));
  return (
    <html lang="vi">
      <head><link rel="stylesheet" href="/legacy-fonts.css" /></head>
      <body>
        <AuthProvider user={user}><div className="main-shell"><SiteChrome>{children}</SiteChrome></div></AuthProvider>
      </body>
    </html>
  );
}
