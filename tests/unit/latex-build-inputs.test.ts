import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {
  BUILD_BUDGET,
  parseBuildArguments,
  verifyExpatContext,
  freezeBuildInputs,
  buildArguments,
  redactBuildLog,
  validateCancellationProof,
  runOwnedBuild,
  runVerifiedBuild,
  armOwnedDeadline,
  assertExecutingCheckout,
  createOwnedGroupGuard,
  buildClientEnvironment,
  readLatexBuildRef,
  latexBuildHistoryArgs,
  latexBuildHistoryStatus,
  admitDocker,
} from "../../scripts/build-latex-verified";
import type { BuildPorts } from "../../scripts/build-latex-verified";
import { latexSourceHashes } from "../../scripts/latex-test-fixtures";
const helper = fileURLToPath(
  new URL("../../scripts/latex-runtime/prefetch-inputs.py", import.meta.url),
);
function python(body: string, timeout = 5000) {
  const loader = `import importlib.util,sys,json,pathlib,tempfile,hashlib,io,os\nspec=importlib.util.spec_from_file_location('latex_prefetch',sys.argv[1]); m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)\n`;
  return execFileSync("python3", ["-I", "-B", "-c", loader + body, helper], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    timeout,
    maxBuffer: 32768,
  });
}
describe("pinned public compiler input staging, no real network", () => {
  it("loads only the exact existing upstream pin without changing it", () => {
    expect(
      JSON.parse(
        python(
          "a=m.load_asset(); print(json.dumps({'name':a.name,'size':a.size,'sha256':a.sha256}))",
        ),
      ),
    ).toEqual({
      name: "expat-2.10.0.tar.xz",
      size: 543404,
      sha256:
        "c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f",
    });
  });
  it("rejects a changed pin manifest before any fetch", () => {
    expect(
      python(
        `p=json.loads((pathlib.Path(sys.argv[1]).parent/'native-expat/pins.json').read_text()); next(x for x in p['inputs'] if x['name']==m.EXPECTED_NAME)['sha256']='0'*64\ntry: m.asset_from_pins(p)\nexcept m.AssetError as e: print(e.code)\n`,
      ),
    ).toBe("pin_mismatch\n");
  });
  it("defaults to offline cache verification and performs no implicit download", () => {
    expect(
      python(
        `with tempfile.TemporaryDirectory() as d:\n try: m.stage_asset(m.load_asset(),pathlib.Path(d))\n except m.AssetError as e: print(e.code)\n assert not list(pathlib.Path(d).iterdir())\n`,
      ),
    ).toBe("cache_missing\n");
  });
  it.each([
    "https://other.example.test/PRIVATE_UNIT_CANARY",
    "http://github.com/libexpat/libexpat",
    "https://github.com:8443/libexpat/libexpat",
    "https://unit@github.com/libexpat/libexpat",
    "https://release-assets.githubusercontent.com/other-project/file",
  ])("rejects unapproved transfer destinations: %s", (url) => {
    expect(
      python(
        `try: m.validate_url(${JSON.stringify(url)},initial=False)\nexcept m.AssetError as e: print(e.code)\n`,
      ),
    ).toBe("url_not_allowed\n");
  });
  it("accepts only the canonical upstream or its HTTPS repository release-asset redirect", () => {
    expect(
      python(
        `m.validate_url(m.EXPECTED_URL,initial=True);m.validate_url('https://release-assets.githubusercontent.com/github-production-release-asset/80314213/neutral?sig=unit-only',initial=False);print('ok')`,
      ),
    ).toBe("ok\n");
  });
  const fake = `a=m.Asset(m.EXPECTED_NAME,m.EXPECTED_URL,3,hashlib.sha256(b'abc').hexdigest())\nclass Response(io.BytesIO):\n headers={}\n def geturl(self):return m.EXPECTED_URL\nclass Opener:\n def __init__(self,payload):self.payload=payload;self.calls=0\n def open(self,request,timeout):\n  self.calls+=1;assert request.get_header('Authorization') is None and request.get_header('Cookie') is None;return Response(self.payload)\n`;
  it("atomically publishes a read-only hash-bound asset and reuses verified cache without network", () => {
    const output = JSON.parse(
      python(
        fake +
          `with tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d);o=Opener(b'abc');r=m.stage_asset(a,p,fetch=True,opener=o); assert o.calls==1;target=p/a.sha256/a.name;assert target.read_bytes()==b'abc' and target.stat().st_mode&0o222==0\n again=m.stage_asset(a,p,fetch=True,opener=Opener(b'forbidden'));assert again['source']=='cache'; print(json.dumps({'status':r['status'],'source':r['source'],'bytes':r['bytes'],'partialFiles':len(list(p.rglob('.partial-*')))}))\n`,
      ),
    );
    expect(output).toEqual({
      status: "verified",
      source: "download",
      bytes: 3,
      partialFiles: 0,
    });
  });
  it.each([
    { bytes: "abcdef", code: "size_mismatch" },
    { bytes: "abd", code: "hash_mismatch" },
  ])(
    "rejects bad transfer bytes without publishing or leaving partial files: $code",
    ({ bytes, code }) => {
      expect(
        python(
          fake +
            `with tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d)\n try:m.stage_asset(a,p,fetch=True,opener=Opener(${JSON.stringify(bytes)}.encode()))\n except m.AssetError as e:print(e.code)\n assert not (p/a.sha256/a.name).exists() and not list(p.rglob('.partial-*'))\n`,
        ),
      ).toBe(code + "\n");
    },
  );
  it("can stage into an existing empty owned content-addressed directory on explicit fetch", () => {
    expect(
      python(
        fake +
          `with tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d);(p/a.sha256).mkdir();o=Opener(b'abc');r=m.stage_asset(a,p,fetch=True,opener=o);assert o.calls==1;print(r['status'])\n`,
      ),
    ).toBe("verified\n");
  });
  it("does not overwrite a tampered existing cache or turn verification failure into a fetch", () => {
    expect(
      python(
        fake +
          `with tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d);q=p/a.sha256;q.mkdir();f=q/a.name;f.write_bytes(b'abd');f.chmod(0o444);o=Opener(b'abc')\n try:m.stage_asset(a,p,fetch=True,opener=o)\n except m.AssetError as e:print(e.code)\n assert f.read_bytes()==b'abd' and o.calls==0\n`,
      ),
    ).toBe("hash_mismatch\n");
  });
  it("refuses symlink cache inputs", () => {
    expect(
      python(
        fake +
          `with tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d);q=p/a.sha256;q.mkdir();outside=p/'outside';outside.write_bytes(b'abc');(q/a.name).symlink_to(outside)\n try:m.stage_asset(a,p)\n except m.AssetError as e:print(e.code)\n`,
      ),
    ).toBe("cache_path_unsafe\n");
  });
  it("removes only its partial file on transport failure and keeps the error content-free", () => {
    expect(
      python(
        fake +
          `class Broken(Opener):\n def open(self,request,timeout):raise OSError('PRIVATE_UNIT_CANARY')\nwith tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d)\n try:m.stage_asset(a,p,fetch=True,opener=Broken(b''))\n except m.AssetError as e:print(e.code)\n assert not list(p.rglob('.partial-*'))\n`,
      ),
    ).toBe("transport_failed\n");
  });
  it("enforces an overall deadline independently of transfer progress", () => {
    expect(
      python(
        fake +
          `import time\nclass Slow(Response):\n def read(self,n=-1):time.sleep(0.2);return super().read(n)\nclass SlowOpener(Opener):\n def open(self,request,timeout):return Slow(self.payload)\nwith tempfile.TemporaryDirectory() as d:\n p=pathlib.Path(d)\n try:m.stage_asset(a,p,fetch=True,opener=SlowOpener(b'abc'),deadline_seconds=0.01)\n except m.AssetError as e:print(e.code)\n assert not list(p.rglob('.partial-*'))\n`,
      ),
    ).toBe("deadline_exceeded\n");
  });
  it("labels a transfer attempt as a chain rather than one HTTP exchange", () => {
    expect(
      python(
        fake +
          `with tempfile.TemporaryDirectory() as d:\n r=m.stage_asset(a,pathlib.Path(d),fetch=True,opener=Opener(b'abc'));print(r['networkAttemptsUnit'])\n`,
      ),
    ).toBe("transport_chain\n");
  });
  it("CLI defaults offline and emits only metadata codes for a missing cache", () => {
    const result = spawnSync(
      "python3",
      ["-I", "-B", helper, "--cache-dir", "/not-found-PRIVATE_UNIT_CANARY"],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        timeout: 5000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("PRIVATE_UNIT_CANARY");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      code: "cache_path_unsafe",
      networkAttempts: 0,
      networkAttemptsUnit: "transport_chain",
    });
  });
});

