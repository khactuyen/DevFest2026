"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, GraduationCap, History, Library, Shapes } from "lucide-react";

const items = [
  { href: "/curricula", label: "Lộ trình học", icon: GraduationCap },
  { href: "/library", label: "Thư viện học liệu", icon: Library },
  { href: "/explore", label: "Khám phá toán học", icon: Compass },
  { href: "/space", label: "Giải toán từng bước", icon: Shapes },
  { href: "/history", label: "Lịch sử hoạt động", icon: History },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={mobile ? "mobile-nav" : "sidebar-nav"} aria-label="Điều hướng chính">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNavigation() {
  return <NavigationLinks />;
}

export function MobileNavigation() {
  return <NavigationLinks mobile />;
}
