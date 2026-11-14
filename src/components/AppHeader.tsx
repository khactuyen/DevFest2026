"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, User, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

const navLinks = [
  { href: "/", label: "Trang chủ" },
  { href: "/overview", label: "Tổng quan" },
  { href: "/space", label: "Không gian giải" },
  { href: "/explore", label: "Khám phá" },
  { href: "/library", label: "Thư viện" },
  { href: "/studio", label: "Soạn bài" },
  { href: "/history", label: "Lịch sử" },
];
const frequentlyVisited = new Set(["/", "/space", "/explore"]);

function NavigationPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="app-header-link-pending" aria-hidden="true" /> : null;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({ actions }: { actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuth();

  useEffect(() => setMenuOpen(false), [pathname]);

  const links = (mobile = false) => navLinks.filter(item => item.href !== "/studio" || user?.status === "active").map(({ href, label }) => {
    const active = isActive(pathname, href);
    const eager = frequentlyVisited.has(href) && !active;
    return <Link key={href} href={href}
      prefetch={active ? false : eager ? true : undefined}
      onMouseEnter={!active && !eager ? () => router.prefetch(href) : undefined}
      onFocus={!active ? () => router.prefetch(href) : undefined}
      onClick={mobile ? () => setMenuOpen(false) : undefined}
      className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
      {label}<NavigationPending />
    </Link>;
  });

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {/* Brand */}
        <Link className="app-header-brand" href="/">
          <img className="app-header-logo" src="/mathcos-logo.webp" alt="MathCos" width={200} height={32} />
        </Link>

        <nav className="app-header-nav" aria-label="Điều hướng chính">
          {links()}
        </nav>

        <div className="app-header-actions">
          {actions}
          <Link className="app-header-quick-link" href="/explore" prefetch={pathname !== "/explore"}>Bắt đầu ngay</Link>
          <Link className="app-header-avatar" href={user ? "/account" : "/login"} aria-label={user ? "Tài khoản của bạn" : "Đăng nhập"}>
            <User size={18} />
          </Link>
          <Link href={user ? "/account" : "/login"}>{user ? user.displayName || "Tài khoản" : "Đăng nhập"}</Link>
          <button className="app-header-menu-button" type="button" aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={menuOpen} aria-controls="app-header-mobile-nav" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <nav id="app-header-mobile-nav" className={`app-header-mobile-nav ${menuOpen ? "open" : ""}`}
        aria-label="Điều hướng trên thiết bị nhỏ" hidden={!menuOpen}>{links(true)}</nav>
    </header>
  );
}
