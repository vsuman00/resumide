"""Clone reviewed immutable Fontconfig rules without writable user inputs."""

import argparse
import copy
import hashlib
import json
import pathlib
import re
import tempfile
import xml.etree.ElementTree as ET

POLICY = "latex-fontconfig/1.0.0"
SYSTEM_ROOT = pathlib.Path("/etc/fonts")
SHARED_ROOT = pathlib.Path("/usr/share/fontconfig/conf.avail")
FONT_ROOTS = (
    pathlib.Path("/usr/share/fonts"),
    pathlib.Path("/usr/local/share/fonts"),
    pathlib.Path("/usr/share/texmf/fonts/opentype"),
)
CACHE_ROOT = pathlib.Path("/var/cache/fontconfig")


def within(path, roots):
    return any(path == root or root in path.parents for root in roots)


def seal_fontconfig(output, system_root=SYSTEM_ROOT, shared_root=SHARED_ROOT):
    output = pathlib.Path(output).resolve()
    system_root = pathlib.Path(system_root).resolve()
    roots = (system_root, pathlib.Path(shared_root).resolve())
    if within(output, roots):
        raise ValueError("Sealed Fontconfig output overlaps its source")
    if output.exists():
        raise ValueError("Sealed Fontconfig output must be new")
    output.mkdir(parents=True)
    sources, generated, removed, missing = [], {}, [], []
    seen, active = {}, set()

    def allowed_source(path):
        resolved = path.resolve()
        if not within(resolved, roots):
            raise ValueError("Fontconfig include escaped reviewed system roots")
        return resolved

    def user_entry(node):
        value = (node.text or "").strip()
        return (
            node.attrib.get("prefix") == "xdg"
            or value.startswith("~")
            or value in ("$HOME", "$" + "{HOME}")
            or value.startswith(("$HOME/", "$" + "{HOME}/"))
        )

    def validate_path_node(node):
        keys = {"ignore_missing", "deprecated", "prefix"} if node.tag == "include" else ({"prefix", "salt"} if node.tag == "dir" else {"prefix"})
        if set(node.attrib) - keys:
            raise ValueError("Unreviewed Fontconfig path attributes")
        for key in ("ignore_missing", "deprecated"):
            if key in node.attrib and node.attrib[key] not in ("yes", "no"):
                raise ValueError("Unreviewed Fontconfig path flag")
        if node.attrib.get("prefix") not in (None, "xdg"):
            raise ValueError("Unreviewed Fontconfig path prefix")
        if not (node.text or "").strip():
            raise ValueError("Empty Fontconfig path")

    def clone(path):
        path = pathlib.Path(path).absolute()
        resolved = allowed_source(path)
        if resolved in active:
            raise ValueError("Fontconfig include cycle")
        if resolved in seen:
            if seen[resolved][0] != path:
                raise ValueError("Repeated Fontconfig source through an unreviewed alias")
            return seen[resolved][1]
        data = resolved.read_bytes()
        declarations = re.sub(rb"<!--.*?-->", b"", data, flags=re.S)
        if b"<!ENTITY" in declarations.upper() or re.search(rb"<!DOCTYPE\b[^>]*\[", declarations, flags=re.I):
            raise ValueError("Fontconfig entity declarations are unsupported")
        original = ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True)))
        if original.tag != "fontconfig":
            raise ValueError("Unexpected Fontconfig document root")
        target = output / ("fonts.conf" if not sources else f"{len(sources):03d}-{path.name}")
        seen[resolved] = (path, target)
        active.add(resolved)
        sources.append({
            "path": str(path), "resolvedPath": str(resolved),
            "sha256": hashlib.sha256(data).hexdigest(), "output": str(target),
        })
        tree = copy.deepcopy(original)
        for child in list(tree):
            tree.remove(child)
        for index, node in enumerate(original):
            if node.tag not in ("include", "dir", "cachedir"):
                if any(x.tag in ("include", "dir", "cachedir") for x in node.iter()):
                    raise ValueError("Nested Fontconfig path directive")
                tree.append(copy.deepcopy(node))
                continue
            validate_path_node(node)
            value = (node.text or "").strip()
            if user_entry(node):
                removed.append({
                    "source": str(path), "index": index, "tag": node.tag,
                    "attributes": dict(node.attrib), "value": value,
                    "reason": "HOME/XDG/user path",
                })
                continue
            if "$" in value or "~" in value or any(c in value for c in "*?[]"):
                raise ValueError("Unreviewed dynamic Fontconfig path")
            if node.tag != "include":
                location = pathlib.Path(value)
                allowed = FONT_ROOTS if node.tag == "dir" else (CACHE_ROOT,)
                if not location.is_absolute() or not within(location.resolve(), tuple(p.resolve() for p in allowed)):
                    raise ValueError("Unreviewed font or cache directory")
                tree.append(copy.deepcopy(node))
                continue
            location = pathlib.Path(value)
            if not location.is_absolute():
                if value not in ("conf.d", "local.conf"):
                    raise ValueError("Unreviewed relative Fontconfig include")
                location = system_root / value
            allowed_source(location)
            if not location.exists():
                if node.attrib.get("ignore_missing") != "yes":
                    raise ValueError("Missing required Fontconfig include")
                missing.append({"source": str(path), "value": value, "resolvedPath": str(location)})
                continue
            includes = [location]
            if location.is_dir():
                includes = sorted(
                    (p for p in location.iterdir() if p.name and p.name[0] in "0123456789" and p.name.endswith(".conf")),
                    key=lambda p: p.name.encode(),
                )
            for include in includes:
                if not include.is_file():
                    raise ValueError("Fontconfig directory entry is not a file")
                sealed = clone(include)
                element = copy.deepcopy(node)
                element.attrib.clear()
                element.text = str(sealed)
                tree.append(element)
        active.remove(resolved)
        # Fontconfig's Expat handler ignores external DTD identifiers/defaults.
        # Keep rules/text/attributes in order; emit no external DTD or entity input.
        payload = ET.tostring(tree, encoding="utf-8", xml_declaration=True)
        # ElementTree omits prolog comments; retain source notices verbatim and in order.
        comment_blanks = re.sub(rb"<!--.*?-->", lambda match: b" " * len(match.group()), data, flags=re.S)
        root_start = re.search(rb"<fontconfig(?:\s|>)", comment_blanks)
        if root_start is None:
            raise ValueError("Missing Fontconfig opening element")
        notices = re.findall(rb"<!--.*?-->", data[:root_start.start()], flags=re.S)
        if notices:
            declaration, body = payload.split(b"\n", 1)
            payload = declaration + b"\n" + b"\n".join(notices) + b"\n" + body
        target.write_bytes(payload)
        generated[str(target)] = hashlib.sha256(payload).hexdigest()
        return target

    main = clone(system_root / "fonts.conf")
    return {
        "policy": POLICY, "config": str(main), "searchPath": str(output),
        "files": dict(sorted(generated.items())), "sourceOrder": sources,
        "removedUserEntries": removed, "missingOptionalIncludes": missing,
        "fontReadPermissionsAdded": False,
    }


