"""Neutral tests of the recipe's actual outcome-gate AST, without a native build."""

import argparse
import ast
import copy
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def target(statement, name):
    return isinstance(statement, ast.Assign) and any(isinstance(item, ast.Name) and item.id == name for item in statement.targets)


def load_gate(path, expected_hash):
    if digest(path) != expected_hash:
        raise ValueError("build recipe hash differs")
    tree = ast.parse(path.read_text())
    main = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == "main")
    start = next(index for index, item in enumerate(main.body) if target(item, "names"))
    stop = next(index for index, item in enumerate(main.body) if target(item, "upstream"))
    body = []
    for item in main.body[start:stop]:
        if target(item, "junit") or target(item, "cases"):
            continue
        if isinstance(item, ast.If) and any(isinstance(node, ast.Name) and node.id == "junit" for node in ast.walk(item.test)):
            continue  # File existence/size guards are reviewed statically, not mocked.
        if isinstance(item, ast.Expr) and isinstance(item.value, ast.Call) and isinstance(item.value.func, ast.Name) and item.value.func.id == "run":
            continue
        body.append(item)
    if len(body) != 6 or sum(isinstance(item, ast.If) for item in body) != 3:
        raise ValueError("reviewed outcome-gate shape changed")
    # Execute only the reviewed names/if/Qt-outcome statements with neutral values.
    # Importing build.py would start its builder, so it is deliberately never imported.
    return compile(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), str(path), "exec"), hashlib.sha256(ast.dump(ast.Module(body=body, type_ignores=[])).encode()).hexdigest()


def fixtures(pins):
    discovery = {"tests": [{"name": name} for name in pins["upstreamTests"]]}
    cases = []
    for name in pins["upstreamTests"]:
        case = ET.Element("testcase", name=name)
        if name in pins["qtTests"]:
            ET.SubElement(case, "system-out").text = "Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 1ms\n"
        cases.append(case)
    return discovery, cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=pathlib.Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--pins", type=pathlib.Path, required=True)
    parser.add_argument("--receipt", type=pathlib.Path, required=True)
    args = parser.parse_args()
    pins = json.loads(args.pins.read_text())
    assert len(pins["upstreamTests"]) == len(set(pins["upstreamTests"])) == 71
    assert len(pins["qtTests"]) == len(set(pins["qtTests"])) == 56
    gate, gate_hash = load_gate(args.build, args.sha256)
    discovery, cases = fixtures(pins)
    results = []

    def check(label, discovery_value, cases_value, must_pass):
        namespace = {"pins": pins, "discovery": discovery_value, "cases": cases_value, "re": re}
        try:
            exec(gate, namespace)
            passed = len(namespace["qt_counts"]) == 56
        except ValueError:
            passed = False
        results.append({"label": label, "expectedAcceptance": must_pass, "actualAcceptance": passed, "passed": passed == must_pass})

    check("positive-71-ctest-56-qt-actual-outcomes", discovery, cases, True)
    check("zero-discovery", {"tests": []}, cases, False)
    check("missing-discovery", {"tests": discovery["tests"][:-1]}, cases, False)
    check("extra-discovery", {"tests": discovery["tests"] + [{"name": "unexpected"}]}, cases, False)
    check("missing-junit-case", discovery, cases[:-1], False)
    check("duplicate-junit-case", discovery, cases + [copy.deepcopy(cases[0])], False)
    for marker in ("failure", "error", "skipped"):
        changed = copy.deepcopy(cases)
        ET.SubElement(changed[0], marker)
        check("junit-" + marker, discovery, changed, False)
    for status in ("notrun", "disabled", "failed"):
        changed = copy.deepcopy(cases)
        changed[0].set("status", status)
        check("junit-status-" + status, discovery, changed, False)
    qt_index = next(index for index, case in enumerate(cases) if case.attrib["name"] in pins["qtTests"])
    summaries = {
        "missing-qt-summary": "",
        "qt-init-cleanup-only": "Totals: 2 passed, 0 failed, 0 skipped, 0 blacklisted",
        "qt-zero": "Totals: 0 passed, 0 failed, 0 skipped, 0 blacklisted",
        "qt-failure": "Totals: 3 passed, 1 failed, 0 skipped, 0 blacklisted",
        "qt-skipped": "Totals: 3 passed, 0 failed, 1 skipped, 0 blacklisted",
        "qt-blacklisted": "Totals: 3 passed, 0 failed, 0 skipped, 1 blacklisted",
        "qt-duplicate-summary": "Totals: 3 passed, 0 failed, 0 skipped\nTotals: 3 passed, 0 failed, 0 skipped",
    }
    for label, summary in summaries.items():
        changed = copy.deepcopy(cases)
        changed[qt_index].find("system-out").text = summary
        check(label, discovery, changed, False)
    stable = digest(args.build) == args.sha256
    receipt = {"tier": "neutral-recipe-gate-AST-only", "buildSHA256": args.sha256, "buildStable": stable,
               "pinsSHA256": digest(args.pins), "testSHA256": digest(pathlib.Path(__file__)), "gateASTSHA256": gate_hash,
               "cases": results, "passed": stable and all(item["passed"] for item in results),
               "nativeSourceExecuted": False, "builderImported": False, "subprocesses": False, "containers": False}
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"cases": len(results), "passed": receipt["passed"], "tier": receipt["tier"]}))
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