describe("offline cache verification remains bounded for special files", () => {
  it("rejects a FIFO before open, with a bounded child and exact temporary cleanup", () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "resumide-fifo-unit-")),
    );
    try {
      expect(
        python(
          `p=pathlib.Path(${JSON.stringify(root)});a=m.Asset(m.EXPECTED_NAME,m.EXPECTED_URL,3,hashlib.sha256(b'abc').hexdigest());q=p/a.sha256;q.mkdir();os.mkfifo(q/a.name,0o444)
calls=[]
def forbidden(*args,**kwargs):calls.append(True);raise AssertionError('FIFO must fail before open')
os.open=forbidden
try:m.stage_asset(a,p)
except m.AssetError as e:print(e.code,bool(calls))
`,
          750,
        ),
      ).toBe("cache_path_unsafe False\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("refuses a regular-file to FIFO race without waiting for a writer", () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "resumide-fifo-race-")),
    );
    try {
      expect(
        python(
          `p=pathlib.Path(${JSON.stringify(root)});a=m.Asset(m.EXPECTED_NAME,m.EXPECTED_URL,3,hashlib.sha256(b'abc').hexdigest());q=p/a.sha256;q.mkdir();target=q/a.name;target.write_bytes(b'abc');target.chmod(0o444)
original=os.open
def raced(path,flags,*args,**kwargs):
 target.unlink();os.mkfifo(target,0o444);return original(path,flags,*args,**kwargs)
os.open=raced
try:m.stage_asset(a,p)
except m.AssetError as e:print(e.code)
`,
          750,
        ),
      ).toBe("cache_path_unsafe\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("applies the configured whole-operation deadline to offline verification too", () => {
    expect(
      python(
        `import time
a=m.Asset(m.EXPECTED_NAME,m.EXPECTED_URL,3,hashlib.sha256(b'abc').hexdigest())
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d);q=p/a.sha256;q.mkdir();target=q/a.name;target.write_bytes(b'abc');target.chmod(0o444)
 def slow(path,asset):time.sleep(0.2)
 m._verify=slow
 try:m.stage_asset(a,p,deadline_seconds=0.01)
 except m.AssetError as e:print(e.code,e.attempts)
`,
        750,
      ),
    ).toBe("deadline_exceeded 0\n");
  });
});

