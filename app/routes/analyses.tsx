import type { HeadersFunction } from "react-router";

export { default, loader, ErrorBoundary } from "./home";
export const meta = () => [
  { title: "Analyses | Resumide" },
  {
    name: "description",
    content: "Your saved resume analyses and their evidence reviews.",
  },
  { name: "robots", content: "noindex, nofollow" },
];

export const headers: HeadersFunction = ({
  parentHeaders,
  loaderHeaders,
  errorHeaders,
}) => {
  const result = new Headers(parentHeaders);
  for (const source of [loaderHeaders, errorHeaders]) {
    if (!source) continue;
    for (const cookie of source.getSetCookie())
      result.append("Set-Cookie", cookie);
  }
  result.set("Cache-Control", "private, no-store");
  result.set("X-Robots-Tag", "noindex, nofollow");
  return result;
};
