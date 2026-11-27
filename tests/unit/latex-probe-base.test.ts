import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const helper = fileURLToPath(
  new URL("../../scripts/latex-runtime/prepare-oci-probe.py", import.meta.url),
);
const setup = String.raw`import importlib.util,sys,json,pathlib,tempfile,hashlib,io,os,tarfile,gzip,dataclasses,time
spec=importlib.util.spec_from_file_location('probe_oci',sys.argv[1]);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
def encoded(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def digest(value):return hashlib.sha256(value).hexdigest()
def blob_path(value):return 'blobs/sha256/'+value

def fixture(root,mutation=None):
 root=pathlib.Path(root)
 inner=io.BytesIO()
 with tarfile.open(fileobj=inner,mode='w',format=tarfile.USTAR_FORMAT) as tar:
  content=b'neutral synthetic content';entry=tarfile.TarInfo('neutral.txt');entry.size=len(content);tar.addfile(entry,io.BytesIO(content))
 raw_layer=inner.getvalue();diffid=digest(raw_layer)
 compressed=gzip.compress(raw_layer,mtime=0)
 if mutation=='diff-id':compressed=gzip.compress(b'changed neutral layer',mtime=0)
 layer=digest(compressed)
 config=encoded({'os':'linux','architecture':'arm64','config':{'User':'65532:65532'},'rootfs':{'type':'layers','diff_ids':['sha256:'+diffid]}})
 config_hash=digest(config)
 manifest=encoded({'schemaVersion':2,'mediaType':m.MANIFEST_TYPE,'config':{'mediaType':m.CONFIG_TYPE,'digest':'sha256:'+config_hash,'size':len(config)},'layers':[{'mediaType':m.LAYER_TYPE,'digest':'sha256:'+layer,'size':len(compressed)}]})
 manifest_hash=digest(manifest)
 index=encoded({'schemaVersion':2,'mediaType':m.INDEX_TYPE,'manifests':[{'mediaType':m.MANIFEST_TYPE,'digest':'sha256:'+manifest_hash,'size':len(manifest),'platform':{'os':'linux','architecture':'arm64'}}]})
 if mutation=='external-url':
  obj=json.loads(index);obj['manifests'][0]['urls']=['https://private-unit-canary.test/blob'];index=encoded(obj)
 if mutation=='duplicate-json':index=b'{"schemaVersion":2,"schemaVersion":2}'
 files={'oci-layout':encoded({'imageLayoutVersion':'1.0.0'}),'index.json':index,'manifest.json':encoded([{'Config':blob_path(config_hash),'Layers':[blob_path(layer)],'RepoTags':None}]),blob_path(manifest_hash):manifest,blob_path(config_hash):config,blob_path(layer):compressed}
 expected=tuple((name,len(data),digest(data)) for name,data in sorted(files.items()))
 entries=[('blobs',None,tarfile.DIRTYPE),('blobs/sha256',None,tarfile.DIRTYPE)]+[(name,data,tarfile.REGTYPE) for name,data in files.items()]
 if mutation=='duplicate':entries.append(('index.json',index,tarfile.REGTYPE))
 if mutation=='traversal':entries.append(('../private-unit-canary',b'neutral',tarfile.REGTYPE))
 if mutation=='alias':entries.append(('./index.json',index,tarfile.REGTYPE))
 if mutation=='symlink':entries.append(('link',None,tarfile.SYMTYPE))
 if mutation=='fifo':entries.append(('pipe',None,tarfile.FIFOTYPE))
 if mutation=='unknown-blob':entries.append((blob_path('f'*64),b'neutral',tarfile.REGTYPE))
 if mutation=='extra-root':entries.append(('unknown.json',b'{}',tarfile.REGTYPE))
 if mutation=='missing-blob':entries=[entry for entry in entries if entry[0]!=blob_path(layer)]
 if mutation=='corrupt-blob':entries=[(name,b'changed' if name==blob_path(layer) else data,kind) for name,data,kind in entries]
 if mutation=='nonstandard-regular':entries=[(name,data,tarfile.CONTTYPE if name=='index.json' else kind) for name,data,kind in entries]
 archive=root/'image.tar'
 with tarfile.open(archive,'w',format=tarfile.USTAR_FORMAT) as tar:
  for name,data,kind in entries:
   info=tarfile.TarInfo(name);info.type=kind;info.mode=0o444;info.linkname='neutral' if kind==tarfile.SYMTYPE else ''
   if data is not None:info.size=len(data)
   tar.addfile(info,io.BytesIO(data) if data is not None else None)
 archive.chmod(0o444)
 original='sha256:'+'e'*64
 layer_spec=m.Layer(layer,len(compressed),diffid,len(raw_layer))
 export={'status':'exported_format_inspected_only','imageId':original,'archiveSha256':digest(archive.read_bytes()),'archiveBytes':archive.stat().st_size,'clientGroupAbsent':True,'exitCode':0,'imageMutation':False,'remoteOperation':False}
 derivation={'status':'derived_local_export_semantics_verified','originalImageId':original,'beforeExportImageId':original,'afterExportImageIdUnchanged':True,'originalDescriptor':{'mediaType':m.INDEX_TYPE,'digest':original,'size':856},'originalPlatform':{'os':'linux','architecture':'arm64'},'archiveSha256':export['archiveSha256'],'archiveBytes':export['archiveBytes'],'derivedManifestDigest':'sha256:'+manifest_hash,'derivedConfigDigest':'sha256:'+config_hash,'blobHashesVerified':3,'exactReferencedBlobClosure':True,'rootfsDiffIdsMatchDaemon':True,'allRuntimeFieldsMatch':{name:True for name in m.RUNTIME_FIELDS},'layerChecks':[{'compressedDigest':'sha256:'+layer,'compressedBytes':len(compressed),'uncompressedDigest':'sha256:'+diffid,'uncompressedBytes':len(raw_layer),'matchesDaemonRootfs':True}]}
 export_path=root/'export.json';derivation_path=root/'derivation.json';export_path.write_bytes(encoded(export));derivation_path.write_bytes(encoded(derivation));export_path.chmod(0o444);derivation_path.chmod(0o444)
 policy=m.Policy(original,export['archiveBytes'],export['archiveSha256'],manifest_hash,config_hash,expected,(layer_spec,),digest(export_path.read_bytes()),digest(derivation_path.read_bytes()))
 out=root/'output';out.mkdir(mode=0o700)
 return archive,export_path,derivation_path,out,policy

def invoke(values,**kwargs):
 archive,export,derivation,out,policy=values
 return m.prepare_layout(archive,export,derivation,policy=policy,**kwargs)
`;
function python(body: string, timeout = 5000) {
  const result = spawnSync(
    "python3",
    ["-I", "-B", "-c", setup + body, helper],
    {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      encoding: "utf8",
      timeout,
      maxBuffer: 32768,
    },
  );
  if (result.error || result.status !== 0)
    throw Error(
      "Synthetic OCI fixture failed: " +
        (result.error?.message ?? result.stderr.slice(-1000)),
    );
  return result.stdout;
}

