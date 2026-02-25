"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { useAppLanguage } from "@/components/language-provider";
import type { AppRole } from "@/types/domain";
import {
  clearSupabaseBrowserSessionCache,
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import { ThemeModeToggle } from "@/components/theme-mode-toggle";

export function TopNav({ role }: { role: AppRole }) {
  const router = useRouter();
  const { t } = useAppLanguage();

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearSupabaseBrowserSessionCache();
    resetSupabaseBrowserClient();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link href={role === "admin" ? "/admin" : "/applicant"} className="topbar-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          <span>UWC</span> {role === "admin" ? "Admin" : "Applicant"}
        </Link>
        <nav className="topbar-nav">
          {role === "admin" ? (
            <>
              <NavLink href="/admin" label={t("nav.processes")} exact />
              <NavLink href="/admin/audit" label={t("nav.audit")} />
            </>
          ) : (
            <NavLink href="/applicant" label={t("nav.processes")} />
          )}
        </nav>
      </div>
      <div className="topbar-right">
        <LanguageToggle />
        <ThemeModeToggle />
        <button className="btn btn-outline" onClick={logout} style={{ border: "none" }}>{t("nav.logout")}</button>
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--maroon)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 500 }}>
          {role === "admin" ? "AD" : "AP"}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname?.startsWith(href);
  
  return (
    <Link href={href} className={isActive ? "active" : ""}>
      {label}
    </Link>
  );
}
