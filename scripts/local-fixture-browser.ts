import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServerClient } from "@supabase/ssr";
import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createRequestHandler } from "@react-router/express";
import type { ServerBuild } from "react-router";

type LocalApplication = RequestListener & {
  use(handler: RequestListener): void;
  all(path: string, handler: ReturnType<typeof createRequestHandler>): void;
};
const express = createRequire(import.meta.url)("express") as {
  (): LocalApplication;
  static(path: string): RequestListener;
};

const zoomedContexts = new WeakSet<BrowserContext>();

export function setLocalFixtureViewport(
  page: Page,
  width: number,
  height: number,
) {
  const zoom = zoomedContexts.has(page.context()) ? 2 : 1;
  return page.setViewportSize({ width: width * zoom, height: height * zoom });
}

export async function verifyLocalFixtureZoom(page: Page, width: number) {
  if (!zoomedContexts.has(page.context())) return;
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: window.innerWidth,
        pixelRatio: window.devicePixelRatio,
        visualScale: window.visualViewport?.scale,
      })),
    )
    .toEqual({ width, pixelRatio: 2, visualScale: 1 });
  process.stdout.write(
    `Chromium verified 200% browser zoom at ${width} CSS pixels.\n`,
  );
}

export async function withLocalFixtureBrowserContext(
  browserZoom: boolean,
  visit: (context: BrowserContext) => Promise<void>,
  channel?: "chrome",
) {
  const browser = browserZoom ? null : await chromium.launch({ channel });
  let context: BrowserContext | undefined;
  try {
    context = browser
      ? await browser.newContext({ acceptDownloads: true })
      : await chromium.launchPersistentContext("", {
          channel: channel ?? "chromium",
          acceptDownloads: true,
          locale: "en-US",
        });
    if (browserZoom) {
      const settings = context.pages()[0] ?? (await context.newPage());
      await settings.goto("chrome://settings/appearance");
      const zoom = settings.getByRole("combobox", { name: "Page zoom" });
      await zoom.selectOption({ label: "200%" }, { timeout: 10000 });
      await expect(zoom.locator("option:checked")).toHaveText("200%");
      await settings.close();
      zoomedContexts.add(context);
    }
    await visit(context);
  } finally {
    if (browser) await browser.close();
    else await context?.close();
  }
}

export async function withLocalFixtureBrowser(
  fixture: {
    authOrigin: string;
    email: string;
    password: string;
    analysisId?: string;
    buildAiEnabled?: boolean;
    browserZoom?: boolean;
    browserChannel?: "chrome";
  },
  path: "/evidence" | "/score" | "/build",
  visit: (context: BrowserContext, page: Page, base: string) => Promise<void>,
) {
  const buildFixture = path === "/build";
  assert.match(
    fixture.authOrigin,
    buildFixture
      ? /^https:\/\/local-build\.invalid$/u
      : /^https:\/\/local-(?:cv04|a10)\.invalid$/u,
  );
  assert.equal(process.env.SUPABASE_URL, fixture.authOrigin);
  assert.equal(
    process.env.AI_ENABLED,
    buildFixture && fixture.buildAiEnabled !== false ? "true" : "false",
  );
  if (buildFixture)
    assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
  else assert(fixture.analysisId);
  // Token issuance and user lookup are simulated by the calling test process.
  // Use the actual SDK to serialize the session cookies read by SSR.
  const cookies = new Map<string, string>();
  const auth = createServerClient(fixture.authOrigin, "synthetic-unused", {
    global: { fetch: globalThis.fetch },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
  });
  const signedIn = await auth.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });
  assert(signedIn.data.session && !signedIn.error && cookies.size);

  const app = express();
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    process.env.APP_ORIGIN = origin;
    const buildUrl = pathToFileURL(resolve("build/server/index.js")).href;
    const build = (await import(buildUrl)) as ServerBuild;
    app.use(express.static(resolve("build/client")));
    app.use(express.static(resolve("public")));
    app.all("/{*splat}", createRequestHandler({ build, mode: "production" }));

    await withLocalFixtureBrowserContext(
      fixture.browserZoom ?? false,
      async (context) => {
        await context.route("**/*", async (route) => {
          if (new URL(route.request().url()).origin === origin)
            await route.continue();
          else await route.abort();
        });
        const base = buildFixture
          ? origin
          : `${origin}/analysis/${fixture.analysisId}`;
        const anonymous = await context.request.get(`${base}${path}`, {
          maxRedirects: 0,
        });
        assert.equal(anonymous.status(), 302);
        await context.addCookies(
          [...cookies].map(([name, value]) => ({
            name,
            value,
            url: origin,
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        );
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await visit(context, page, base);
      },
      fixture.browserChannel,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done, fail) => {
      server.close((error) => (error ? fail(error) : done()));
    });
  }
}
