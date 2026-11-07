export function loader() {
  return new Response(null, {
    status: 308,
    headers: { Location: "/build", "Cache-Control": "private, no-store" },
  });
}
