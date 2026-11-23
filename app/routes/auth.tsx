import { z } from "zod";
import { useEffect, useRef } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
  type HeadersFunction,
} from "react-router";
import type { Route } from "./+types/auth";
import PublicShell from "~/components/PublicShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import { authResponseHeaders, safeReturnTo } from "~/lib/server/auth";
import { getServerConfig } from "~/lib/server/config";
import { assertSameOrigin } from "~/lib/server/security";
import { createSupabaseServerClient } from "~/lib/server/supabase";

const EmailSchema = z.string().trim().email();

interface AuthActionData {
  error?: string;
  errorField?: "email";
  success?: string;
}

export function meta() {
  return [{ title: "Resumide | Sign in" }];
}

export const headers: HeadersFunction = ({ actionHeaders }) =>
  authResponseHeaders(actionHeaders);

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  assertSameOrigin(request, getServerConfig().APP_ORIGIN);
  const form = await request.formData();
  const email = EmailSchema.safeParse(form.get("email"));
  const next = form.get("next");
  const returnTo = safeReturnTo(typeof next === "string" ? next : null);
  const responseHeaders = new Headers();
  const reply = (data: AuthActionData) =>
    Response.json(data, { headers: authResponseHeaders(responseHeaders) });

  if (!email.success) {
    return reply({
      error: "Enter a valid email address.",
      errorField: "email",
    });
  }

  const callbackUrl = new URL("/auth/callback", getServerConfig().APP_ORIGIN);
  callbackUrl.searchParams.set("next", returnTo);
  const failed = () =>
    reply({ error: "We could not send a sign-in link. Try again shortly." });
  try {
    const client = createSupabaseServerClient(request, responseHeaders);
    const { error } = await client.auth.signInWithOtp({
      email: email.data,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) return failed();
  } catch {
    return failed();
  }

  return reply({ success: "Check your email for a secure sign-in link." });
}

export default function Auth() {
  const actionData = useActionData<typeof action>() as
    AuthActionData | undefined;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const next = safeReturnTo(searchParams.get("next"));
  const invalidLink = searchParams.get("error") === "invalid_link";
  const isSubmitting = navigation.state === "submitting";
  const emailInvalid = actionData?.errorField === "email";
  const emailInputRef = useRef<HTMLInputElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const sendErrorRef = useRef<HTMLParagraphElement>(null);
  const showedConfirmation = useRef(false);

  useEffect(() => {
    const returningToForm = showedConfirmation.current;
    showedConfirmation.current = Boolean(actionData?.success);
    if (actionData?.success) successHeadingRef.current?.focus();
    else if (emailInvalid || returningToForm) emailInputRef.current?.focus();
    else if (actionData?.error) sendErrorRef.current?.focus();
    else if (invalidLink) recoveryHeadingRef.current?.focus();
  }, [actionData, emailInvalid, invalidLink]);

  return (
    <PublicShell>
      <main className="auth-page">
        <section className="auth-layout" aria-labelledby="sign-in-title">
          <aside
            className="auth-trust-panel"
            aria-labelledby="auth-trust-heading"
          >
            <p className="workspace-eyebrow">Private by design</p>
            <h2 id="auth-trust-heading">Keep every review private.</h2>
            <p>
              Sign in once to keep your results durable, private, and available
              across devices.
            </p>
            <EvidenceScene3D
              variant="auth"
              compact
              label="Private three dimensional resume workspace"
            />
            <div className="auth-privacy-signal">
              <span className="auth-privacy-mark" aria-hidden="true" />
              <div>
                <strong>Private workspace</strong>
                <small>Only you can open your saved analyses.</small>
              </div>
            </div>
            <ul>
              <li>Private analysis history</li>
              <li>Durable results and source evidence</li>
              <li>No password to remember</li>
            </ul>
          </aside>

          <section className="auth-form-panel">
            {actionData?.success ? (
              <div className="auth-success-state">
                <h1
                  id="sign-in-title"
                  ref={successHeadingRef}
                  tabIndex={-1}
                  aria-describedby="sign-in-confirmation"
                >
                  Check your email
                </h1>
                <p id="sign-in-confirmation" role="status" aria-live="polite">
                  {actionData.success}
                </p>
                <p>
                  Open the link in this browser to continue where you left off.
                </p>
                <Link
                  to={`/auth?next=${encodeURIComponent(next)}`}
                  className="back-button w-fit"
                >
                  Use another email
                </Link>
              </div>
            ) : (
              <>
                <h1 id="sign-in-title">Sign in to Resumide</h1>
                <p className="auth-form-intro">
                  Enter your email address and we will send a secure,
                  password-free sign-in link.
                </p>

                {invalidLink ? (
                  <section className="auth-message is-error" role="alert">
                    <h2
                      ref={recoveryHeadingRef}
                      tabIndex={-1}
                      aria-describedby="sign-in-recovery"
                    >
                      This sign-in link could not be used
                    </h2>
                    <p id="sign-in-recovery">
                      Request a new link below, then open it in this browser.
                    </p>
                  </section>
                ) : null}

                {actionData?.error && !emailInvalid ? (
                  <p
                    ref={sendErrorRef}
                    className="field-error"
                    tabIndex={-1}
                    role="alert"
                  >
                    {actionData.error}
                  </p>
                ) : null}
                <Form
                  method="post"
                  className="auth-form"
                  aria-busy={isSubmitting}
                >
                  <input type="hidden" name="next" value={next} />
                  <div className="form-div">
                    <label htmlFor="email">Email address</label>
                    <input
                      id="email"
                      ref={emailInputRef}
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      aria-describedby={
                        emailInvalid ? "email-error" : undefined
                      }
                      aria-invalid={emailInvalid || undefined}
                    />
                    {emailInvalid ? (
                      <p id="email-error" className="field-error" role="alert">
                        {actionData.error}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? "Sending secure link"
                      : "Send secure sign-in link"}
                  </button>
                </Form>
                <p className="auth-helper-copy">No password required.</p>
                <Link to="/" className="back-button w-fit">
                  Return to Resumide
                </Link>
              </>
            )}
          </section>
        </section>
      </main>
    </PublicShell>
  );
}