def self_test():
    with tempfile.TemporaryDirectory() as temporary:
        base = pathlib.Path(temporary)
        system = base / "etc"; (system / "conf.d").mkdir(parents=True)
        shared = base / "shared"; shared.mkdir()
        (system / "fonts.conf").write_text(
            '<!-- exact pre-root vendor notice --><fontconfig><!--vendor notice--><dir>/usr/share/fonts</dir><dir prefix="xdg">fonts</dir>'
            '<cachedir>/var/cache/fontconfig</cachedir><cachedir>~/.fontconfig</cachedir>'
            '<include>conf.d</include><include ignore_missing="yes">local.conf</include></fontconfig>'
        )
        first = '<fontconfig><alias><family>serif</family><prefer><family>Family With Spaces</family></prefer></alias></fontconfig>'
        (system / "conf.d/10-first.conf").write_text(first)
        (system / "conf.d/50-user.conf").write_text(
            '<fontconfig><include prefix="xdg">fontconfig/fonts.conf</include>'
            '<include ignore_missing="yes">~/.fonts.conf</include></fontconfig>'
        )
        (system / "conf.d/60-last.conf").write_text(
            '<fontconfig><match target="pattern"><edit name="antialias" mode="assign"><bool>true</bool></edit></match></fontconfig>'
        )
        result = seal_fontconfig(base / "sealed", system, shared)
        assert [pathlib.Path(x["path"]).name for x in result["sourceOrder"]] == [
            "fonts.conf", "10-first.conf", "50-user.conf", "60-last.conf",
        ]
        assert len(result["removedUserEntries"]) == 4
        assert len(result["missingOptionalIncludes"]) == 1
        main = ET.parse(result["config"]).getroot()
        assert [n.tag for n in main if isinstance(n.tag, str)] == ["dir", "cachedir", "include", "include", "include"]
        main_bytes = pathlib.Path(result["config"]).read_bytes()
        assert b"vendor notice" in main_bytes
        assert b"<!-- exact pre-root vendor notice -->" in main_bytes
        assert main_bytes.index(b"<!-- exact pre-root vendor notice -->") < main_bytes.index(b"<fontconfig>")
        assert ET.tostring(ET.parse(main.findall("include")[0].text).getroot()) == ET.tostring(ET.fromstring(first))
        assert ET.parse(main.findall("include")[1].text).getroot().findall("include") == []
        for path, digest in result["files"].items():
            assert hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() == digest
        # Unknown dynamic/relative includes fail rather than being guessed.
        for number, element in enumerate([
            '<include prefix="relative">conf.d</include>',
            '<include>$UNREVIEWED/conf</include>',
            '<include ignore_missing="yes">unknown-relative.conf</include>',
            '<cachedir>/scratch/cache</cachedir>',
            '<include option="unknown">conf.d</include>',
        ]):
            (system / "fonts.conf").write_text("<fontconfig>" + element + "</fontconfig>")
            try:
                seal_fontconfig(base / f"bad-{number}", system, shared)
            except ValueError:
                pass
            else:
                raise AssertionError("Unreviewed Fontconfig path accepted")
        (system / "fonts.conf").write_text('<fontconfig><include>conf.d</include></fontconfig>')
        (system / "conf.d/10-first.conf").write_text('<fontconfig><include>' + str(system / "fonts.conf") + '</include></fontconfig>')
        try:
            seal_fontconfig(base / "cycle", system, shared)
        except ValueError:
            pass
        else:
            raise AssertionError("Fontconfig include cycle accepted")
    print("Sealed Fontconfig fixture self-test passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--output", default="/opt/latex/fontconfig")
    options = parser.parse_args()
    if options.self_test:
        self_test()
    else:
        print(json.dumps(seal_fontconfig(options.output), sort_keys=True))
