/** Built-app browser check with synthetic source and real PDF.js. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator } from "@playwright/test";
import { getBuildSelection } from "../app/lib/build-assist";
import { syntheticPdf } from "../tests/fixtures/native-pdf";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
  withLocalFixtureBrowser,
} from "./local-fixture-browser";
import { localBrowserAccount } from "./local-postgres-supabase";

const authOrigin = "https://local-build.invalid";
const browserZoom = process.env.RESUMIDE_BUILD_BROWSER_ZOOM === "true";
const compilerImage = process.env.RESUMIDE_BUILD_REAL_IMAGE;
const verifyAdmissionExpiry =
  process.env.RESUMIDE_BUILD_ADMISSION_EXPIRY === "true";
assert(
  !verifyAdmissionExpiry || compilerImage,
  "Admission expiry requires the real compiler path",
);
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-build-fixture");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-build-fixture");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.AI_ENABLED, "true");
assert.equal(process.env.BUILD_AI_ASSIST_ENABLED, "true");
assert.equal(process.env.LATEX_CONVERTER_ENABLED, "true");

function assertCompilerReady(image: string) {
  assert.match(image, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(process.env.LATEX_COMPILER_IMAGE, image);
  assert.equal(process.env.DOCKER_HOST, undefined);
  assert.equal(process.env.DOCKER_CONTEXT, undefined);
  const docker = (...args: string[]) =>
    execFileSync("docker", args, { encoding: "utf8", timeout: 5_000 }).trim();
  assert.match(
    docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}"),
    /^unix:\/\/\/[^\r\n]+$/u,
  );
  assert.equal(
    docker(
      "image",
      "inspect",
      "--format",
      "{{.Id}} {{.Os}}/{{.Architecture}}",
      image,
    ),
    image + " linux/arm64",
  );
  assert.equal(
    docker("ps", "-aq", "--filter", "label=resumide.latex.service=converter"),
    "",
  );
}
if (compilerImage !== undefined) assertCompilerReady(compilerImage);

const ownerId = "69110000-0000-4000-8000-000000000003";
const account = localBrowserAccount(ownerId, "build-history@example.test");
const originalLine = "Helped review sample tasks.";
const replacement = "Reviewed sample tasks.";
const original = [
  "\\documentclass{article}",
  "\\pagestyle{empty}",
  "\\begin{document}",
  originalLine,
  "\\newpage",
  "A second synthetic page.",
  "\\end{document}",
].join("\n");
const edited = original.replace(originalLine, replacement);
const selectedLine = original.split("\n").indexOf(originalLine) + 1;
const toPage = (text: string) => `BT /F1 12 Tf 50 740 Td (${text}) Tj ET`;
const makePdf = (line: string) =>
  Buffer.from(syntheticPdf([toPage(line), toPage("A second synthetic page.")]));
const originalPdf = makePdf(originalLine);
const editedPdf = makePdf(replacement);
const sha256 = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
const originalFetch = globalThis.fetch;
let suggestionCalls = 0;
let compileAttempts = 0;
let rateAdmissions = 0;
let admissionExpiryMs: number | null = null;
const compiled: string[] = [];
const verifiedPdfHashes: string[] = [];
function holdCompile() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const holdWhileReadingCode = holdCompile();
const holdWhileCancelHasFocus = holdCompile();
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    const reply = await account.reply(request, url);
    if (reply) return reply;
    assert(compilerImage, "Unexpected fixture request");
    assert.equal(request.method, "POST");
    assert.equal(url.pathname, "/rest/v1/rpc/consume_analysis_rate_limit");
    const userBucket = rateAdmissions % 2 === 0;
    assert.deepEqual(await request.json(), {
      p_key: userBucket ? `latex:user:${sha256(ownerId)}` : "latex:global:v1",
      p_limit: userBucket ? 3 : 20,
      p_window_seconds: 60,
    });
    if (verifyAdmissionExpiry && admissionExpiryMs === null) {
      const started = performance.now();
      return new Promise<Response>((_resolve, reject) => {
        const expired = () => {
          admissionExpiryMs = Math.round(performance.now() - started);
          reject(request.signal.reason);
        };
        if (request.signal.aborted) expired();
        else request.signal.addEventListener("abort", expired, { once: true });
      });
    }
    rateAdmissions += 1;
    return Response.json(true);
  };
  await withLocalFixtureBrowser(
    { authOrigin, ...account, browserZoom, browserChannel: "chrome" },
    "/build",
    async (context, page, base) => {
      const signInUrl = `${base}/auth?next=%2Fbuild`;
      await context.route(signInUrl, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Local sign-in fixture</title>",
        }),
      );
      await page.route(`${base}/build/compile`, async (route) => {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON();
        assert.equal(body.profile, "document");
        assert(body.source === original || body.source === edited);
        compileAttempts += 1;
        if (compileAttempts === 1) {
          assert.equal(body.source, original);
          await route.fulfill({ status: 401 });
          return;
        }
        if (compileAttempts === 2) {
          assert.equal(body.source, original);
          await route.fulfill({
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "X-Latex-Pages": "2",
            },
            body: "",
          });
          return;
        }
        if (compileAttempts === 3) {
          assert.equal(body.source, original);
          await route.fulfill({
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "X-Latex-Pages": "1",
            },
            body: originalPdf,
          });
          return;
        }
        if (verifyAdmissionExpiry && compileAttempts === 4) {
          assert.equal(body.source, original);
          await route.continue();
          return;
        }
        compiled.push(sha256(body.source));
        if (browserZoom && compiled.length === 2)
          await holdWhileReadingCode.promise;
        if (browserZoom && compiled.length === 3)
          await holdWhileCancelHasFocus.promise;
        if (compilerImage) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "private, no-store",
            "X-Latex-Pages": "2",
          },
          body: body.source === original ? originalPdf : editedPdf,
        });
      });
      await page.route(`${base}/build/suggest`, async (route) => {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON();
        assert(body.source === original && body.consent === true);
        assert.equal(body.sourceHash, sha256(original));
        assert.equal(body.startLine, selectedLine);
        assert.equal(body.endLine, selectedLine);
        const selection = getBuildSelection(
          original,
          body.startLine,
          body.endLine,
        );
        suggestionCalls += 1;
        await route.fulfill({
          json: {
            sourceHash: body.sourceHash,
            startLine: body.startLine,
            endLine: body.endLine,
            mode: body.mode,
            originalText: selection.originalText,
            requiresFactConfirmation: false,
            suggestion: {
              operation: "replace",
              replacement,
              explanation: "Use a direct verb.",
              questions: [],
            },
          },
        });
      });
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        let failFirstPage = true;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          ...args: Parameters<typeof getContext>
        ) {
          if (
            failFirstPage &&
            args[0] === "2d" &&
            this.matches('canvas[role="img"][aria-label="PDF page 1 of 2"]')
          ) {
            failFirstPage = false;
            return null;
          }
          return Reflect.apply(getContext, this, args);
        } as typeof getContext;
      });
      if (browserZoom) await setLocalFixtureViewport(page, 390, 740);
      assert.equal((await page.goto(`${base}/build`))?.status(), 200);
      await verifyLocalFixtureZoom(page, 390);
      const editor = page.getByRole("textbox", { name: "LaTeX source" });
      const showPane = async (name: "Code" | "PDF preview") => {
        if (!browserZoom) return;
        const toggle = page.getByRole("button", { name, exact: true });
        if ((await toggle.getAttribute("aria-pressed")) !== "true")
          await toggle.press("Enter");
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
      };
      const fits = (control: Locator) =>
        control.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        });
      const audit = async (selector: string) => {
        if (!browserZoom) return;
        const result = await new AxeBuilder({ page })
          .include(selector)
          .analyze();
        assert.deepEqual(
          result.violations
            .filter(
              ({ impact }) => impact === "serious" || impact === "critical",
            )
            .map(({ id, nodes }) => ({
              id,
              targets: nodes.map(({ target }) => target),
            })),
          [],
        );
      };
      const recompile = page.getByRole("button", {
        name: "Recompile",
        exact: true,
      });
      const workspace = page.locator(
        'section[aria-label="Compilation workspace"]',
      );
      const compileAlert = workspace.getByRole("alert");
      const preview = page.getByRole("region", { name: "PDF preview" });
      const image = (number: number) =>
        preview.getByRole("img", { name: `PDF page ${number} of 2` });
      const readPage = (number: number) =>
        preview.getByRole("region", {
          name: `Extracted text for PDF page ${number}`,
        });
      const download = page.getByRole("link", { name: "Download PDF" });
      const undo = page.getByRole("button", {
        name: "Undo AI edit",
        exact: true,
      });
      const verifyPdf = async (line: string, expected: Buffer) => {
        await showPane("PDF preview");
        if (browserZoom) assert(await fits(recompile), "Recompile must fit");
        const preserveCodePane = browserZoom && verifiedPdfHashes.length === 1;
        const returnFocus = browserZoom && verifiedPdfHashes.length === 2;
        const cancel = workspace.getByRole("button", {
          name: "Cancel",
          exact: true,
        });
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url() === `${base}/build/compile` &&
            response.request().method() === "POST",
        );
        await recompile.press("Enter");
        if (preserveCodePane) {
          await expect(cancel).toBeVisible();
          await showPane("Code");
          await expect(editor).toBeVisible();
          await editor.focus();
          holdWhileReadingCode.release();
        }
        if (returnFocus) {
          await expect(cancel).toBeVisible();
          await cancel.focus();
          holdWhileCancelHasFocus.release();
        }
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert.equal(response.headers()["x-latex-pages"], "2");
        assert.match(response.headers()["cache-control"], /no-store/u);
        const received = await response.body();
        if (!compilerImage) assert.deepEqual(received, expected);
        const receivedHash = sha256(received);
        if (preserveCodePane) {
          const status = workspace
            .getByRole("status", { includeHidden: true })
            .filter({ hasText: "PDF ready. 2 pages." });
          await expect(status).toHaveCount(1);
          await expect(editor).toBeFocused();
          await expect(editor).toHaveValue(edited);
          await expect(
            page.getByRole("button", { name: "Code", exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await showPane("PDF preview");
        }
        if (returnFocus) await expect(recompile).toBeFocused();
        const disclosure = preview.getByText("Read page text", { exact: true });
        if (browserZoom)
          assert(await fits(disclosure), "Text disclosure must fit");
        const firstCompile = verifiedPdfHashes.length === 0;
        if (firstCompile) {
          await expect(preview.getByRole("alert")).toHaveText(
            "This page could not render. You can still download the PDF.",
          );
          await expect(image(1)).toHaveCount(0);
          await expect(download).toBeVisible();
        }
        await disclosure.press("Enter");
        await expect(readPage(1)).toHaveText(line);
        if (firstCompile) {
          const attempts = compileAttempts;
          const retry = preview.getByRole("button", {
            name: "Retry page preview",
          });
          if (browserZoom) assert(await fits(retry), "Preview retry must fit");
          await retry.press("Enter");
          await expect(
            preview.getByRole("region", { name: "PDF page viewport" }),
          ).toBeFocused();
          await expect(preview.getByRole("alert")).toHaveCount(0);
          assert.equal(compileAttempts, attempts);
        }
        await expect(image(1)).toBeVisible();
        if (browserZoom) assert(await fits(download), "PDF download must fit");
        const saved = page.waitForEvent("download");
        await download.press("Enter");
        const file = await saved;
        assert.equal(file.suggestedFilename(), "document.pdf");
        const path = await file.path();
        assert(path);
        assert.equal(sha256(await readFile(path)), receivedHash);
        verifiedPdfHashes.push(receivedHash);
      };
      const verifyInvalidated = async () => {
        await showPane("PDF preview");
        await expect(download).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Download PDF" }),
        ).toBeDisabled();
        await expect(preview.getByRole("img")).toHaveCount(0);
        await expect(preview.getByText("Read page text")).toHaveCount(0);
      };

      await editor.fill(original);
      await editor.press("Control+Enter");
      const signIn = page.getByRole("link", { name: "Sign in in a new tab" });
      await expect(signIn).toBeVisible();
      await expect(compileAlert).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(signIn).toBeFocused();
      const popupPromise = page.waitForEvent("popup");
      await page.keyboard.press("Enter");
      const popup = await popupPromise;
      await popup.waitForURL(signInUrl);
      await expect(popup).toHaveTitle("Local sign-in fixture");
      await popup.close();
      await expect(page).toHaveURL(`${base}/build`);
      await showPane("Code");
      await expect(editor).toHaveValue(original);
      await verifyInvalidated();
      await recompile.press("Enter");
      await expect(compileAlert).toHaveText(
        "Compilation failed. Check your code and try again, or load an example.",
      );
      await verifyInvalidated();
      await recompile.press("Enter");
      await expect(compileAlert).toHaveText(
        "The compiled PDF could not be verified. Your code is still available. Recompile to try again.",
      );
      await verifyInvalidated();
      assert.deepEqual(compiled, []);
      if (verifyAdmissionExpiry) {
        const reply = page.waitForResponse(
          (response) =>
            response.url() === `${base}/build/compile` &&
            response.request().method() === "POST",
        );
        await recompile.press("Enter");
        const response = await reply;
        assert.equal(response.status(), 503);
        assert.equal((await response.json()).code, "runtime_unavailable");
        assert.equal(rateAdmissions, 0);
        await expect(compileAlert).toHaveText(
          "PDF compilation is unavailable right now. Keep your code and try again later.",
        );
        await verifyInvalidated();
        await expect(recompile).toBeEnabled();
      }
      await showPane("Code");
      await expect(editor).toHaveValue(original);
      await verifyPdf(originalLine, originalPdf);
      await preview.getByRole("button", { name: "Next page" }).press("Enter");
      await expect(image(2)).toBeVisible();
      await expect(readPage(2)).toHaveText("A second synthetic page.");
      await expect(readPage(1)).toHaveCount(0);

      if (browserZoom) {
        await setLocalFixtureViewport(page, 320, 640);
        await verifyLocalFixtureZoom(page, 320);
      }
      await showPane("Code");
      await editor.evaluate((target, selected) => {
        const area = target as HTMLTextAreaElement;
        const start = area.value.indexOf(selected);
        area.focus();
        area.setSelectionRange(start, start + selected.length);
        area.dispatchEvent(new Event("select", { bubbles: true }));
      }, originalLine);
      await page
        .getByRole("checkbox", {
          name: "I agree to send this selected context for this request.",
        })
        .press("Space");
      await page
        .getByRole("button", { name: "Ask AI", exact: true })
        .press("Enter");
      const apply = page.getByRole("button", {
        name: "Apply suggestion",
        exact: true,
      });
      await expect(apply).toBeVisible();
      if (browserZoom) assert(await fits(apply), "Suggestion apply must fit");
      await audit('[aria-label="AI suggestion review"]');
      await apply.press("Enter");
      await expect(editor).toHaveValue(edited);
      await verifyInvalidated();
      await verifyPdf(replacement, editedPdf);
      await audit('[aria-label="Compilation workspace"]');

      await showPane("Code");
      await undo.press("Enter");
      await expect(editor).toHaveValue(original);
      await verifyInvalidated();
      await verifyPdf(originalLine, originalPdf);
    },
  );
  assert.equal(suggestionCalls, 1);
  assert.equal(compileAttempts, verifyAdmissionExpiry ? 7 : 6);
  assert.equal(rateAdmissions, compilerImage ? 6 : 0);
  if (verifyAdmissionExpiry) assert(admissionExpiryMs !== null);
  assert.deepEqual(compiled, [
    sha256(original),
    sha256(edited),
    sha256(original),
  ]);
  process.stdout.write(
    JSON.stringify({
      status: compilerImage
        ? "build_pdf_lifecycle_verified_with_real_compiler"
        : "build_pdf_lifecycle_verified_with_simulated_transport",
      compilerImage: compilerImage ?? null,
      compilations: compiled,
      verifiedPdfHashes,
      rateAdmissions,
      admissionExpiryMs,
      suggestionCalls,
      compileAttempts,
      verifiedSignInNewTabAndRetry: true,
      rejectedEmptyPdf: true,
      rejectedInconsistentPdfPageCount: true,
      canvasAndTextVerified: true,
      pageRenderRecoveryVerified: true,
      completedCompileKeptCodePane: browserZoom,
      completedCompileRestoredKeyboardFocus: browserZoom,
      verifiedBrowserZoom: browserZoom,
      browser: "Google Chrome",
    }) + "\n",
  );
} finally {
  holdWhileReadingCode.release();
  holdWhileCancelHasFocus.release();
  globalThis.fetch = originalFetch;
  if (compilerImage) assertCompilerReady(compilerImage);
}