const tinyAsset = {
  name: "expat-2.10.0.tar.xz",
  size: 3,
  sha256: createHash("sha256").update("abc").digest("hex"),
};
async function temporary(body: (root: string) => Promise<void>) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "resumide-build-unit-")),
  );
  try {
    await body(root);
  } finally {
    async function unlock(directory: string) {
      await chmod(directory, 0o700);
      for (const item of await readdir(directory, { withFileTypes: true }))
        if (item.isDirectory() && !item.isSymbolicLink())
          await unlock(join(directory, item.name));
    }
    await unlock(root);
    await rm(root, { recursive: true, force: true });
  }
}
async function assetDirectory(root: string) {
  const directory = join(root, "asset");
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, tinyAsset.name), "abc", { mode: 0o444 });
  return directory;
}
const observedDocker = {
  endpoint: "unix:///owned/docker.sock",
  daemonId: "00000000-0000-4000-8000-000000000001",
  socketIdentity: "5:120",
  clientVersion: "29.9.2",
  serverVersion: "29.9.2",
  buildxVersion: "v0.38.1",
  buildxBinarySha256: "a".repeat(64),
  buildkitVersion: "v0.34.0",
  architecture: "aarch64",
  osType: "linux",
  cpus: 8,
  memoryBytes: 8 * 1024 ** 3,
  builder: "default",
  node: "default",
};
const boundRef = "default/default/abcdefghijklmnopqrstuvwxyz";
const proof = {
  schemaVersion: "latex-build-cancellation/v1",
  docker: observedDocker,
  ref: boundRef,
  status: "canceled",
  completedAt: "2026-11-09T12:00:00.000Z",
  clientGroupExited: true,
  ownedRefBound: true,
};

