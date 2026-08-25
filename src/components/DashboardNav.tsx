"use client";

import Link from "next/link";
import { useState } from "react";

export type DashboardNavItem = { href: string; label: string };

// The dashboard header used to be a single `flex flex-wrap` row of plain
// text links with no responsive treatment at all — fine on desktop (the
// only place this was ever checked, see "Mobile UX pass on public flows"
// in README.md, which explicitly scoped /dashboard/* out). On a real phone
// width, up to 9 unpadded text links wrapped across 3-4 lines above the
// actual page content, each well under the ~44px tap-target size the public
// pages already got in that pass (measured 20-40px tall here). Support
// staff using the dashboard from a phone is now an explicit requirement, so
// this splits into an always-visible desktop row (`hidden sm:flex`, exact
// same links/styling as before) and a hamburger-triggered mobile panel
// (`sm:hidden`) with full-width, generously-padded stacked links instead.
export function DashboardNav({
  navItems,
  settingsHref,
  userLabel,
  signOutAction,
}: {
  navItems: DashboardNavItem[];
  settingsHref: string | null;
  userLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: nav links + settings/user/logout kept as one group opposite
          the logo (same links/styling as the pre-mobile-pass version, just
          both halves combined under a single gap-6 instead of split across
          the header's own justify-between — the logo is the only other
          flex child now, so this reads as "brand" | "everything else",
          same as before, just grouped from the other component boundary). */}
      <div className="hidden items-center gap-6 text-sm sm:flex">
        <nav className="flex items-center gap-4">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-ink-soft hover:text-teal">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {settingsHref && (
            <Link href={settingsHref} className="text-ink-soft hover:text-teal">
              الإعدادات
            </Link>
          )}
          <span className="text-ink-soft">{userLabel}</span>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-outline">
              تسجيل الخروج
            </button>
          </form>
        </div>
      </div>

      {/* Mobile: hamburger toggle, own 44px+ tap target unlike the old bare links. */}
      <button
        type="button"
        aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-lg sm:hidden"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-10 border-b border-border bg-surface px-4 py-2 shadow-lg sm:hidden">
          <nav className="flex flex-col">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-ink-soft hover:text-teal"
              >
                {item.label}
              </Link>
            ))}
            {settingsHref && (
              <Link
                href={settingsHref}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-ink-soft hover:text-teal"
              >
                الإعدادات
              </Link>
            )}
          </nav>
          <div className="flex items-center justify-between gap-3 border-t border-border py-3 text-sm">
            <span className="text-ink-soft">{userLabel}</span>
            <form action={signOutAction}>
              <button type="submit" className="btn btn-outline">
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
