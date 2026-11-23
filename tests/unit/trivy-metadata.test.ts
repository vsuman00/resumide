import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/prefetch-trivy-metadata.py");
// Offline unit bridge only. Actual fetch admission keeps its pinned macOS runtime.
function offlinePythonCommand(platform: string): string {
  if (platform === "darwin") return "/opt/homebrew/bin/python3.14";
  if (platform === "linux") return "python3";
  throw new Error("OFFLINE_PYTHON_PLATFORM_UNSUPPORTED");
}
const python = offlinePythonCommand(process.platform);
const harness = String.raw`
import importlib.util,json,os,sys,time,hashlib,stat,socket,http.client,ssl,io
from pathlib import Path
socket.socket=lambda *a,**k: (_ for _ in ()).throw(AssertionError("REAL_NETWORK_FORBIDDEN"))
spec=importlib.util.spec_from_file_location("metadata",sys.argv[1]); m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
case=sys.argv[2]; cache=Path(sys.argv[3])/"cache"
base={"mediaType":"application/vnd.dev.sigstore.bundle+json;version=0.3","messageSignature":{"messageDigest":{"algorithm":"SHA2_256","digest":"fake"},"signature":"fake"},"verificationMaterial":{"certificate":{"rawBytes":"fake"},"tlogEntries":[{}]}}
payload=json.dumps(base,separators=(",",":")).encode()
class Clock:
 def __init__(self):self.now=0
 def __call__(self):return self.now
clock=Clock()
class Response:
 def __init__(self,data=payload,status=200,headers=None,delay=0):self.data=data;self.status=status;self.headers=headers or [];self.delay=delay;self.closed=False
 def read(self,n):clock.now+=self.delay;part=self.data[:n];self.data=self.data[n:];return part
 def close(self):self.closed=True
class Transport:
 def __init__(self,responses):self.responses=list(responses);self.calls=[]
 def request(self,url,timeout):
  self.calls.append((url,timeout)); response=self.responses.pop(0)
  if isinstance(response,Exception):raise response
  if callable(response):return response()
  return response

def stage(t,data=payload,**kw):
 return m._fetch_and_stage(t,cache,hashlib.sha256(data).hexdigest(),_clock=clock,_watchdog=False,**kw)
if case.startswith("json:"):
 kind=case[5:]
 data={"invalid_utf8":b'\xff',"duplicate":b'{"x":1,"\\u0078":2}',"nan":b'{"x":NaN}',"infinity":b'{"x":Infinity}',"overflow":b'{"x":1e999}',"surrogate":b'{"x":"\\ud800"}',"trailing":b'{} {}',"depth":b'['*33+b'0'+b']'*33,"string":json.dumps({"x":"a"*16385}).encode(),"key":json.dumps({"x"*129:1}).encode(),"container":json.dumps(list(range(129))).encode(),"nodes":json.dumps([[0]*64]*64).encode(),"number":b'{"x":9007199254740992}',"good":b'{"x":"\\ud83d\\ude00","y":1.25}'}[kind]
 try:m._strict_json(data);out={"ok":True}
 except m.PrefetchError as e:out={"error":e.code}
elif case=="good":
 t=Transport([Response()]);r=stage(t);info=cache/"bundle.sigstore.json";receipt=cache/"receipt.json"
 assert info.read_bytes()==payload and stat.S_IMODE(info.stat().st_mode)==0o444 and info.stat().st_nlink==1
 assert stat.S_IMODE(receipt.stat().st_mode)==0o600 and receipt.stat().st_nlink==1
 assert sorted(p.name for p in cache.iterdir())==["bundle.sigstore.json","receipt.json"]
 assert r["trustState"]=="UNTRUSTED_FOR_EXECUTION" and r["signatureVerified"] is False
 assert r["metadata"]["contentKind"]=="messageSignature" and r["metadata"]["certificatePresent"] is True
 out={"status":r["status"],"calls":len(t.calls)}
elif case=="exact_cap":
 b=dict(base);b["padding"]=["x"*16000]*4
 data=json.dumps(b,separators=(",",":")).encode();b["padding"].append("x"*(65536-len(data)-3));data=json.dumps(b,separators=(",",":")).encode();assert len(data)==65536
 r=stage(Transport([Response(data)]),data);out={"status":r["status"],"bytes":r["bytes"]}
elif case in ("cap","declared_cap"):
 response=Response(b'x'*65537,headers=[("Content-Length","65537")] if case=="declared_cap" else [])
 t=Transport([response]);r=stage(t,b'x'*65537);assert not (cache/"bundle.sigstore.json").exists();out={"error":r["errorCode"],"calls":len(t.calls)}
elif case.startswith("redirect:"):
 kind=case[9:]; url={"host":"https://attacker.example/file?token=CANARY","http":"http://release-assets.githubusercontent.com/file","auth":"https://user:CANARY@release-assets.githubusercontent.com/file","port":"https://release-assets.githubusercontent.com:444/file","fragment":"https://release-assets.githubusercontent.com/file#CANARY","control":"https://release-assets.githubusercontent.com/file\nCANARY"}.get(kind,"https://release-assets.githubusercontent.com/file?token=CANARY")
 count=3 if kind=="good" else 4 if kind=="count" else 1
 t=Transport([Response(status=302,headers=[("Location",url)]) for _ in range(count)]+[Response()]);r=stage(t)
 assert "CANARY" not in json.dumps(r) and "CANARY" not in (cache/"receipt.json").read_text()
 out={"status":r["status"],"error":r.get("errorCode"),"calls":len(t.calls)}
elif case in ("timeout","deadline"):
 if case=="timeout":t=Transport([Response(delay=11)])
 else:
  def redirect():clock.now+=9;return Response(status=302,headers=[("Location","https://release-assets.githubusercontent.com/file")])
  t=Transport([redirect,redirect,redirect,Response(delay=4)])
 r=stage(t);out={"error":r["errorCode"]}
elif case=="retry":
 t=Transport([OSError("https://bad.example/CANARY"),Response()]);r=stage(t);assert "CANARY" not in json.dumps(r);out={"error":r["errorCode"],"calls":len(t.calls)}
elif case in ("wire_good","wire_header_limit","wire_invalid"):
 wire=b"HTTP/1.1 200 OK\r\nContent-Length: "+str(len(payload)).encode()+b"\r\n\r\n"+payload
 if case=="wire_header_limit":wire=b"HTTP/1.1 200 OK\r\nX-Large: "+b"a"*8192+b"\r\n\r\n"
 if case=="wire_invalid":wire=b"CANARY BAD STATUS\r\n\r\n"
 context=object();ssl.create_default_context=lambda:context
 class Sock:
  def makefile(self,*args,**kwargs):return io.BytesIO(wire)
 class Connection:
  def __init__(self,host,port,timeout,context):assert host=="github.com" and port==443 and timeout<=10;self.context=context
  def request(self,method,path,headers):
   assert method=="GET" and path.endswith(".sigstore.json") and headers["Accept-Encoding"]=="identity"
   assert not any(k.lower() in ("authorization","cookie","proxy-authorization") for k in headers)
  def getresponse(self):
   response=self.response_class(Sock(),method="GET");response.begin();return response
  def close(self):return None
 http.client.HTTPSConnection=Connection
 r=stage(m._Transport());assert "CANARY" not in json.dumps(r)
 out={"status":r["status"],"error":r.get("errorCode")}
elif case=="setup_deadline":
 original_record=m._Cache.record;first=[True]
 def slow_setup(self,value,nonblocking=False):
  if first[0]:clock.now+=31;first[0]=False
  return original_record(self,value,nonblocking)
 m._Cache.record=slow_setup;t=Transport([Response()]);r=stage(t)
 out={"error":r.get("errorCode"),"calls":len(t.calls),"exchanges":r["httpExchanges"]}
elif case=="receipt_atomic":
 original_write=m.os.write;writes=[0]
 def fail_first(fd,data):
  writes[0]+=1
  if writes[0]==1:raise OSError("CANARY")
  return original_write(fd,data)
 m.os.write=fail_first;t=Transport([Response()]);r=stage(t)
 assert "CANARY" not in json.dumps(r)
 out={"error":r["errorCode"],"receiptExists":(cache/"receipt.json").exists(),"calls":len(t.calls)}
elif case=="headers":
 results=[]
 for headers in [[("Content-Length","1"),("Content-Length","1")],[("Content-Encoding","gzip")],[("Transfer-Encoding","chunked"),("Content-Length","1")]]:
  try:m._headers(Response(headers=headers));results.append("accepted")
  except m.PrefetchError as e:results.append(e.code)
 out={"errors":results}
elif case=="pins":out={"url":m.URL,"hash":m.EXPECTED_SHA256,"cap":m.MAX_BYTES,"cache":str(m.CACHE)}
elif case=="parent_symlink":
 target=cache.parent/"target";target.mkdir();link=cache.parent/"sym";link.symlink_to(target,target_is_directory=True);cache=link/"cache"
 r=stage(Transport([Response()]));out={"error":r["errorCode"]}
elif case=="hash_first":
 t=Transport([Response(b'not JSON')]);r=stage(t);out={"error":r["errorCode"]}
elif case in ("cache_exists","cache_symlink","foreign_output","hardlinked_receipt"):
 if case=="cache_exists":cache.mkdir();(cache/"owner.txt").write_text("preserve")
 if case=="cache_symlink":
  target=cache.parent/"external";target.mkdir();cache.symlink_to(target,target_is_directory=True)
 def mutate():
  if case=="foreign_output":(cache/"bundle.sigstore.json").write_text("preserve")
  if case=="hardlinked_receipt":os.link(cache/"receipt.json",cache.parent/"receipt-copy")
  return Response()
 r=stage(Transport([mutate]));
 if case=="cache_exists":assert (cache/"owner.txt").read_text()=="preserve"
 if case=="foreign_output":assert (cache/"bundle.sigstore.json").read_text()=="preserve"
 out={"error":r["errorCode"]}
elif case in ("dsse_good","dsse_missing","digest_missing"):
 b=json.loads(payload)
 if case.startswith("dsse"):
  del b["messageSignature"];b["dsseEnvelope"]={"payload":"fake","payloadType":"application/test","signatures":[{"sig":"fake"}] if case=="dsse_good" else [{}]}
 else:del b["messageSignature"]["messageDigest"]["digest"]
 data=json.dumps(b,separators=(",",":")).encode();r=stage(Transport([Response(data)]),data)
 out={"status":r["status"],"error":r.get("errorCode"),"kind":r.get("metadata",{}).get("contentKind")}
elif case=="noexec":
 os.system=lambda *a: (_ for _ in ()).throw(AssertionError("NO_EXECUTION"))
 os.execv=os.system
 b=json.loads(payload);b["verificationMaterial"]["certificate"]["rawBytes"]="os.system('CANARY')";data=json.dumps(b,separators=(",",":")).encode()
 r=stage(Transport([Response(data)]),data);assert "CANARY" not in json.dumps(r);out={"status":r["status"],"trust":r["trustState"]}
elif case in ("watchdog_request","watchdog_read","watchdog_publication","watchdog_callback_error","watchdog_receipt","watchdog_setup"):
 if case=="watchdog_setup":
  original_init=m._Cache.__init__
  def blocked_init(self,path):time.sleep(3);original_init(self,path)
  m._Cache.__init__=blocked_init
 if case=="watchdog_callback_error":m._emit=lambda value: (_ for _ in ()).throw(OSError("CANARY"))
 if case=="watchdog_receipt":
  original_record=m._Cache.record
  def blocked_record(self,value,nonblocking=False):
   if not nonblocking and value["status"]=="METADATA_STAGED_UNTRUSTED":
    self.receipt_lock.acquire();time.sleep(3)
   return original_record(self,value,nonblocking)
  m._Cache.record=blocked_record
 def blocked():time.sleep(.3 if case=="watchdog_callback_error" else 3);return Response()
 class BlockingResponse(Response):
  def read(self,n):time.sleep(3);return b''
 if case=="watchdog_publication":
  original=m._Cache.publish
  def blocked_publish(self,data,digest):time.sleep(3);return original(self,data,digest)
  m._Cache.publish=blocked_publish
 t=Transport([blocked if case in ("watchdog_request","watchdog_callback_error") else BlockingResponse() if case=="watchdog_read" else Response()])
 m._fetch_and_stage(t,cache,hashlib.sha256(payload).hexdigest(),_total_limit=.15,_operation_limit=.08)
 raise AssertionError("WATCHDOG_DID_NOT_TERMINATE")
else:raise AssertionError("UNKNOWN_CASE")
print(json.dumps(out))
`;

