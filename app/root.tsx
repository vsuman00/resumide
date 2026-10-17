import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import { createSecurityHeaders } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";
import { createThemeBootstrapScript } from "~/lib/theme";
import PublicShell from "~/components/PublicShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import TelemetryReporter from "~/components/TelemetryReporter";
import { responseSecurity } from "~/lib/server/response-security";
import "./app.css";

export const middleware: Route.MiddlewareFunction[] = [responseSecurity];

export async function loader({ request }: Route.LoaderArgs) {
  const responseHeaders = new Headers();
  const config = getServerConfig();
  for (const [name, value] of createSecurityHeaders({
    appOrigin: config.APP_ORIGIN,
    environment: config.NODE_ENV,
    cspMode: config.CSP_MODE,
    cspReportUri: config.CSP_REPORT_URI || undefined,
  })) {
    responseHeaders.set(name, value);
  }
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, responseHeaders),
  );

  return Response.json(
    { user: user ? { email: user.email } : null },
    { headers: responseHeaders },
  );
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,450..600&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript() }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <TelemetryReporter />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <div id="main-content" tabIndex={-1}>
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something needs attention";
  let details =
    "The page could not be loaded. Your saved analyses are still safe.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404 ? "Page not found" : "We could not load this page";
    details =
      error.status === 404
        ? "The address may be outdated, but your saved analyses are still available."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <PublicShell>
      <main className="error-page" aria-labelledby="error-page-heading">
        <section className="error-state-panel">
          <div className="error-state-copy">
            <p className="workspace-eyebrow">Recovery</p>
            <h1 id="error-page-heading">{message}</h1>
            <p>{details}</p>
            <Link to="/" className="primary-button w-fit">
              Return to Resumide
            </Link>
          </div>
          <EvidenceScene3D
            variant="error"
            compact
            label="Three dimensional recovery path"
          />
          {stack ? (
            <details className="error-debug-details">
              <summary>Development details</summary>
              <pre>
                <code>{stack}</code>
              </pre>
            </details>
          ) : null}
        </section>
      </main>
    </PublicShell>
  );
}
