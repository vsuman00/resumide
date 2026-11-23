"""Install only the reviewed Bookworm security packages into the OCR image."""

import re
import subprocess
from pathlib import Path


PINS = {
    "apt": "2.6.2",
    "libapt-pkg6.0": "2.6.2",
    "libpcre2-8-0": "10.42-1+deb12u2",
    "perl-base": "5.36.0-7+deb12u4",
}
PACKAGE_FORMAT = "${Package}\t${Architecture}\t${Version}\t${db:Status-Status}\n"


def read_command(*args):
    return subprocess.check_output(args, text=True).strip()


def installed_packages():
    rows = read_command("dpkg-query", "-W", f"-f={PACKAGE_FORMAT}").splitlines()
    packages = {}
    for row in rows:
        name, arch, version, status = row.split("\t")
        if status == "installed":
            packages[name, arch] = version
    return packages


def install():
    architecture = read_command("dpkg", "--print-architecture")
    if architecture not in {"arm64", "amd64"}:
        raise ValueError(f"Unsupported OCR security package architecture: {architecture}")

    before = installed_packages()
    auto_before = set(read_command("apt-mark", "showauto").splitlines())
    held_before = set(read_command("apt-mark", "showhold").splitlines())
    expected = before.copy()
    archives = []
    changed = set()
    for name, version in PINS.items():
        key = name, architecture
        archive = Path("/security") / f"{name}.deb"
        control = tuple(
            read_command("dpkg-deb", "-f", archive, field)
            for field in ("Package", "Architecture", "Version")
        )
        if control != (name, architecture, version):
            raise ValueError(f"Security archive identity mismatch: {name}")
        current = before[key]
        if current == version:
            continue
        subprocess.run(
            ("dpkg", "--compare-versions", current, "lt", version), check=True
        )
        expected[key] = version
        archives.append(archive)
        changed.add(name)

    if archives:
        install_args = (
            "--no-remove", "--no-install-recommends", "install", *archives
        )
        plan = read_command("apt-get", "--simulate", *install_args)
        planned = set(re.findall(r"^Inst ([^ :]+)", plan, re.MULTILINE))
        if planned != changed or re.search(r"^(Remv|Purg) ", plan, re.MULTILINE):
            raise ValueError("APT proposed a change outside the OCR security cohort")
        subprocess.run(("apt-get", "-y", *install_args), check=True)
        reset_auto = auto_before - set(read_command("apt-mark", "showauto").splitlines())
        if reset_auto:
            subprocess.run(("apt-mark", "auto", *sorted(reset_auto)), check=True)

    if installed_packages() != expected:
        raise ValueError("Unexpected changes to the installed OCR packages")
    if set(read_command("apt-mark", "showauto").splitlines()) != auto_before:
        raise ValueError("APT automatic package markings changed")
    if set(read_command("apt-mark", "showhold").splitlines()) != held_before:
        raise ValueError("APT package holds changed")
    subprocess.run(("apt-get", "check"), check=True)


if __name__ == "__main__":
    install()
