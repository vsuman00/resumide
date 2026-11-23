"""Proposed E010 assessment; requires coordinator allocation before any build."""
import re


def assess(cases, pins, binding, baseline, actual_exit):
    names = [case.attrib['name'] for case in cases]
    if sorted(names) != pins['upstreamTests'] or len(names) != 71:
        raise ValueError('incomplete or changed original CTest registration')
    if actual_exit not in (0, 8):
        raise ValueError('unexpected original CTest exit status')
    failed = []
    qt_counts = {}
    for case in cases:
        name = case.attrib['name']
        if (case.find('error') is not None or case.find('skipped') is not None
                or case.attrib.get('status', 'run') not in ('run', 'fail')):
            raise ValueError('original CTest error, skip or incomplete execution')
        failure = case.find('failure') is not None
        if failure:
            failed.append(name)
        if (case.attrib.get('status', 'run') == 'fail') != failure:
            raise ValueError('CTest failure status disagrees with JUnit')
        output = case.findtext('system-out', default='')
        if len(output.encode()) > 1048576 or '[This part of the test output was removed' in output:
            raise ValueError('incomplete or oversized original test output')
        if name in pins['qtTests']:
            totals = re.findall(r'Totals:\s+(\d+) passed,\s+(\d+) failed,\s+(\d+) skipped(?:,\s+(\d+) blacklisted)?', output)
            if len(totals) != 1 or int(totals[0][0]) <= 2:
                raise ValueError('missing/zero original Qt positive-method evidence')
            values = tuple(int(value or 0) for value in totals[0])
            if values[2:] != (0, 0):
                raise ValueError('original Qt skip or blacklist')
            qt_counts[name] = {'reportedPassedIncludingInitCleanup': values[0],
                               'failed': values[1], 'skipped': values[2], 'blacklisted': values[3]}
    if len(qt_counts) != 56 or not set(pins['selfContainedQtTests']).issubset(qt_counts):
        raise ValueError('missing original 56-class Qt evidence')
    exception = None
    if failed:
        target = 'check_qt6_signature_basics'
        if failed != [target] or actual_exit != 8:
            raise ValueError('failure outside exact proposed E010 class')
        for name, counts in qt_counts.items():
            if name != target and counts['failed']:
                raise ValueError('failure outside exact proposed E010 Qt row')
        if qt_counts[target] != {'reportedPassedIncludingInitCleanup': 11, 'failed': 1, 'skipped': 0, 'blacklisted': 0}:
            raise ValueError('changed proposed E010 positive/failure counts')
        case = next(case for case in cases if case.attrib['name'] == target)
        if len(case.findall('failure')) != 1 or case.find('failure').attrib.get('message') != 'Failed':
            raise ValueError('changed original CTest failure record')
        output = case.findtext('system-out', default='')
        failures = re.findall(r'^FAIL!\s+:\s+([^\r\n]+)$', output, re.M)
        passes = re.findall(r'^PASS\s+:\s+([^\r\n]+)$', output, re.M)
        if failures != ['TestSignatureBasics::testPgp(gpg) Compared values are not the same'] or passes != baseline['passedRows']:
            raise ValueError('changed method/backend or additional assertion failure')
        if (not re.search(r'Actual\s+\(siginfo0->getSignerName\(\)\)\s*:\s*""', output)
                or not re.search(r'Expected\s+\(std::string \{ "Sune Vuorela" \}\)\s*:\s*"Sune Vuorela"', output)
                or not re.search(r'^\s+Loc:\s+\[\./qt6/tests/check_signature_basics\.cpp\(311\)\]\s*$', output, re.M)):
            raise ValueError('changed exact proposed E010 signer assertion')
        if (binding['executableSha256'] != baseline['executableSha256']
                or binding['candidateTestSourceSha256'] != baseline['testSourceSha256']
                or pins['testdata']['sha256'] != baseline['testdataArchiveSha256']
                or pins['testdataManifestSha256'] != baseline['testdataManifestSha256']):
            raise ValueError('proposed E010 executable/source/fixture identity changed')
        common = {row['resolvedPath']: row['sha256'] for row in binding['loadedLibraries']
                  if not row['resolvedPath'].startswith('/work/')}
        build_libraries = [row for row in binding['loadedLibraries'] if row['resolvedPath'].startswith('/work/')]
        if (len(build_libraries) != 1 or build_libraries[0]['resolvedPath'] != binding['corePath']
                or build_libraries[0]['sha256'] != binding['coreSha256']):
            raise ValueError('unexpected extra candidate build-tree library')
        if common != baseline['candidateExpectedNonCoreLibraries']:
            raise ValueError('proposed E010 noncore/crypto binding changed')
        exception = {'id': 'E010', 'scope': 'private engineering only; not release acceptance',
                     'class': target, 'method': 'testPgp', 'backend': 'gpg', 'sourceLine': 311,
                     'actualSigner': '', 'expectedSigner': 'Sune Vuorela',
                     'originalTestStillFailed': True, 'sourceOrKeyOrClockChanged': False,
                     'unexecutedLaterAssertionLines': [312, 313, 314, 315],
                     'pgpVerificationDisabledClaim': False,
                     'baselineOnlyRemovedLibrary': baseline['baselineOnlyRemovedLibrary']}
    else:
        if actual_exit != 0 or any(counts['failed'] for counts in qt_counts.values()):
            raise ValueError('unexplained original CTest/Qt failure')
    return {'ctestExecutables': len(cases), 'passedExecutables': len(cases) - len(failed),
            'failedExecutables': len(failed), 'failedOrSkipped': len(failed),
            'skippedExecutables': 0, 'actualCtestExitCode': actual_exit,
            'allNativeTestsPassed': not failed, 'qtOutcomes': qt_counts,
            'qtClassesWithPositiveMethodEvidence': len(qt_counts),
            'selfContainedQtExecutables': len(pins['selfContainedQtTests']),
            'engineeringException': exception, 'debianIgnoredTestExitNotUsedAsAcceptance': True}