describe("verified compiler build wrapper, no actual Docker operation", () => {
  it("searches stable LaTeX and generic input trees without selecting development classes", async () => {
    const config = await readFile(
      new URL("../../scripts/latex-runtime/texmf.cnf", import.meta.url),
      "utf8",
    );
    expect(config.match(/^TEXINPUTS\s*=\s*(.+)$/m)?.[1]?.split(":")).toEqual([
      ".",
      "$TEXMFDIST/tex/latex//",
      "$TEXMFDIST/tex/generic//",
    ]);
  });
  it("fetches each pinned source index from the dated Debian snapshot", async () => {
    const recipe = await readFile(
      new URL("../../scripts/latex-runtime/Dockerfile", import.meta.url),
      "utf8",
    );
    const additions = recipe
      .split("\n")
      .filter((line) => /^ADD .* \/inputs\/[^/]+-Sources\.xz$/.test(line))
      .map((line) => line.split(" ").slice(-2));
    const snapshot = "https://snapshot.debian.org/archive";
    expect(additions).toEqual([
      [
        `${snapshot}/debian/20261106T000000Z/dists/trixie/main/source/Sources.xz`,
        "/inputs/trixie-main-Sources.xz",
      ],
      [
        `${snapshot}/debian-security/20261106T000000Z/dists/trixie-security/main/source/Sources.xz`,
        "/inputs/trixie-security-Sources.xz",
      ],
      [
        `${snapshot}/debian/20261106T000000Z/dists/sid/main/source/Sources.xz`,
        "/inputs/sid-Sources.xz",
      ],
      [
        `${snapshot}/debian-security/20261106T000000Z/dists/trixie-security/main/source/Sources.xz`,
        "/inputs/trixie-security-Sources.xz",
      ],
    ]);
  });
  it("limits the Debian runtime security update to pinned local artifacts", async () => {
    const recipe = await readFile(
      new URL("../../scripts/latex-runtime/Dockerfile", import.meta.url),
      "utf8",
    );
    const [, stage] = recipe.split("FROM scratch AS stock-runtime-security\n");
    const additions = stage
      ?.split("\nFROM ", 1)[0]
      ?.matchAll(
        /^ADD --chmod=0444 --checksum=sha256:[a-f0-9]{64} https:\/\/deb\.debian\.org\/\S+_arm64\.deb \/([\w-]+)\.deb$/gm,
      );
    expect(Array.from(additions ?? [], ([, name]) => name)).toEqual([
      "libc-bin",
      "libc6",
      "libgpgme11t64",
      "libgpgmepp6t64",
      "libnghttp2-14",
      "zlib1g",
    ]);
    const overlay = recipe.indexOf(
      "RUN --network=none --mount=type=bind,from=stock-runtime-security,source=/,target=/build-input/stock-security,readonly",
    );
    expect(overlay).toBeGreaterThan(
      recipe.indexOf(
        "python3 -I -B /build-input/freetype-recipe/install-runtime.py",
      ),
    );
    expect(overlay).toBeLessThan(
      recipe.indexOf("python3 /opt/latex/build-closure.py"),
    );
  });
  it.each(
    [
      ["--execute"],
      ["--tag", "arbitrary:latest"],
      ["--workspace", "x", "--workspace", "y"],
      ["--fetch"],
      ["--execute", "--packet", "x", "--approved", "a".repeat(64)],
    ].map((args) => ({ args })),
  )(
    "refuses unsupported or incomplete arguments without echoing input: $args",
    ({ args }) => {
      expect(() => parseBuildArguments(args)).toThrow("invalid_arguments");
    },
  );
  it("defaults to preparing a review packet rather than starting a build", () => {
    expect(
      parseBuildArguments([
        "--workspace",
        "/unit/source",
        "--asset-dir",
        "/unit/asset",
        "--output-dir",
        "/unit/out",
      ]),
    ).toEqual({
      mode: "prepare",
      workspace: "/unit/source",
      assetDirectory: "/unit/asset",
      outputDirectory: "/unit/out",
    });
  });
  it("binds the proposed wall/log/disk bounds without caller overrides", () => {
    expect(BUILD_BUDGET).toMatchObject({
      wallMs: 2_400_000,
      logBytes: 32 * 1024 ** 2,
      initialFreeBytes: 12 * 1024 ** 3,
      abortFreeBytes: 8 * 1024 ** 3,
    });
  });
  it("verifies an exact sole read-only public artifact without fetching", async () => {
    await temporary(async (root) => {
      const directory = await assetDirectory(root);
      expect(await verifyExpatContext(directory, tinyAsset)).toEqual(tinyAsset);
      expect(await readdir(directory)).toEqual([tinyAsset.name]);
    });
  });
  it.each(["extra", "writable", "tampered", "symlink"])(
    "rejects unsafe named context: %s",
    async (kind) => {
      await temporary(async (root) => {
        const directory = await assetDirectory(root),
          artifact = join(directory, tinyAsset.name);
        if (kind === "extra")
          await writeFile(join(directory, "private-canary"), "neutral");
        if (kind === "writable") await chmod(artifact, 0o644);
        if (kind === "tampered") {
          await chmod(artifact, 0o644);
          await writeFile(artifact, "abd");
          await chmod(artifact, 0o444);
        }
        if (kind === "symlink") {
          await rm(artifact);
          await writeFile(join(root, "outside"), "abc");
          await symlink(join(root, "outside"), artifact);
        }
        await expect(verifyExpatContext(directory, tinyAsset)).rejects.toThrow(
          "asset_context_unsafe",
        );
      });
    },
  );
  it("freezes only bound compiler sources and a separate public context outside the repository", async () => {
    await temporary(async (root) => {
      const workspace = join(root, "source"),
        out = join(root, "out"),
        relative = "scripts/latex-runtime/Dockerfile";
      await mkdir(join(workspace, "scripts/latex-runtime"), {
        recursive: true,
      });
      await mkdir(out, { mode: 0o700 });
      await writeFile(join(workspace, relative), "FROM scratch\n");
      await writeFile(join(workspace, ".env"), "PRIVATE_UNIT_CANARY");
      const hashes = {
        [relative]: createHash("sha256").update("FROM scratch\n").digest("hex"),
      };
      const frozen = await freezeBuildInputs(
        {
          workspace,
          outputDirectory: out,
          assetDirectory: await assetDirectory(root),
          sourceHashes: hashes,
        },
        tinyAsset,
      );
      expect(
        await readFile(join(frozen.contextDirectory, "Dockerfile"), "utf8"),
      ).toBe("FROM scratch\n");
      expect(await readdir(frozen.contextDirectory)).toEqual(["Dockerfile"]);
      expect(
        await readFile(join(frozen.assetDirectory, tinyAsset.name), "utf8"),
      ).toBe("abc");
      await writeFile(join(workspace, relative), "changed");
      expect(
        await readFile(join(frozen.contextDirectory, "Dockerfile"), "utf8"),
      ).toBe("FROM scratch\n");
    });
  });
  it("refuses source traversal before copying any candidate input", async () => {
    await temporary(async (root) => {
      const out = join(root, "out");
      await mkdir(out, { mode: 0o700 });
      await expect(
        freezeBuildInputs(
          {
            workspace: root,
            outputDirectory: out,
            assetDirectory: await assetDirectory(root),
            sourceHashes: { "../outside": "0".repeat(64) },
          },
          tinyAsset,
        ),
      ).rejects.toThrow("source_unsafe");
      expect(await readdir(out)).toEqual([]);
    });
  });
  it("admits only a local Unix Linux arm64 daemon and bounded metadata", () => {
    expect(admitDocker(observedDocker)).toEqual(observedDocker);
    for (const bad of [
      { endpoint: "tcp://remote:2375" },
      { daemonId: "" },
      { socketIdentity: "unbound" },
      { osType: "windows" },
      { architecture: "x86_64" },
      { cpus: 0 },
      { memoryBytes: NaN },
    ])
      expect(() => admitDocker({ ...observedDocker, ...bad })).toThrow(
        "docker_not_admitted",
      );
  });
  it("has fixed local build arguments without push, pull, secrets, privileged entitlement or remote context", () => {
    const args = buildArguments("/unit/out", observedDocker.endpoint);
    expect(args).toContain("verified-expat=/unit/out/verified-expat");
    expect(args).toContain("linux/arm64");
    expect(args[args.indexOf("--tag") + 1]).toMatch(
      /^resumide-latex:local-[a-f0-9]{24}$/,
    );
    expect(args.at(-1)).toBe("/unit/out/context");
    expect(args).not.toEqual(
      expect.arrayContaining([
        "--push",
        "--pull",
        "--secret",
        "--ssh",
        "--allow",
        "--network",
        "--build-arg",
      ]),
    );
  });
  it("separates output tags for independent reviewed build directories", () => {
    function tag(output: string) {
      const args = buildArguments(output, observedDocker.endpoint);
      return args[args.indexOf("--tag") + 1];
    }
    expect(tag("/unit/first")).toBe(tag("/unit/first"));
    expect(tag("/unit/second")).not.toBe(tag("/unit/first"));
  });
  it("requires recent terminal exact-owned cancellation proof for this observed toolchain", () => {
    expect(() =>
      validateCancellationProof(
        proof,
        observedDocker,
        Date.parse("2026-11-09T12:01:00Z"),
      ),
    ).not.toThrow();
    for (const bad of [
      { status: "running" },
      { clientGroupExited: false },
      { ownedRefBound: false },
      { ref: "^0" },
      { docker: { ...observedDocker, buildxVersion: "other" } },
      { docker: { ...observedDocker, socketIdentity: "5:121" } },
      {
        docker: {
          ...observedDocker,
          daemonId: "00000000-0000-4000-8000-000000000002",
        },
      },
      { completedAt: "2026-11-01T12:00:00Z" },
    ])
      expect(() =>
        validateCancellationProof(
          { ...proof, ...bad },
          observedDocker,
          Date.parse("2026-11-09T12:01:00Z"),
        ),
      ).toThrow("cancellation_unproven");
  });
  it("removes URL query/fragment and control characters from retained public build logs", () => {
    const log = redactBuildLog(
      "fetch https://release-assets.githubusercontent.com/path?SIGNED_CANARY=1#secret \u001b[31mfailed\u0000",
    );
    expect(log).toContain("https://release-assets.githubusercontent.com/path");
    expect(log).not.toMatch(/SIGNED_CANARY|secret/);
    expect(log).not.toContain(String.fromCharCode(27));
    expect(log).not.toContain(String.fromCharCode(0));
  });
});