describe("closed local OCI probe materializer, synthetic archives only", () => {
  it("keeps the pinned source index, derived manifest/config, receipts and repeated layer identities distinct", () => {
    const result = JSON.parse(
      python(
        "p=m.PINNED;print(json.dumps({'archiveBytes':p.archive_size,'archiveSha':p.archive_sha256,'original':p.original_index,'manifest':p.manifest,'config':p.config,'blobCount':len([x for x in p.members if x[0].startswith('blobs/')]),'layers':len(p.layers),'uniqueLayers':len({x.digest for x in p.layers}),'exportReceipt':p.export_receipt_sha256,'derivationReceipt':p.derivation_receipt_sha256}))",
      ),
    );
    expect(result).toMatchObject({
      archiveBytes: 96254464,
      archiveSha:
        "137b0b6b0f6aa97485f0abcc7a514aa2935e9d44660071887f633f005639499d",
      original:
        "sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c",
      manifest:
        "92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f",
      config:
        "b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc",
      blobCount: 9,
      layers: 8,
      uniqueLayers: 7,
      exportReceipt:
        "b1d18a76310fcdf48d71ce4148b9e7b3fcec490404bf4fa2dd69ac8add879e5b",
      derivationReceipt:
        "1f258405e1be4db0392add3e13fd22ab12d66831c0a76d4609bb212fed49e910",
    });
  });
  it("defaults to complete verification without creating a layout", () => {
    const output = JSON.parse(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);r=invoke(v);print(json.dumps({'status':r['status'],'materialized':r['materialized'],'outputEntries':len(list(v[3].iterdir())),'network':r['networkOperations'],'docker':r['dockerOperations']}))\n",
      ),
    );
    expect(output).toEqual({
      status: "verified_only",
      materialized: false,
      outputEntries: 0,
      network: 0,
      docker: 0,
    });
  });
  it("atomically publishes only exact regular OCI files, preserving archive and input receipts", () => {
    const output = JSON.parse(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);before=[digest(p.read_bytes()) for p in v[:3]];r=invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]));layout=v[3]/r['layoutRelativePath'];files=sorted(str(p.relative_to(layout)) for p in layout.rglob('*') if p.is_file());assert 'manifest.json' not in files;assert all(p.stat().st_mode&0o222==0 for p in layout.rglob('*'));assert before==[digest(p.read_bytes()) for p in v[:3]];print(json.dumps({'status':r['status'],'files':len(files),'runtimeAccepted':r['runtimeAccepted'],'originalIndex':r['originalIndexDigest'],'derivedManifest':r['derivedManifestDigest']}))\n",
      ),
    );
    expect(output).toMatchObject({
      status: "materialized",
      files: 5,
      runtimeAccepted: false,
      originalIndex: "sha256:" + "e".repeat(64),
    });
    expect(output.derivedManifest).not.toBe(output.originalIndex);
  });
  it.each([
    ["duplicate", "archive_member_unsafe"],
    ["traversal", "archive_member_unsafe"],
    ["alias", "archive_member_unsafe"],
    ["symlink", "archive_member_unsafe"],
    ["fifo", "archive_member_unsafe"],
    ["unknown-blob", "archive_member_unsafe"],
    ["extra-root", "archive_member_unsafe"],
    ["nonstandard-regular", "archive_member_unsafe"],
    ["missing-blob", "archive_members_mismatch"],
    ["corrupt-blob", "member_mismatch"],
    ["external-url", "descriptor_unsafe"],
    ["duplicate-json", "metadata_invalid"],
    ["diff-id", "diff_id_mismatch"],
  ])("rejects %s before creating output", (mutation, code) => {
    expect(
      python(
        `with tempfile.TemporaryDirectory() as d:\n v=fixture(d,${JSON.stringify(mutation)})\n try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))\n except m.LayoutError as e:print(e.code)\n assert not list(v[3].iterdir())\n`,
      ),
    ).toBe(code + "\n");
  });
  it.each(["archive-size", "archive-hash", "receipt-hash", "approval"])(
    "rejects a changed %s binding without mutation",
    (kind) => {
      expect(
        python(
          `with tempfile.TemporaryDirectory() as d:\n v=fixture(d);policy=v[4];approved=m.fingerprint(policy)\n if ${JSON.stringify(kind)}=='archive-size':v[0].chmod(0o644);v[0].write_bytes(v[0].read_bytes()+b'0');v[0].chmod(0o444)\n if ${JSON.stringify(kind)}=='archive-hash':v[0].chmod(0o644);v[0].write_bytes(b'x'+v[0].read_bytes()[1:]);v[0].chmod(0o444)\n if ${JSON.stringify(kind)}=='receipt-hash':policy=dataclasses.replace(policy,export_receipt_sha256='0'*64)\n if ${JSON.stringify(kind)}=='approval':approved='0'*64\n v=(*v[:4],policy)\n try:invoke(v,output_dir=v[3],approved=approved if ${JSON.stringify(kind)}=='approval' else m.fingerprint(policy))\n except m.LayoutError as e:print(e.code)\n assert not list(v[3].iterdir())\n`,
        ),
      ).toMatch(/^(archive_mismatch|receipt_mismatch|approval_mismatch)\n$/);
    },
  );
  it.each(["compressed", "decompressed"])(
    "enforces aggregate %s bytes before publication",
    (kind) => {
      expect(
        python(
          `with tempfile.TemporaryDirectory() as d:\n v=fixture(d);limits=dataclasses.replace(m.LIMITS,${kind === "compressed" ? "compressed_bytes" : "uncompressed_bytes"}=100)\n try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4],limits),limits=limits)\n except m.LayoutError as e:print(e.code)\n assert not list(v[3].iterdir())\n`,
        ),
      ).toBe(
        (kind === "compressed" ? "compressed_limit" : "uncompressed_limit") +
          "\n",
      );
    },
  );
  it("does not overwrite or remove owner content in an occupied output directory", () => {
    expect(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);keep=v[3]/'keep';keep.write_text('neutral')\n try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))\n except m.LayoutError as e:print(e.code)\n assert keep.read_text()=='neutral' and len(list(v[3].iterdir()))==1\n",
      ),
    ).toBe("output_unsafe\n");
  });
  it("cleans only its exact partially copied temporary output on copy failure", () => {
    expect(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);original=m._copy_member;calls=[]\n def fail_after_first(*args,**kwargs):\n  calls.append(True);original(*args,**kwargs);raise OSError('PRIVATE_UNIT_CANARY')\n m._copy_member=fail_after_first\n try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))\n except m.LayoutError as e:print(e.code)\n assert calls and not list(v[3].iterdir())\n",
      ),
    ).toBe("materialization_failed\n");
  });
  it("rejects FIFO input without blocking or printing its path", () => {
    expect(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);archive=v[0];archive.unlink();os.mkfifo(archive,0o444)\n try:invoke(v)\n except m.LayoutError as e:print(e.code)\n",
        750,
      ),
    ).toBe("input_unsafe\n");
  });
  it("bounds the whole operation with a deadline and emits no raw exception", () => {
    expect(
      python(
        "with tempfile.TemporaryDirectory() as d:\n v=fixture(d);original=m._validate_archive\n def slow(*args,**kwargs):time.sleep(0.2);return original(*args,**kwargs)\n m._validate_archive=slow;limits=dataclasses.replace(m.LIMITS,deadline_seconds=0.01)\n try:invoke(v,limits=limits)\n except m.LayoutError as e:print(e.code)\n",
        750,
      ),
    ).toBe("deadline_exceeded\n");
  });
  it("CLI refuses unsupported input without echoing arguments or accessing an archive", () => {
    const result = spawnSync(
      "python3",
      ["-I", "-B", helper, "--PRIVATE_UNIT_CANARY"],
      { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 2000 },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("PRIVATE_UNIT_CANARY");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      code: "invalid_arguments",
      networkOperations: 0,
      dockerOperations: 0,
    });
  });
});

