# Appended after the unchanged trusted audit CLI; data-only metadata collection.
inventory = json.loads(output)
native_reader = Reader()
native_paths = [
    '/opt/latex/native-expat/' + name for name in
    ['pins.json', 'source-and-test-receipt.json', 'build-outcome.json', 'installed-package.json']
] + [
    '/opt/latex/native-poppler/' + name for name in
    ['pins.json', 'source-and-test-receipt.json', 'build-outcome.json',
     'install-verification.json', 'candidate-signature-binding.json', 'installed-package.json']
] + ['/usr/share/doc/' + name + '/copyright' for name in
     ['libexpat1', 'libpoppler147', 'poppler-utils']]
for package in inventory['pythonInventory']['packages']:
    native_paths.append(package['metadataPath'])
    native_paths.extend(row['path'] for row in package['licenseFiles'])
raw_files = {}
for name in native_paths:
    data = native_reader.read(name)
    if len(data) > 1048576:
        raise ValueError('native_license_metadata_file_limit')
    raw_files[name] = {'bytes': len(data), 'sha256': sha256(data), 'text': data.decode('utf-8')}
if inventory['bytesRead'] + native_reader.total > MAX_TOTAL_BYTES:
    raise ValueError('combined_license_read_limit')
status_records = [fields(p) for p in re.split(r'\n[ \t]*\n', native_reader.read('/var/lib/dpkg/status').decode('utf-8'))]
if inventory['bytesRead'] + native_reader.total > MAX_TOTAL_BYTES:
    raise ValueError('combined_license_read_limit')
selected = {
    p['Package']: {key: p.get(key) for key in ['Version', 'Source', 'Architecture', 'Status']}
    for p in status_records if p.get('Package') in ['libexpat1', 'libpoppler147', 'poppler-utils']
}
extra = {'scope': 'Current installed native source/version/copyright provenance; no target module imported',
         'packageFields': selected, 'rawFiles': raw_files,
         'additionalBytesRead': native_reader.total, 'legalApproval': False}
extra_output = json.dumps(extra, ensure_ascii=True, separators=(',', ':'))
if len(output.encode('utf-8')) + len(extra_output.encode('utf-8')) + 2 > MAX_OUTPUT_BYTES:
    raise ValueError('combined_license_output_limit')
print(extra_output)