function simulatedBuild(
  options: {
    outcome?: string;
    failAfter?: string;
    unknownRef?: boolean;
    initialFree?: number;
    killedGroup?: boolean;
  } = {},
) {
  let now = 0,
    exited = false,
    signalCount = 0;
  const signals: string[] = [],
    logs: string[] = [];
  const ports: BuildPorts = {
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
    freeBytes: async () => {
      if (options.failAfter === "monitor" && now > 0)
        throw Error("PRIVATE_UNIT_CANARY");
      return options.failAfter === "disk" && now > 0
        ? 7 * 1024 ** 3
        : (options.initialFree ?? 20 * 1024 ** 3);
    },
    checkIntegrity: async () => {
      if (options.failAfter === "source" && now > 0)
        throw Error("PRIVATE_UNIT_CANARY");
    },
    ownedRef: async () => (options.unknownRef ? undefined : boundRef),
    historyStatus: async () => options.outcome ?? "canceled",
    appendLog: (text) => {
      logs.push(text);
    },
    spawn: (onData) => {
      if (options.failAfter === "log")
        onData(Buffer.alloc(BUILD_BUDGET.logBytes + 1, "x"));
      if (options.failAfter === "longlog") {
        onData(Buffer.from("https://example.test/asset?" + "x".repeat(70000)));
        onData(Buffer.from("SIGNED_CANARY=2\n"));
      }
      return {
        signal: (signal) => {
          signals.push(signal);
          signalCount++;
          if (options.killedGroup !== false) exited = true;
        },
        result: () => (exited ? { code: null, groupExited: true } : undefined),
      };
    },
    canceled: () => options.failAfter === "cancel" && now > 0,
  };
  return { ports, signals, logs, getSignalCount: () => signalCount };
}

