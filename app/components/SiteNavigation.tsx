import { Form, Link, NavLink, useRouteLoaderData } from "react-router";
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
  return (
    <header
      className={`site-navigation workspace-floating-header ${styles.bar}`}
    >
      <Link
        to="/"
        aria-label="Resumide home"
        className={`workspace-brand ${styles.brand}`}
      >
        <BrandLockup compact />
      </Link>
      <nav className={styles.primary} aria-label="Main navigation">
        <MainLinks />
      </nav>
      <details className={styles.menu}>
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