describe("strict materializer CLI admission", () => {
  it.each([
    [
      "--arch",
      "PRIVATE_UNIT_CANARY",
      "--export-receipt",
      "x",
      "--derivation-receipt",
      "x",
    ],
    [
      "--archive",
      "x",
      "--archive",
      "PRIVATE_UNIT_CANARY",
      "--export-receipt",
      "x",
      "--derivation-receipt",
      "x",
    ],
  ])(
    "rejects ambiguous or duplicate arguments before input reads: %j",
    (...args) => {
      const result = spawnSync("python3", ["-I", "-B", helper, ...args], {
        env: { PATH: process.env.PATH },
        encoding: "utf8",
        timeout: 2000,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        code: "invalid_arguments",
        networkOperations: 0,
        dockerOperations: 0,
      });
      expect(result.stdout).not.toContain("PRIVATE_UNIT_CANARY");
    },
  );
});

describe("owned output publication and cleanup", () => {
  it("publishes a complete layout with one atomic rename after validation and copying", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);rename=os.rename;observed=[]
 def inspect_rename(source,target):
  p=pathlib.Path(source);assert not pathlib.Path(target).exists();assert len([x for x in p.rglob('*') if x.is_file()])==5;observed.append(True);return rename(source,target)
 os.rename=inspect_rename;r=invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]));assert len(observed)==1 and (v[3]/r['layoutRelativePath']).is_dir();print(r['status'])
