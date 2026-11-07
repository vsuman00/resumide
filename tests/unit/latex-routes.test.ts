import { describe, expect, it } from "vitest";
import routes from "../../app/routes";
import { loader as legacyPage } from "../../app/routes/latex.legacy";
import {
  action as legacyCompile,
  loader as legacyCompileGet,
} from "../../app/routes/latex.compile-legacy";

describe("Build route registration and legacy compatibility", () => {
  it.each([
    ["/build", "routes/latex.tsx"],
    ["/build/compile", "routes/latex.compile.ts"],
    ["/latex", "routes/latex.legacy.ts"],
    ["/latex/compile", "routes/latex.compile-legacy.ts"],
  ])("registers exactly one %s handler", (path, file) => {
    const matching = routes.filter((entry) => entry.path === path);
    expect(matching).toHaveLength(1);
    expect(matching[0].file).toBe(file);
  });

  it.each([
    "",
    "?next=https%3A%2F%2Fforeign.test",
    "?source=synthetic-redirect-canary",
    "?returnTo=%2F%2Fforeign.test",
  ])(
    "redirects an old page URL to fixed /build without echoing its query: %s",
    async (query) => {
      const request = new Request("https://example.test/latex" + query);
      const response = Reflect.apply(legacyPage, undefined, [
        { request },
      ]) as Response;
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/build");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
    },
  );

  it.each(["POST", "PUT", "PATCH"])(
    "uses a method-preserving redirect for legacy %s compilation without reading source",
    async (method) => {
      const body = JSON.stringify({
        source: "Synthetic redirect body with UTF-8 café.",
        profile: "document",
      });
      const request = new Request(
        "https://example.test/latex/compile?next=https://foreign.test",
        {
          method,
          body,
          headers: {
            Origin: "https://example.test",
            "Content-Type": "application/json",
          },
        },
      );
      const response = Reflect.apply(legacyCompile, undefined, [
        { request },
      ]) as Response;
      expect([307, 308]).toContain(response.status);
      expect(response.headers.get("Location")).toBe("/build/compile");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(request.bodyUsed).toBe(false);
      expect(await response.text()).toBe("");
      const followed = new Request(
        new URL(response.headers.get("Location")!, request.url),
        request,
      );
      expect(followed.method).toBe(method);
      expect(followed.headers.get("Origin")).toBe("https://example.test");
      expect(followed.headers.get("Content-Type")).toBe("application/json");
      expect(await followed.text()).toBe(body);
    },
  );

  it("keeps legacy compile GET on the fixed resource target", () => {
    const request = new Request(
      "https://example.test/latex/compile?target=//foreign.test",
    );
    const response = Reflect.apply(legacyCompileGet, undefined, [
      { request },
    ]) as Response;
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get("Location")).toBe("/build/compile");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