function runCase(name: string) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "r18-offline-"));
  try {
    const result = spawnSync(
      python,
      ["-B", "-I", "-S", "-c", harness, script, name, directory],
      {
        encoding: "utf8",
        timeout: 3500,
        maxBuffer: 65536,
        env: {
          PATH: "/opt/homebrew/bin:/usr/bin:/bin",
          ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
        },
      },
    );
    const text = result.stdout.trim();
    return {
      status: result.status,
      error: result.error?.message,
      output: text ? JSON.parse(text) : null,
      receipt: (() => {
        try {
          return JSON.parse(
            readFileSync(join(directory, "cache/receipt.json"), "utf8"),
          );
        } catch {
          return null;
        }
      })(),
      stderr: result.stderr,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("offline bridge interpreter selection", () => {
  it.each([
    ["darwin", "/opt/homebrew/bin/python3.14"],
    ["linux", "python3"],
  ])(
    "uses the explicit %s test interpreter without dispatch",
    (platform, command) => {
      expect(offlinePythonCommand(platform)).toBe(command);
    },
  );

  it("rejects an unreviewed platform instead of falling back", () => {
    expect(() => offlinePythonCommand("win32")).toThrow(
      "OFFLINE_PYTHON_PLATFORM_UNSUPPORTED",
    );
  });
});

describe("fixed public Trivy metadata source (offline only)", () => {
  it.each([
    ["invalid_utf8", "JSON_UTF8"],
    ["duplicate", "JSON_DUPLICATE"],
    ["nan", "JSON_NUMBER"],
    ["infinity", "JSON_NUMBER"],
    ["overflow", "JSON_NUMBER"],
    ["surrogate", "JSON_UNICODE"],
    ["trailing", "JSON_INVALID"],
    ["depth", "JSON_LIMIT"],
    ["nodes", "JSON_LIMIT"],
    ["string", "JSON_LIMIT"],
    ["key", "JSON_LIMIT"],
    ["container", "JSON_LIMIT"],
    ["number", "JSON_NUMBER"],
  ])("rejects strict JSON %s", (name, error) => {
    const r = runCase(`json:${name}`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.output).toEqual({ error });
  });
  it("preserves valid paired Unicode and finite numbers", () => {
    expect(runCase("json:good").output).toEqual({ ok: true });
  });
  it("stages only readonly pinned bytes with an explicitly untrusted receipt", () => {
    const r = runCase("good");
    expect(r.status, r.stderr).toBe(0);
    expect(r.output).toEqual({ status: "METADATA_STAGED_UNTRUSTED", calls: 1 });
  });
  it("accepts exactly64KiB", () => {
    const r = runCase("exact_cap");
    expect(r.status, r.stderr).toBe(0);
    expect(r.output).toEqual({
      status: "METADATA_STAGED_UNTRUSTED",
      bytes: 65536,
    });
  });
  it.each(["cap", "declared_cap"])("rejects excess byte bound %s", (name) => {
    expect(runCase(name).output).toEqual({ error: "BYTE_LIMIT", calls: 1 });
  });
  it("accepts only three reviewed HTTPS redirects without logging signed queries", () => {
    expect(runCase("redirect:good").output).toEqual({
      status: "METADATA_STAGED_UNTRUSTED",
      error: null,
      calls: 4,
    });
  });
  it.each(["host", "http", "auth", "port", "fragment", "control", "count"])(
    "rejects redirect %s",
    (name) => {
      const r = runCase(`redirect:${name}`);
      expect(r.status, r.stderr).toBe(0);
      expect(r.output.error).toBe(
        name === "count" ? "REDIRECT_LIMIT" : "REDIRECT_POLICY",
      );
    },
  );
  it.each([
    ["timeout", "OPERATION_TIMEOUT"],
    ["deadline", "DEADLINE_EXCEEDED"],
  ])("bounds fake %s", (name, error) => {
    expect(runCase(name).output).toEqual({ error });
  });
  it("does not retry or emit raw transport exceptions", () => {
    expect(runCase("retry").output).toEqual({
      error: "NETWORK_ERROR",
      calls: 1,
    });
  });
  it("checks the pin before JSON decoding", () => {
    expect(runCase("hash_first").output).toEqual({ error: "HASH_MISMATCH" });
  });
  it.each([
    ["cache_exists", "CACHE_EXISTS"],
    ["cache_symlink", "CACHE_EXISTS"],
    ["foreign_output", "CACHE_OUTPUT_EXISTS"],
    ["hardlinked_receipt", "CACHE_INVALID"],
  ])("preserves foreign filesystem state for %s", (name, error) => {
    const r = runCase(name);
    expect(r.status, r.stderr).toBe(0);
    expect(r.output).toEqual({ error });
  });
  it.each([
    ["dsse_good", null, "dsseEnvelope"],
    ["dsse_missing", "METADATA_SHAPE", null],
    ["digest_missing", "METADATA_SHAPE", null],
  ])(
    "reports signature/digest presence truthfully for %s",
    (name, error, kind) => {
      const r = runCase(name!);
      expect(r.status, r.stderr).toBe(0);
      expect(r.output).toEqual({
        status: error ? "FAILED" : "METADATA_STAGED_UNTRUSTED",
        error,
        kind,
      });
    },
  );
  it("never executes public metadata content", () => {
    expect(runCase("noexec").output).toEqual({
      status: "METADATA_STAGED_UNTRUSTED",
      trust: "UNTRUSTED_FOR_EXECUTION",
    });
  });
  it.each(["watchdog_request", "watchdog_read", "watchdog_publication"])(
    "hard-stops blocking fake %s without false PASS",
    (name) => {
      const r = runCase(name);
      expect(r.status, r.stderr).toBe(124);
      expect(r.error).toBeUndefined();
      expect(r.output).toBeNull();
      expect(r.receipt?.status).not.toBe("PASS");
      expect(r.receipt?.trustState).toBe("UNTRUSTED_FOR_EXECUTION");
    },
  );
  it("arms the hard watchdog before cache setup can block", () => {
    const r = runCase("watchdog_setup");
    expect(r.status, r.stderr).toBe(124);
    expect(r.error).toBeUndefined();
    expect(r.output).toBeNull();
    expect(r.receipt).toBeNull();
  });
  it("exits even if watchdog output fails", () => {
    const r = runCase("watchdog_callback_error");
    expect(r.status, r.stderr).toBe(124);
    expect(r.error).toBeUndefined();
    expect(r.stderr).not.toContain("CANARY");
    expect(r.receipt?.status).toBe("IN_PROGRESS");
  });
  it("hard-stops a held receipt writer with a non-PASS/unknown receipt", () => {
    const r = runCase("watchdog_receipt");
    expect(r.status, r.stderr).toBe(124);
    expect(r.output).toBeNull();
    expect(r.receipt?.status).toBe("IN_PROGRESS");
    expect(r.receipt?.requiresNormalExitZero).toBe(true);
  });
  it("includes setup time in the aggregate budget and dispatches zero expired requests", () => {
    expect(runCase("setup_deadline").output).toEqual({
      error: "DEADLINE_EXCEEDED",
      calls: 0,
      exchanges: 0,
    });
  });
  it("does not expose a torn initial receipt on a write failure", () => {
    expect(runCase("receipt_atomic").output).toEqual({
      error: "CACHE_IO",
      receiptExists: false,
      calls: 0,
    });
  });
  it("classifies unsafe filesystem parents separately from network failures", () => {
    expect(runCase("parent_symlink").output).toEqual({ error: "CACHE_IO" });
  });
  it.each([
    ["wire_good", null],
    ["wire_header_limit", "HEADER_LIMIT"],
    ["wire_invalid", "NETWORK_PROTOCOL"],
  ])("checks the real stdlib adapter with fake wire %s", (name, error) => {
    const r = runCase(name!);
    expect(r.status, r.stderr).toBe(0);
    expect(r.output).toEqual({
      status: error ? "FAILED" : "METADATA_STAGED_UNTRUSTED",
      error,
    });
  });
  it("rejects ambiguous HTTP framing and compression", () => {
    expect(runCase("headers").output).toEqual({
      errors: ["HEADER_INVALID", "HEADER_INVALID", "HEADER_INVALID"],
    });
  });
  it("locks the exact reviewed asset/pin/cache/cap", () => {
    expect(runCase("pins").output).toEqual({
      url: "https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_macOS-ARM64.tar.gz.sigstore.json",
      hash: "82014df63f12ffe65bf49c6fd844d7fe39efa7e7abdc12bfe1f5a69682a56747",
      cap: 65536,
      cache: "/private/tmp/resumide-r18-bundle-metadata-20261109",
    });
  });
  it.each(
    [
      [],
      ["--url=https://attacker.example"],
      ["--expected-sha=bad"],
      ["--output=elsewhere"],
      ["--fetch-bundle-metadata", "extra"],
    ].map((args) => ({ args })),
  )("rejects CLI override %# before dispatch", ({ args }) => {
    const r = spawnSync(python, ["-B", "-I", "-S", script, ...args], {
      encoding: "utf8",
      timeout: 1000,
      env: {
        PATH: "/usr/bin:/bin",
        ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      },
    });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).errorCode).toBe("BAD_ARGUMENTS");
    expect(r.stderr).toBe("");
  });
  it("keeps help offline and requires isolated startup for the fetch action", () => {
    const env = {
      PATH: "/usr/bin:/bin",
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    };
    const help = spawnSync(python, ["-B", "-I", "-S", script, "--help"], {
      encoding: "utf8",
      timeout: 1000,
      env,
    });
    expect(help.status).toBe(0);
    expect(JSON.parse(help.stdout).status).toBe("USAGE");
    const unsafe = spawnSync(
      python,
      ["-B", script, "--fetch-bundle-metadata"],
      { encoding: "utf8", timeout: 1000, env },
    );
    expect(unsafe.status).toBe(2);
    expect(JSON.parse(unsafe.stdout).errorCode).toBe(
      "RUNTIME_ISOLATION_REQUIRED",
    );
  });
});
