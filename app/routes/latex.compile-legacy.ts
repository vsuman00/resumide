function redirectToBuildCompile() {
  return new Response(null, {
    status: 307,
    headers: {
      Location: "/build/compile",
      "Cache-Control": "private, no-store",
    },
  });
}

export const action = redirectToBuildCompile;
export const loader = redirectToBuildCompile;
