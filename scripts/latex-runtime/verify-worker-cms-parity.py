"""Compare CMS signature and certificate results on the two reviewed local worker images."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

IMAGES = (
    "sha256:115d58407c3951915925597e3722a5077ceef840f41b7c0c59a0f47910657d02",
    "sha256:32cc4de5007d97d56cc355e435411227c1e0de64b13f3d084960381b2b63a38a",
)
RUN_FLAGS = (
    "--rm", "-i", "--pull=never", "--platform=linux/arm64", "--log-driver=none",
    "--label=resumide.latex.service=converter", "--network=none", "--read-only",
    "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65532:65532",
    "--memory=192m", "--memory-swap=192m", "--cpus=1", "--pids-limit=32",
    "--tmpfs=/scratch:rw,nosuid,nodev,noexec,size=8m,mode=1777", "--entrypoint=/usr/bin/python3",
)

WORKER_PROBE = r"""
import base64
import ctypes as c
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys

os.chdir("/scratch")
os.environ["HOME"] = "/scratch"
data = json.load(sys.stdin)
Path("signed.pdf").write_bytes(base64.b64decode(data["pdf"]))
root = base64.b64decode(data["root"])
leaf = base64.b64decode(data["leaf"])
nss = c.CDLL("libnss3.so")
ptr, string, integer = c.c_void_p, c.c_char_p, c.c_int


def call(name, restype, argtypes, *args):
    function = getattr(nss, name)
    function.restype = restype
    function.argtypes = argtypes
    return function(*args)


# Layout and usages from NSS lib/certdb/certt.h. This probe is ARM64-only.
class Trust(c.Structure):
    _fields_ = [(k, c.c_uint) for k in ("ssl", "email", "object_signing")]


class Item(c.Structure):
    _fields_ = [("type", integer), ("data", string), ("len", c.c_uint)]


class ParameterValue(c.Structure):
    _fields_ = [
        ("scalar", c.c_int64), ("pointer", ptr), ("array", ptr), ("size", integer),
    ]


class Parameter(c.Structure):
    _fields_ = [("type", integer), ("value", ParameterValue)]


def temporary_cert(db, der):
    item = Item(0, der, len(der))
    cert = call(
        "CERT_NewTempCertificate", ptr, [ptr, c.POINTER(Item), string, integer, integer],
        db, c.byref(item), None, 0, 1,
    )
    assert cert
    return cert


def make_db(name, add_root):
    Path(name).mkdir(mode=0o700)
    location = "sql:/scratch/" + name
    assert call("NSS_InitReadWrite", integer, [string], location.encode()) == 0
    if add_root:
        db = call("CERT_GetDefaultCertDB", ptr, [])
        slot = call("PK11_GetInternalKeySlot", ptr, [])
        assert db and slot
        cert = temporary_cert(db, root)
        if call("PK11_NeedUserInit", integer, [ptr], slot):
            assert call("PK11_InitPin", integer, [ptr, string, string], slot, None, None) == 0
        assert call(
            "PK11_ImportCert", integer, [ptr, ptr, c.c_ulong, string, integer],
            slot, cert, 0, b"Synthetic CMS Root", 0,
        ) == 0
        trust = Trust()
        assert call(
            "CERT_DecodeTrustString", integer, [c.POINTER(Trust), string],
            c.byref(trust), b",C,",
        ) == 0
        assert call(
            "CERT_ChangeCertTrust", integer, [ptr, ptr, c.POINTER(Trust)],
            db, cert, c.byref(trust),
        ) == 0
        call("CERT_DestroyCertificate", None, [ptr], cert)
        call("PK11_FreeSlot", None, [ptr], slot)
    assert call("NSS_Shutdown", integer, []) == 0
    return location


