// Component tests wait on async UI with Testing Library's findBy* and waitFor. Its default wait is
// 1 s, which a shared CI runner under a 360-file suite regularly exceeds (cold module loads, many
// workers). Five seconds keeps real hangs failing quickly while removing that flake. Node-only
// tests have no document, so they skip this.
if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });
}

export {};
