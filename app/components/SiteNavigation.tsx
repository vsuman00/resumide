import { useEffect, useRef } from "react";
import {
  Form,
  Link,
  NavLink,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import ThemeControl from "./ThemeControl";
import BrandLockup from "./BrandLockup";
import styles from "./SiteNavigation.module.css";

export const siteLinks = [
  { to: "/", label: "Home", end: true },
  { to: "/analyses", label: "Analyses", end: false },
  { to: "/upload", label: "New analysis", end: false },
  { to: "/build", label: "Build", end: false },
];
function MainLinks() {
  return (
    <>
      {siteLinks.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            `${styles.link}${isActive ? ` ${styles.active}` : ""}`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </>
  );
}
export default function SiteNavigation() {
  const root = useRouteLoaderData("root") as { user?: unknown } | undefined;
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  // The header stays mounted across pages, so close the menu after a link is chosen.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);
  return (
    <header
      className={`site-navigation workspace-floating-header ${styles.bar}`}
    >
      {/* Name comes from the visible brand text plus a hidden "home" (WCAG 2.5.3). */}
      <Link to="/" className={`workspace-brand ${styles.brand}`}>
        <BrandLockup compact />
        <span className="sr-only"> home</span>
      </Link>
      <nav className={styles.primary} aria-label="Main navigation">
        <MainLinks />
      </nav>
      <details
        ref={menu}
        className={styles.menu}
        onKeyDown={(event) => {
          // A native select handles its own Escape while its list is open.
          if (event.key !== "Escape" || !menu.current?.open) return;
          if ((event.target as HTMLElement).tagName === "SELECT") return;
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }}
      >
        <summary aria-label="Open site menu">
          Menu <span aria-hidden="true">☰</span>
        </summary>
        <nav aria-label="Site menu">
          <div className={styles.mobileLinks}>
            <MainLinks />
          </div>
          <Link to="/privacy" className={styles.link}>
            Privacy
          </Link>
          <Link to="/account" className={styles.link}>
            Account
          </Link>
          <div className={styles.theme}>
            <ThemeControl />
          </div>
          {root?.user ? (
            <Form method="post" action="/auth/logout">
              <button type="submit" className={styles.signOut}>
                Sign out
              </button>
            </Form>
          ) : (
            <Link to="/auth" className={styles.link}>
              Sign in
            </Link>
          )}
        </nav>
      </details>
    </header>
  );
}