def verify_chain(location):
    assert call("NSS_Init", integer, [string], location.encode()) == 0
    db = call("CERT_GetDefaultCertDB", ptr, [])
    assert db
    cert = temporary_cert(db, leaf)
    call("PORT_SetError", None, [integer], 0)
    classic = call(
        "CERT_VerifyCertNow", integer, [ptr, ptr, integer, integer, ptr],
        db, cert, 1, 4, None,  # certUsageEmailSigner
    )
    classic_error = call("PORT_GetError", integer, [])
    revocation = call("CERT_GetClassicOCSPDisabledPolicy", ptr, [])
    assert revocation
    params = (Parameter * 3)(
        Parameter(9, ParameterValue(0, revocation, None, 0)),  # revocation flags
        Parameter(8, ParameterValue()),  # current verification date
        Parameter(),  # end
    )
    call("PORT_SetError", None, [integer], 0)
    pkix = call(
        "CERT_PKIXVerifyCert", integer, [ptr, c.c_int64, ptr, ptr, ptr],
        cert, 0x0010, params, None, None,  # certificateUsageEmailSigner
    )
    pkix_error = call("PORT_GetError", integer, [])
    call("CERT_DestroyCertificate", None, [ptr], cert)
    assert call("NSS_Shutdown", integer, []) == 0
    return {
        "certVerifyNowReturn": classic,
        "certVerifyNowErrorSlot": classic_error,
        "certPkixVerifyReturn": pkix,
        "certPkixErrorSlot": pkix_error,
    }


def verify(location):
    result = subprocess.run(
        ["/usr/bin/pdfsig", "-backend", "NSS", "-no-ocsp", "-nssdir", location, "signed.pdf"],
        capture_output=True, text=True, timeout=8,
    )
    return {
        "exit": result.returncode,
        "signature": re.findall(r"Signature Validation: ([^\n]+)", result.stdout),
        "certificate": re.findall(r"Certificate Validation: ([^\n]+)", result.stdout),
        "nssChain": verify_chain(location),
    }


