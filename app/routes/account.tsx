import {
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type HeadersFunction,
} from "react-router";
import type { Route } from "./+types/account";
import WorkspaceShell from "~/components/WorkspaceShell";
import { authResponseHeaders, getAuthenticatedUser } from "~/lib/server/auth";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";

export const headers: HeadersFunction = () => authResponseHeaders();

async function requireAccountSession(request: Request, headers: Headers) {
  const client = createSupabaseServerClient(request, headers);
  const user = await getAuthenticatedUser(client);
  if (!user)
    throw redirect("/auth?next=/account", {
      headers: authResponseHeaders(headers),
    });
  return { client, user };
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = new Headers();
  const { user } = await requireAccountSession(request, headers);
  return data(
    {
      email: user.email ?? "Email unavailable",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    { headers: authResponseHeaders(headers) },
  );
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request, getServerConfig().APP_ORIGIN);
  const headers = new Headers();
  const { client } = await requireAccountSession(request, headers);
  const formData = await request.formData();
  if (formData.get("action") !== "sign-out-others") {
    return data(
      { error: "Choose a valid account action.", success: null },
      { status: 400, headers: authResponseHeaders(headers) },
    );
  }

  const failed = () =>
    data(
      {
        error: "We could not confirm sign-out on other devices. Try again.",
        success: null,
      },
      { status: 503, headers: authResponseHeaders(headers) },
    );
  try {
    // getUser already authenticated the request. Read only its current token
    // and require the logout endpoint to acknowledge the scoped revocation.
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (sessionError || !token) return failed();
    const { error } = await client.auth.admin.signOut(token, "others");
    if (error) return failed();
  } catch {
    return failed();
  }
  return data(
    {
      error: null,
      success: "Other sessions will end when their current access expires.",
    },
    { headers: authResponseHeaders(headers) },
  );
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
            Sign out on other devices while keeping this browser signed in.
            Other devices may keep access until their current session expires.
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