describe("bounded owned build lifecycle with injected process/history ports", () => {
  it("refuses inadequate initial disk before spawning an owned client", async () => {
    const test = simulatedBuild({ initialFree: 11 * 1024 ** 3 });
    const receipt = await runOwnedBuild(test.ports);
    expect(receipt).toMatchObject({
      status: "not_started",
      reason: "disk_preflight",
      clientStarted: false,
    });
    expect(test.signals).toEqual([]);
  });
  it.each(["disk", "source", "log", "cancel", "deadline"])(
    "stops only its client group for %s and requires a terminal owned daemon ref",
    async (failAfter) => {
      const test = simulatedBuild({ failAfter });
      const receipt = await runOwnedBuild(test.ports);
      expect(receipt).toMatchObject({
        status: "aborted",
        daemonOutcome: "canceled",
        clientGroupExited: true,
      });
      expect(receipt.reason).toBe(
        {
          disk: "disk_floor",
          source: "source_drift",
          log: "log_cap",
          cancel: "canceled",
          deadline: "deadline",
        }[failAfter],
      );
      expect(test.signals[0]).toBe("SIGINT");
      expect(test.logs.join("").length).toBeLessThanOrEqual(
        BUILD_BUDGET.logBytes,
      );
    },
  );
  it.each([{ outcome: "running" }, { unknownRef: true }])(
    "does not equate exited client with daemon cancellation: %j",
    async (options) => {
      const test = simulatedBuild({ ...options, failAfter: "cancel" });
      const receipt = await runOwnedBuild(test.ports);
      expect(receipt).toMatchObject({
        status: "daemon_outcome_unknown",
        clientGroupExited: true,
      });
    },
  );
  it("escalates signals only on the owned group and preserves unknown process outcome", async () => {
    const test = simulatedBuild({ failAfter: "cancel", killedGroup: false });
    expect(await runOwnedBuild(test.ports)).toMatchObject({
      status: "daemon_outcome_unknown",
      clientGroupExited: false,
    });
    expect(test.signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);
  });
});

describe("build monitor failure and log boundary regressions", () => {
  it("cancels the exact owned client when disk observation itself fails", async () => {
    const test = simulatedBuild({ failAfter: "monitor" });
    expect(await runOwnedBuild(test.ports)).toMatchObject({
      status: "aborted",
      reason: "resource_monitor_failed",
      daemonOutcome: "canceled",
    });
    expect(test.signals[0]).toBe("SIGINT");
  });
  it("discards an entire overlong log line rather than exposing a split signed query tail", async () => {
    const test = simulatedBuild({ failAfter: "longlog" });
    await runOwnedBuild(test.ports);
    expect(test.logs.join("")).not.toContain("SIGNED_CANARY");
  });
});

describe("wrapper source binding and public CLI boundary", () => {
  it("binds the wrapper, source-binding helper and ignore policy to an explicit checkout root", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const hashes = await latexSourceHashes(root);
    for (const name of [
      "scripts/build-latex-verified.ts",
      "scripts/latex-test-fixtures.ts",
      "scripts/latex-runtime/.dockerignore",
    ])
      expect(hashes[name]).toBe(
        createHash("sha256")
          .update(await readFile(join(root, name)))
          .digest("hex"),
      );
    await temporary(async (elsewhere) => {
      await expect(latexSourceHashes(elsewhere)).rejects.toThrow();
    });
  });
  it.each([
    "node_modules/vite-node/vite-node.mjs",
    "node_modules/.bin/vite-node",
  ])(
    "CLI entry %s rejects unsupported arguments without reading app configuration or printing input",
    (entry) => {
      const root = fileURLToPath(new URL("../../", import.meta.url));
      const result = spawnSync(
        process.execPath,
        [
          join(root, entry),
          "--config",
          join(root, "vitest.config.ts"),
          join(root, "scripts/build-latex-verified.ts"),
          "--cli",
          "--PRIVATE_UNIT_CANARY",
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 5000,
          env: {
            PATH: process.env.PATH,
            RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
            OPENAI_API_KEY: "PRIVATE_UNIT_CANARY",
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("PRIVATE_UNIT_CANARY");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "failed",
        code: "invalid_arguments",
        runtimeAccepted: false,
      });
    },
  );
});