print(json.dumps({
    "emptyStore": verify(make_db("empty", False)),
    "explicitRoot": verify(make_db("trusted", True)),
    "systemDefaultSslRoots": ssl.create_default_context().cert_store_stats()["x509_ca"],
}))
"""


def openssl(work, *args):
    subprocess.run(
        ["openssl", *args], check=True, cwd=work, capture_output=True, timeout=15,
    )


def make_certificates(work):
    openssl(
        work, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
        "-days", "2", "-subj", "/CN=Synthetic CMS Root",
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-keyout", "root.key", "-out", "root.pem",
    )
    openssl(
        work, "req", "-new", "-newkey", "rsa:2048", "-nodes",
        "-subj", "/CN=Synthetic CMS Signer", "-keyout", "leaf.key", "-out", "leaf.csr",
    )
    (work / "leaf-ext").write_text(
        "basicConstraints=critical,CA:FALSE\n"
        "keyUsage=critical,digitalSignature\n"
        "extendedKeyUsage=emailProtection\n"
    )
    openssl(
        work, "x509", "-req", "-in", "leaf.csr", "-CA", "root.pem",
        "-CAkey", "root.key", "-CAcreateserial", "-days", "2",
        "-extfile", "leaf-ext", "-out", "leaf.pem",
    )
    for name in ("root", "leaf"):
        openssl(work, "x509", "-in", f"{name}.pem", "-outform", "DER", "-out", f"{name}.der")


def signed_fixture(work):
    placeholder = b"/ByteRange [0000000000 0000000000 0000000000 0000000000]"
    capacity = 16384
    content = b"BT /F1 12 Tf 72 720 Td (Synthetic CMS sample) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [7 0 R] >>",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Fields [7 0 R] /SigFlags 3 >>",
        b"<< /Type /Annot /Subtype /Widget /FT /Sig /T (SyntheticSignature) "
        b"/Rect [0 0 0 0] /P 3 0 R /V 8 0 R >>",
        b"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached "
        + placeholder + b" /Contents <" + b"0" * capacity + b"> >>",
    ]
    pdf = bytearray(b"%PDF-1.7\n")
    offsets = []
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(b"xref\n0 9\n0000000000 65535 f \n")
    for offset in offsets:
        pdf.extend(f"{offset:010} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())

    start = pdf.index(b"/Contents <") + len(b"/Contents ")
    end = start + capacity + 2
    assert pdf[start:end] == b"<" + b"0" * capacity + b">"
    byte_range = f"/ByteRange [0000000000 {start:010} {end:010} {len(pdf)-end:010}]".encode()
    assert len(byte_range) == len(placeholder)
    pdf = pdf.replace(placeholder, byte_range)
    signed_bytes = pdf[:start] + pdf[end:]
    (work / "content").write_bytes(signed_bytes)
    openssl(
        work, "cms", "-sign", "-binary", "-md", "sha256", "-in", "content",
        "-signer", "leaf.pem", "-inkey", "leaf.key", "-outform", "DER", "-out", "signature.der",
    )
    openssl(
        work, "cms", "-verify", "-binary", "-inform", "DER", "-in", "signature.der",
        "-content", "content", "-CAfile", "root.pem", "-purpose", "smimesign", "-out", "verified",
    )
    assert (work / "verified").read_bytes() == signed_bytes
    hex_signature = (work / "signature.der").read_bytes().hex().encode()
    assert len(hex_signature) < capacity
    return bytes(pdf[:start] + b"<" + hex_signature.ljust(capacity, b"0") + b">" + pdf[end:])


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True, timeout=5).strip()


def remaining():
    return docker("ps", "-aq", "--filter", "label=resumide.latex.service=converter").splitlines()


def main():
    assert not {"DOCKER_HOST", "DOCKER_CONTEXT"} & os.environ.keys()
    endpoint = docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
    assert re.fullmatch(r"unix:///[^\r\n]+", endpoint)
    for image in IMAGES:
        assert docker("image", "inspect", "--format", "{{.Id}} {{.Os}}/{{.Architecture}}", image) == (
            image + " linux/arm64"
        )
    assert not remaining()
    with tempfile.TemporaryDirectory(prefix="resumide-cms-") as temp:
        work = Path(temp)
        make_certificates(work)
        fixture = {
            "pdf": signed_fixture(work),
            "root": (work / "root.der").read_bytes(),
            "leaf": (work / "leaf.der").read_bytes(),
        }
        payload = json.dumps({key: base64.b64encode(item).decode() for key, item in fixture.items()})
        reports = {
            image: json.loads(subprocess.check_output(
                ["docker", "run", *RUN_FLAGS, image, "-IB", "-c", WORKER_PROBE],
                input=payload, text=True, timeout=35,
            ))
            for image in IMAGES
        }
    for report in reports.values():
        for case in ("emptyStore", "explicitRoot"):
            outcome = report[case]
            assert outcome["exit"] == 0 and outcome["signature"] == ["Signature is Valid."]
            assert outcome["nssChain"]["certVerifyNowReturn"] == (0 if case == "explicitRoot" else -1)
            assert outcome["nssChain"]["certPkixVerifyReturn"] == (0 if case == "explicitRoot" else -1)
    original, candidate = reports.values()
    assert original["emptyStore"] == candidate["emptyStore"]
    assert original["explicitRoot"] == candidate["explicitRoot"]
    assert original["emptyStore"]["certificate"] == ["Certificate issuer is unknown."]
    assert original["systemDefaultSslRoots"] > 0 and candidate["systemDefaultSslRoots"] == 0
    remaining_converters = remaining()
    assert not remaining_converters
    print(json.dumps({
        "localCmsVerification": True,
        "fixtureSha256": {key: hashlib.sha256(item).hexdigest() for key, item in fixture.items()},
        "reports": reports,
        "remainingConverters": remaining_converters,
    }, indent=2))


if __name__ == "__main__":
    main()