`),
    ).toBe("materialized\n");
  });
  it("preserves an untracked output entry and reports cleanup uncertainty", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=m._copy_member
 def unexpected(*args,**kwargs):
  original(*args,**kwargs);(pathlib.Path(args[2]).parent/'untracked').write_text('neutral');raise OSError('PRIVATE_UNIT_CANARY')
 m._copy_member=unexpected
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert list(v[3].rglob('untracked'))
`),
    ).toBe("cleanup_unknown\n");
  });
  it("rejects source metadata mutation during copying before atomic publication", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=m._copy_member
 def change_source(*args,**kwargs):
  original(*args,**kwargs);v[0].chmod(0o644);v[0].chmod(0o444)
 m._copy_member=change_source
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert not list(v[3].iterdir())
`),
    ).toBe("input_changed\n");
  });
  it("refuses a FIFO substitution during input open without waiting for a writer", () => {
    expect(
      python(
        `with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=os.open
 def raced(path,flags,*args,**kwargs):
  if pathlib.Path(path)==v[0]:v[0].unlink();os.mkfifo(v[0],0o444)
  return original(path,flags,*args,**kwargs)
 os.open=raced
 try:invoke(v)
 except m.LayoutError as e:print(e.code)
`,
        750,
      ),
    ).toBe("input_unsafe\n");
  });
  it("refuses insufficient output space before creating transaction output", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);m._available=lambda path:0
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert not list(v[3].iterdir())
`),
    ).toBe("disk_limit\n");
  });
});

