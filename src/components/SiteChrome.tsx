"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";

const sharedSections = ["/overview", "/space", "/explore", "/library", "/studio", "/history", "/account", "/admin", "/curricula", "/learn", "/login", "/register", "/forgot-password", "/reset-password"];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNavigation = pathname === "/" || sharedSections.some((section) =>
    pathname === section || pathname.startsWith(`${section}/`));

  if (!showNavigation) return <>{children}</>;

  return <>
    <AppHeader />
    <div className="site-chrome-content">{children}</div>
  </>;
}