describe("final wrapper admission and completed-client distinctions", () => {
  it("rejects an unreviewed packet before observing Docker or starting a client", async () => {
    await temporary(async (root) => {
      const packet = join(root, "review-packet.json");
      await writeFile(
        packet,
        JSON.stringify({
          schemaVersion: "latex-build-review/v1",
          fingerprint: "0".repeat(64),
          binding: {},
        }),
        { mode: 0o444 },
      );
      await expect(
        runVerifiedBuild([
          "--execute",
          "--packet",
          packet,
          "--approved",
          "1".repeat(64),
          "--cancellation-receipt",
          join(root, "absent"),
        ]),
      ).rejects.toThrow("admission_mismatch");
    });
  });
  it("requires terminal completed daemon history for a zero-exit candidate result", async () => {
    const test = simulatedBuild({ outcome: "completed" });
    test.ports.spawn = () => ({
      signal: () => {
        throw Error("completed group must not be signaled");
      },
      result: () => ({ code: 0, groupExited: true }),
    });
    expect(await runOwnedBuild(test.ports)).toMatchObject({
      status: "candidate_built",
      exitCode: 0,
      daemonOutcome: "completed",
      clientGroupExited: true,
    });
  });
  it("preserves an unknown daemon outcome even after a successful client exits", async () => {
    const test = simulatedBuild({ outcome: "running" });
    test.ports.spawn = () => ({
      signal: () => {
        throw Error("exited group must not be signaled");
      },
      result: () => ({ code: 0, groupExited: true }),
    });
    expect(await runOwnedBuild(test.ports)).toMatchObject({
      status: "daemon_outcome_unknown",
      exitCode: 0,
      clientGroupExited: true,
    });
  });
});