describe("final staged layout admission", () => {
  it("does not publish untracked files introduced during a copy", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=m._copy_member
 def unexpected(*args,**kwargs):
  original(*args,**kwargs);(pathlib.Path(args[2]).parent/'untracked').write_text('neutral')
 m._copy_member=unexpected
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert not list(v[3].rglob('layout')) and list(v[3].rglob('untracked'))
`),
    ).toBe("cleanup_unknown\n");
  });
  it("does not publish a replaced output inode or remove its replacement during cleanup", () => {
    expect(
      python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=m._copy_member;changed=[]
 def replace_output(*args,**kwargs):
  original(*args,**kwargs)
  if not changed:
   target=pathlib.Path(args[2]);swap=target.with_name(target.name+'.swap');swap.write_bytes(b'neutral replacement');swap.chmod(0o444);swap.replace(target);changed.append(target)
 m._copy_member=replace_output
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert changed and changed[0].read_bytes()==b'neutral replacement' and not list(v[3].rglob('layout'))
`),
    ).toBe("cleanup_unknown\n");
  });
});

it("does not publish a replaced staging-directory identity even when file bytes and inodes match", () => {
  expect(
    python(`with tempfile.TemporaryDirectory() as d:
 v=fixture(d);original=m._copy_member;changed=[]
 def replace_directory(*args,**kwargs):
  original(*args,**kwargs)
  if not changed:
   target=pathlib.Path(args[2]);directory=target.parent;prior=directory.with_name('saved-directory');directory.rename(prior);directory.mkdir(mode=0o700);(prior/target.name).rename(target);prior.rmdir();changed.append(directory)
 m._copy_member=replace_directory
 try:invoke(v,output_dir=v[3],approved=m.fingerprint(v[4]))
 except m.LayoutError as e:print(e.code)
 assert changed and changed[0].is_dir() and not list(v[3].rglob('layout'))
`),
  ).toBe("cleanup_unknown\n");
});
