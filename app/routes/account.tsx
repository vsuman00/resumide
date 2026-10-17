import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/account";
import WorkspaceShell from "~/components/WorkspaceShell";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";

async function requireRouteUser(request: Request, headers: Headers) {
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, headers),
  );
  if (!user) throw redirect("/auth?next=/account", { headers });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = new Headers();
  const user = await requireRouteUser(request, headers);
  return {
    email: user.email ?? "Email unavailable",
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request, getServerConfig().APP_ORIGIN);
  const headers = new Headers();
  const user = await requireRouteUser(request, headers);
  const formData = await request.formData();
  if (formData.get("action") !== "sign-out-others") {
    return { error: "Choose a valid account action." };
  }

  const { error } = await createSupabaseServerClient(
    request,
    headers,
  ).auth.signOut({
    scope: "others",
  });
  if (error) return { error: "Other sessions could not be signed out." };
  return {
    success: `Other sessions for ${user.email ?? "this account"} were signed out.`,
  };
}

export function meta() {
  return [
    { title: "Resumide | Account" },
    {
      name: "description",
      content: "Review your Resumide account and active session controls.",
    },
  ];
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date) + " UTC";
}

export default function Account() {
  const account = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <WorkspaceShell
      eyebrow="Account controls"
      title="Account"
      description="Review the identity tied to your private evidence workspace and manage active sessions."
    >
      <section
        className="account-page"
        aria-labelledby="account-details-heading"
      >
        <section className="account-card">
          <p className="workspace-eyebrow">Identity</p>
          <h2 id="account-details-heading">Your account</h2>
          <dl className="account-details">
            <div>
              <dt>Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt>Account created</dt>
              <dd>{formatDate(account.createdAt)}</dd>
            </div>
            <div>
              <dt>Last sign in</dt>
              <dd>{formatDate(account.lastSignInAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="account-card" aria-labelledby="session-heading">
          <p className="workspace-eyebrow">Session security</p>
          <h2 id="session-heading">Manage sessions</h2>
          <p>
            Sign out other active sessions if you no longer recognize a device.
            This browser stays signed in.
          </p>
          <Form method="post">
            <button
              className="back-button"
              name="action"
              value="sign-out-others"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing out…" : "Sign out other sessions"}
            </button>
          </Form>
        </section>

        {actionData ? (
          <p
            className={`privacy-status${actionData.error ? " is-error" : ""}`}
            role={actionData.error ? "alert" : "status"}
            aria-live="polite"
          >
            {actionData.error ?? actionData.success}
          </p>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}
