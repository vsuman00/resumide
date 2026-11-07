// Test-only provider HTTP stub. Production files never import this module.
const {
  process,
  Request,
  Response,
  URL,
  TextEncoder,
  DOMException,
  setTimeout,
  clearTimeout,
} = globalThis;
if (
  process.env.BUILD_AI_TEST_HARNESS !== "selected-context-synthetic-only" ||
  process.env.OPENAI_API_KEY !== "build-ai-harness-no-live-key"
) {
  throw Error(
    "The synthetic provider harness requires its explicit non-live guard",
  );
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.hostname !== "api.openai.com") return originalFetch(request);
  if (url.pathname !== "/v1/chat/completions")
    return new Response("{}", { status: 501 });
  const body = await request.json();
  const context = JSON.parse(
    body.messages.find((message) => message.role === "user").content,
  );
  const keys = Object.keys(context).sort().join(",");
  if (
    keys !== "afterContext,beforeContext,mode,selectedText" ||
    body.store !== false ||
    body.max_completion_tokens > 768 ||
    body.tools ||
    new TextEncoder().encode(JSON.stringify(context)).length > 17000 ||
    JSON.stringify(body).includes("FAR_PRIVATE_CANARY")
  ) {
    return Response.json(
      { error: { message: "Synthetic context policy failed" } },
      { status: 400 },
    );
  }
  const selected = context.selectedText;
  if (selected.includes("PROVIDER_FAILURE"))
    return Response.json(
      { error: { message: "PRIVATE_PROVIDER_CANARY" } },
      { status: 503 },
    );
  if (selected.includes("SLOW_OUTPUT") || selected.includes("DELAY_OUTPUT")) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        resolve,
        selected.includes("SLOW_OUTPUT") ? 30000 : 900,
      );
      const stop = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (request.signal.aborted) stop();
      else request.signal.addEventListener("abort", stop, { once: true });
    });
  }
  const suggestion = {
    operation: "replace",
    replacement: selected
      .replace("Helped", "Improved")
      .replace("Original", "Revised"),
    explanation: "A bounded synthetic wording suggestion.",
    questions: [],
  };
  if (selected.includes("UNSAFE_OUTPUT"))
    suggestion.replacement = "\\input{/etc/passwd}";
  if (selected.includes("METRIC_OUTPUT"))
    suggestion.replacement = selected.replace("12", "99");
  if (selected.includes("QUESTION_OUTPUT")) {
    suggestion.operation = "advice";
    suggestion.replacement = null;
    suggestion.questions = ["What evidence supports this wording?"];
  }
  if (selected.includes("HTML_OUTPUT"))
    suggestion.explanation = "<img src=x onerror=alert(1)> Plain text only.";
  return Response.json(
    {
      id: "synthetic-build-completion",
      object: "chat.completion",
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: selected.includes("BAD_JSON")
              ? "{not-json"
              : selected.includes("REFUSE_OUTPUT")
                ? null
                : JSON.stringify(suggestion),
            refusal: selected.includes("REFUSE_OUTPUT")
              ? "Synthetic refusal"
              : null,
          },
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    },
    { headers: { "x-request-id": "synthetic-build-request" } },
  );
};
