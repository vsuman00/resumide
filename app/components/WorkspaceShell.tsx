import type { ReactNode } from "react";
import { Form, Link, NavLink, useRouteLoaderData } from "react-router";
import ThemeControl from "~/components/ThemeControl";
import BrandLockup from "~/components/BrandLockup";

interface RootLoaderData {
  user: { email?: string } | null;
}

interface WorkspaceShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

const primaryNavigation = [
  { to: "/", label: "Analyses", end: true },
  { to: "/upload", label: "New analysis" },
];

const utilityNavigation = [
  { to: "/privacy", label: "Privacy" },
  { to: "/account", label: "Account" },
];

function NavigationLink({
  to,
  label,
  end = false,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `workspace-nav-link${isActive ? " is-active" : ""}`
      }
    >
      {label}
    </NavLink>
  );
}

const WorkspaceShell = ({
  eyebrow,
  title,
  description,
  action,
  children,
}: WorkspaceShellProps) => {
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;

  return (
    <div className="workspace-shell">
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <Link to="/" className="workspace-brand" aria-label="Resumide analyses">
          <BrandLockup />
        </Link>
        <p className="workspace-label">Evidence desk</p>

        <nav className="workspace-nav-list" aria-label="Analysis navigation">
          {primaryNavigation.map((item) => (
            <NavigationLink key={item.to} {...item} />
          ))}
        </nav>

        <div className="workspace-rail-footer">
          <ThemeControl />
          <nav className="workspace-nav-list" aria-label="Account navigation">
            {utilityNavigation.map((item) => (
              <NavigationLink key={item.to} {...item} />
            ))}
          </nav>
          {rootData?.user ? (
            <Form method="post" action="/auth/logout">
              <button type="submit" className="workspace-sign-out">
                Sign out
              </button>
            </Form>
          ) : null}
        </div>
      </aside>

      <header className="workspace-mobile-header">
        <Link to="/" className="workspace-brand" aria-label="Resumide analyses">
          <BrandLockup compact />
        </Link>
        <ThemeControl />
        {rootData?.user ? (
          <Form method="post" action="/auth/logout">
            <button type="submit" className="workspace-sign-out">
              Sign out
            </button>
          </Form>
        ) : null}
      </header>

      <div className="workspace-stage">
        <header className="workspace-page-header">
          <div className="workspace-page-heading">
            {eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {description ? (
              <p className="workspace-page-description">{description}</p>
            ) : null}
          </div>
          {action ? (
            <div className="workspace-page-action">{action}</div>
          ) : null}
        </header>
        <main className="workspace-main">{children}</main>
      </div>

      <nav className="workspace-mobile-tabs" aria-label="Workspace navigation">
        {primaryNavigation.map((item) => (
          <NavigationLink key={item.to} {...item} />
        ))}
        {utilityNavigation.map((item) => (
          <NavigationLink key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
};

export default WorkspaceShell;
