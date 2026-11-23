import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const identifier = (value: string) => {
  assert.match(value, /^[a-z_][a-z_0-9]*$/u);
  return value;
};
export const localSqlLiteral = (value: string) =>
  "'" + value.replaceAll("'", "''") + "'";
export const localSqlArgument = (value: unknown) => {
  if (value === null) return "null";
  if (typeof value === "string") return localSqlLiteral(value);
  if (typeof value === "number") {
    assert(Number.isSafeInteger(value));
    return String(value);
  }
  return localSqlLiteral(JSON.stringify(value)) + "::jsonb";
};
export function connectLocalPostgres(
  socket: string | undefined,
  psql: string | undefined,
) {
  assert(
    socket &&
      /^(?:\/private)?\/tmp\/resumide-(?:cv04|a10|a13|build)-[a-z0-9_]+$/u.test(
        socket,
      ),
  );
  assert(psql?.startsWith("/") && psql.endsWith("/psql"));
  function sql(
    source: string,
    role: "postgres" | "service_role" = "service_role",
  ) {
    return execFileSync(
      psql!,
      [
        "-XAtq",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        socket!,
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      {
        input: `set standard_conforming_strings=on; set role ${role};\n${source}`,
        encoding: "utf8",
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
        timeout: 10_000,
      },
    ).trim();
  }
  assert.equal(
    sql(
      "select inet_server_addr() is null and current_setting('listen_addresses') = '';",
      "postgres",
    ),
    "t",
  );

  return sql;
}

const join =
  "active_resume:resumes!resume_versions_resume_id_fkey(id,owner_id,organization_id,status)";
const operators: Record<string, string> = { eq: "=", gt: ">", lte: "<=" };
function tableRead(
  sql: ReturnType<typeof connectLocalPostgres>,
  table: string,
  params: URLSearchParams,
) {
  let select = params.get("select") ?? "*";
  const joined = table === "resume_versions" && select.endsWith("," + join);
  if (joined) select = select.slice(0, -join.length - 1);
  const columns =
    select === "*"
      ? "t.*"
      : select
          .split(",")
          .map((name) => "t." + identifier(name))
          .join(",");
  const source = joined
    ? `public.${table} t join public.resumes r on r.id=t.resume_id`
    : `public.${table} t`;
  const fields = joined ? columns + ", to_jsonb(r) as active_resume" : columns;
  const filters = [...params]
    .filter(([key]) => !["select", "order", "limit", "offset"].includes(key))
    .map(([key, filter]) => {
      const separator = filter.indexOf(".");
      const operation = filter.slice(0, separator);
      const op = Object.hasOwn(operators, operation)
        ? operators[operation]
        : undefined;
      assert(separator > 0 && op);
      const nested = joined && key.startsWith("active_resume.");
      const column = identifier(
        nested ? key.slice("active_resume.".length) : key,
      );
      return `${nested ? "r" : "t"}.${column} ${op} ${localSqlLiteral(filter.slice(separator + 1))}`;
    });
  const order = params
    .get("order")
    ?.split(",")
    .map((item) => {
      const parts = item.split(".");
      assert(parts.length === 2 && ["asc", "desc"].includes(parts[1]));
      return `t.${identifier(parts[0])} ${parts[1]}`;
    });
  const limit = params.get("limit") ?? "200";
  const offset = params.get("offset") ?? "0";
  assert.match(limit, /^\d{1,3}$/u);
  assert.match(offset, /^\d{1,3}$/u);
  return JSON.parse(
    sql(`
    select coalesce(json_agg(result.*), '[]'::json) from (
      select ${fields} from ${source}
      ${filters.length ? "where " + filters.join(" and ") : ""}
      ${order ? "order by " + order.join(", ") : ""}
      limit ${limit} offset ${offset}
    ) result;
  `),
  ) as unknown[];
}

export function localBrowserAccount(ownerId: string, testEmail: string) {
  const testPassword = randomUUID();
  const testToken = randomUUID();
  const testUser = {
    id: ownerId,
    email: testEmail,
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  };
  return {
    email: testEmail,
    password: testPassword,
    async reply(request: Request, url: URL) {
      if (
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password" &&
        request.method === "POST"
      ) {
        const credentials = (await request.json()) as Record<string, unknown>;
        assert.equal(credentials.email, testEmail);
        assert.equal(credentials.password, testPassword);
        return Response.json({
          user: testUser,
          access_token: testToken,
          refresh_token: randomUUID(),
          expires_in: 900,
          token_type: "bearer",
        });
      }
      if (url.pathname === "/auth/v1/user" && request.method === "GET") {
        assert.equal(
          request.headers.get("Authorization"),
          `Bearer ${testToken}`,
        );
        return Response.json(testUser);
      }
    },
  };
}

type LocalTransport = {
  origin: string;
  sql: ReturnType<typeof connectLocalPostgres>;
  tables: ReadonlySet<string>;
  rpcs: ReadonlySet<string>;
  account?: ReturnType<typeof localBrowserAccount>;
  storage?: (request: Request, url: URL) => Response | undefined;
};

export function localSupabaseFetch({
  origin,
  sql,
  tables,
  rpcs,
  account,
  storage,
}: LocalTransport): typeof fetch {
  assert.match(origin, /^https:\/\/local-(?:cv04|a10|a13|build)\.invalid$/u);
  assert.equal(process.env.SUPABASE_URL, origin);
  const buildFixture = origin === "https://local-build.invalid";
  assert.equal(process.env.AI_ENABLED, buildFixture ? "true" : "false");
  if (buildFixture)
    assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, origin);
    const fixtureResponse =
      (await account?.reply(request, url)) ?? storage?.(request, url);
    if (fixtureResponse) return fixtureResponse;
    const [, api, apiVersion, resource, fn] = url.pathname.split("/");
    assert(api === "rest" && apiVersion === "v1");
    if (resource === "rpc" && request.method === "POST") {
      assert(rpcs.has(fn));
      const args = Object.entries(
        (await request.json()) as Record<string, unknown>,
      ).map(
        ([key, value]) => `${identifier(key)} => ${localSqlArgument(value)}`,
      );
      return Response.json(
        JSON.parse(sql(`select to_json(public.${fn}(${args.join(",")}));`)),
      );
    }
    assert(!fn && request.method === "GET" && tables.has(resource));
    return Response.json(tableRead(sql, resource, url.searchParams));
  };
}