describe("independent owned-client deadline", () => {
  it("signals even while an asynchronous monitor is stalled, then stops after group exit", async () => {
    vi.useFakeTimers();
    try {
      const signals: string[] = [];
      let exited = false;
      const disarm = armOwnedDeadline(
        (signal) => signals.push(signal),
        () => exited,
      );
      await vi.advanceTimersByTimeAsync(
        BUILD_BUDGET.wallMs - BUILD_BUDGET.cleanupReserveMs,
      );
      expect(signals).toEqual(["SIGINT"]);
      await vi.advanceTimersByTimeAsync(BUILD_BUDGET.signalGraceMs);
      expect(signals).toEqual(["SIGINT", "SIGTERM"]);
      exited = true;
      await vi.advanceTimersByTimeAsync(BUILD_BUDGET.signalGraceMs);
      expect(signals).toEqual(["SIGINT", "SIGTERM"]);
      disarm();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("executing checkout admission", () => {
  it("refuses a selected or approved checkout other than the executing wrapper checkout", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    await expect(assertExecutingCheckout(root)).resolves.toBeUndefined();
    await temporary(async (otherCheckout) => {
      await expect(assertExecutingCheckout(otherCheckout)).rejects.toThrow(
        "wrong_execution_checkout",
      );
    });
  });
});

describe("stalled monitor lifecycle", () => {
  it("returns an unknown-daemon receipt within the budget when a disk monitor never settles", async () => {
    vi.useFakeTimers();
    try {
      const test = simulatedBuild({ unknownRef: true });
      let observations = 0;
      test.ports.now = () => Date.now();
      test.ports.wait = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      test.ports.freeBytes = async () =>
        ++observations === 1
          ? 20 * 1024 ** 3
          : new Promise<number>(() => undefined);
      let receipt: Awaited<ReturnType<typeof runOwnedBuild>> | undefined;
      void runOwnedBuild(test.ports).then((value) => {
        receipt = value;
      });
      await vi.advanceTimersByTimeAsync(60000);
      expect(receipt).toMatchObject({
        status: "daemon_outcome_unknown",
        reason: "resource_monitor_failed",
        clientGroupExited: true,
      });
      expect(test.signals).toEqual(["SIGINT"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("other stalled owned-build observations", () => {
  it.each(["source", "reference", "history"])(
    "returns conservatively when %s observation never settles",
    async (kind) => {
      vi.useFakeTimers();
      try {
        const test = simulatedBuild();
        let sourceReads = 0;
        test.ports.now = () => Date.now();
        test.ports.wait = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        if (kind === "source")
          test.ports.checkIntegrity = async () => {
            if (++sourceReads > 1) await new Promise<void>(() => undefined);
          };
        if (kind === "reference")
          test.ports.ownedRef = () =>
            new Promise<string | undefined>(() => undefined);
        if (kind === "history") {
          test.ports.spawn = () => ({
            signal: () => {
              throw Error("exited group must not be signaled");
            },
            result: () => ({ code: 0, groupExited: true }),
          });
          test.ports.historyStatus = () =>
            new Promise<string | undefined>(() => undefined);
        }
        let receipt: Awaited<ReturnType<typeof runOwnedBuild>> | undefined;
        void runOwnedBuild(test.ports).then((value) => {
          receipt = value;
        });
        await vi.advanceTimersByTimeAsync(60000);
        expect(receipt).toBeDefined();
        if (kind === "source")
          expect(receipt).toMatchObject({
            status: "aborted",
            reason: "source_drift",
            clientGroupExited: true,
          });
        else
          expect(receipt).toMatchObject({
            status: "daemon_outcome_unknown",
            clientGroupExited: true,
          });
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe("owned client identity before group signaling", () => {
  it.each(["reused", "vanished", "uncaptured"])(
    "never signals an unrelated or unproven %s leader",
    (kind) => {
      let reads = 0;
      const delivered: string[] = [];
      const original = "12345 12345 Mon Nov 9 12:00:00 2026";
      const guard = createOwnedGroupGuard(12345, {
        identity: () =>
          ++reads === 1
            ? kind === "uncaptured"
              ? ""
              : original
            : kind === "reused"
              ? "12345 12345 Mon Nov 9 12:01:00 2026"
              : "",
        groupAlive: () => true,
        signalGroup: (_pid, signal) => delivered.push(signal),
      });
      guard.signal("SIGTERM");
      expect(delivered).toEqual([]);
      expect(guard.ownershipUnknown()).toBe(true);
      expect(guard.exited()).toBe(false);
    },
  );
  it("signals only an unchanged original leader and proves group absence separately", () => {
    let alive = true;
    const delivered: unknown[] = [];
    const guard = createOwnedGroupGuard(12345, {
      identity: () => "12345 12345 Mon Nov 9 12:00:00 2026",
      groupAlive: () => alive,
      signalGroup: (pid, signal) => delivered.push([pid, signal]),
    });
    guard.signal("SIGINT");
    expect(delivered).toEqual([[12345, "SIGINT"]]);
    expect(guard.exited()).toBe(false);
    alive = false;
    expect(guard.exited()).toBe(true);
    expect(guard.ownershipUnknown()).toBe(false);
  });
});

describe("private Docker environment without repurposing system variables", () => {
  it("preserves HOME and isolates config while excluding app secrets and inherited Docker settings", () => {
    const originalHome = process.env.HOME;
    vi.stubEnv("OPENAI_API_KEY", "PRIVATE_UNIT_CANARY");
    vi.stubEnv("DOCKER_CONFIG", "/inherited/config");
    vi.stubEnv("BUILDX_CONFIG", "/inherited/builder");
    try {
      const environment = buildClientEnvironment("/owned/output");
      expect(environment).toEqual({
        PATH: process.env.PATH,
        HOME: originalHome,
        DOCKER_CONFIG: "/owned/output/docker-config",
        BUILDX_CONFIG: "/owned/output/buildx",
        BUILDX_GIT_INFO: "false",
      });
      expect(JSON.stringify(environment)).not.toContain("PRIVATE_UNIT_CANARY");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("observed compiler build ref/history contract", () => {
  const qualified = "default/default/qx42uyaghp7g0tkt8dqqm0drp";
  it.each(["", "default"])(
    "binds the exact owned context with observed target %s",
    async (target) => {
      await temporary(async (root) => {
        const directory = join(root, "buildx/refs/default/default");
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, qualified.split("/").at(-1)!),
          JSON.stringify({
            Target: target,
            LocalPath: join(root, "context"),
            DockerfilePath: join(root, "context/Dockerfile"),
          }),
        );
        expect(await readLatexBuildRef(root)).toBe(qualified);
        await writeFile(
          join(directory, qualified.split("/").at(-1)!),
          JSON.stringify({
            Target: "unowned-stage",
            LocalPath: join(root, "context"),
            DockerfilePath: join(root, "context/Dockerfile"),
          }),
        );
        await expect(readLatexBuildRef(root)).rejects.toThrow(
          "build_reference_unbound",
        );
      });
    },
  );
  it("queries only the suffix exactID and validates returned ID/context/default Dockerfile", () => {
    const args = latexBuildHistoryArgs(
      "/owned/build",
      "unix:///owned/docker.sock",
      qualified,
    );
    expect(args.slice(-3)).toEqual([
      "--format",
      "json",
      "qx42uyaghp7g0tkt8dqqm0drp",
    ]);
    expect(args).toContain("--builder");
    expect(args).not.toContain(qualified);
    const observed = {
      Ref: "qx42uyaghp7g0tkt8dqqm0drp",
      Context: "/owned/build/context",
      Dockerfile: "Dockerfile",
      Status: "failed",
      CompletedAt: "2026-11-09T17:08:45.567909177+05:30",
    };
    expect(
      latexBuildHistoryStatus(observed, qualified, "/owned/build/context"),
    ).toBe("failed");
    for (const bad of [
      { ...observed, Ref: qualified },
      { ...observed, Ref: "other" },
      { ...observed, Context: "/unowned" },
      { ...observed, Dockerfile: "unowned.tex" },
    ])
      expect(() =>
        latexBuildHistoryStatus(bad, qualified, "/owned/build/context"),
      ).toThrow("build_reference_unbound");
    expect(() =>
      latexBuildHistoryArgs("/owned/build", "unix:///owned/docker.sock", "^0"),
    ).toThrow("build_reference_unbound");
  });
});
