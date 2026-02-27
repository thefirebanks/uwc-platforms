"use client";

import { type MouseEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Divider, Popover } from "@mui/material";
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
  const pathname = usePathname();
  const { t, language } = useAppLanguage();
  const isAdmin = role === "admin";
  const [pendingNav, setPendingNav] = useState<{
    href: string;
    sourcePath: string | null;
  } | null>(null);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<HTMLElement | null>(
    null,
  );

  const settingsOpen = isAdmin && Boolean(settingsAnchorEl);
  const settingsPopoverId = settingsOpen
    ? "admin-topbar-settings-popover"
    : undefined;
  const settingsLabel = language === "en" ? "Settings" : "Configuración";
  const themeLabel = language === "en" ? "Theme" : "Tema";

  async function logout() {
    setSettingsAnchorEl(null);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearSupabaseBrowserSessionCache();
    resetSupabaseBrowserClient();
    router.push("/login");
    router.refresh();
  }

  function openSettingsMenu(event: MouseEvent<HTMLButtonElement>) {
    setSettingsAnchorEl(event.currentTarget);
  }

  function closeSettingsMenu() {
    setSettingsAnchorEl(null);
  }

  useEffect(() => {
    if (!isAdmin) return;

    for (const href of ["/admin", "/admin/processes", "/admin/candidates", "/admin/audit"]) {
      if (href !== pathname) {
        router.prefetch(href);
      }
    }
  }, [isAdmin, pathname, router]);

  useEffect(() => {
    if (!pendingNav) return;

    const timeoutId = window.setTimeout(() => {
      setPendingNav(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [pendingNav]);

  useEffect(() => {
    if (!pendingNav) return;

    const navigationSettled =
      pathname === pendingNav.href || pathname !== pendingNav.sourcePath;
    if (!navigationSettled) {
      return;
    }

    const clearId = window.setTimeout(() => {
      setPendingNav((current) => {
        if (!current) {
          return null;
        }

        if (
          current.href === pendingNav.href &&
          current.sourcePath === pendingNav.sourcePath
        ) {
          return null;
        }

        return current;
      });
    }, 0);

    return () => window.clearTimeout(clearId);
  }, [pathname, pendingNav]);

  const isRoutePending = pendingNav !== null && pathname === pendingNav.sourcePath;

  return (
    <header
      className={`topbar ${isAdmin ? "admin-topbar" : ""} ${
        isRoutePending ? "is-route-pending" : ""
      }`}
      aria-busy={isRoutePending ? true : undefined}
    >
      <div className="topbar-left">
        <Link href={isAdmin ? "/admin" : "/applicant"} className="topbar-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          <span>UWC</span> {isAdmin ? "Admin" : "Applicant"}
        </Link>
        <nav className="topbar-nav">
          {isAdmin ? (
            <>
              <NavLink
                href="/admin"
                label={t("nav.home")}
                exact
                onNavigateStart={(href) => setPendingNav({ href, sourcePath: pathname })}
                onPrefetch={router.prefetch}
              />
              <NavLink
                href="/admin/processes"
                label={t("nav.processes")}
                onNavigateStart={(href) => setPendingNav({ href, sourcePath: pathname })}
                onPrefetch={router.prefetch}
              />
              <NavLink
                href="/admin/candidates"
                label={t("nav.candidates")}
                exact
                onNavigateStart={(href) => setPendingNav({ href, sourcePath: pathname })}
                onPrefetch={router.prefetch}
              />
              <NavLink
                href="/admin/audit"
                label={t("nav.audit")}
                exact
                onNavigateStart={(href) => setPendingNav({ href, sourcePath: pathname })}
                onPrefetch={router.prefetch}
              />
            </>
          ) : (
            <NavLink href="/applicant" label={t("nav.processes")} />
          )}
        </nav>
      </div>
      <div className="topbar-right">
        {isAdmin ? (
          <>
            <div className="admin-topbar-status" aria-label="Estado del sistema: en línea">
              <span className="admin-topbar-status-dot" aria-hidden="true" />
              <span>Online</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost admin-topbar-settings-trigger"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              aria-controls={settingsPopoverId}
              onClick={openSettingsMenu}
            >
              {settingsLabel}
            </button>
            <button
              type="button"
              className="admin-topbar-avatar admin-topbar-avatar-btn"
              aria-label={language === "en" ? "Admin profile menu" : "Menú de perfil de admin"}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              aria-controls={settingsPopoverId}
              onClick={openSettingsMenu}
            >
              AD
            </button>
            <Popover
              id={settingsPopoverId}
              open={settingsOpen}
              anchorEl={settingsAnchorEl}
              onClose={closeSettingsMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  className: "admin-topbar-settings-popover-paper",
                },
              }}
            >
              <div className="admin-topbar-settings-panel">
                <div className="admin-topbar-settings-heading">
                  {settingsLabel}
                </div>
                <div className="admin-topbar-settings-block">
                  <LanguageToggle />
                </div>
                <Divider />
                <div className="admin-topbar-settings-row">
                  <span className="admin-topbar-settings-row-label">
                    {themeLabel}
                  </span>
                  <ThemeModeToggle />
                </div>
                <Divider />
                <button
                  type="button"
                  className="btn btn-outline admin-topbar-menu-logout"
                  onClick={logout}
                >
                  {t("nav.logout")}
                </button>
              </div>
            </Popover>
          </>
        ) : (
          <>
            <LanguageToggle />
            <ThemeModeToggle />
            <button
              type="button"
              className="btn btn-ghost admin-topbar-logout"
              onClick={logout}
            >
              {t("nav.logout")}
            </button>
            <div className="admin-topbar-avatar" aria-hidden="true">
              AP
            </div>
          </>
        )}
      </div>
      <div className="topbar-route-progress" aria-hidden="true">
        <div className="topbar-route-progress-bar" />
      </div>
    </header>
  );
}

function NavLink({
  href,
  label,
  exact,
  onNavigateStart,
  onPrefetch,
}: {
  href: string;
  label: string;
  exact?: boolean;
  onNavigateStart?: (href: string) => void;
  onPrefetch?: (href: string) => void;
}) {
  const pathname = usePathname();
  const isProcessNav =
    href === "/admin/processes" &&
    (pathname === "/admin/processes" || pathname?.startsWith("/admin/process/"));
  const isActive = isProcessNav || (exact ? pathname === href : pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={isActive ? "active" : ""}
      onMouseEnter={() => onPrefetch?.(href)}
      onFocus={() => onPrefetch?.(href)}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        if (pathname !== href) {
          onNavigateStart?.(href);
        }
      }}
    >
      {label}
    </Link>
  );
}
