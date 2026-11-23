"""Emit data-only C adapter containing the literal vendor allocation-budget statements."""
import hashlib
import json
import pathlib


def generate(baseline, candidate, output, pins):
    bodies = []
    bindings = []
    for mode, path, expected in [('original', baseline, pins['baselineCidSourceSha256']),
                                  ('patched', candidate, pins['patchedCidSourceSha256'])]:
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError('CID adapter source binding changed')
        text = raw.decode()
        start = text.index('      data_len = offsets[num_subrs] - offsets[0];')
        end = text.index('      if ( FT_QNEW_ARRAY', start)
        block = text[start:end]
        declaration = '    FT_ULong       cum_len = 0;\n' if mode == 'patched' else ''
        if (mode == 'patched') != (declaration in text and 'cum_len += data_len;' in block):
            raise ValueError('unexpected literal budget block')
        body = ('static FT_Error ' + mode + '(const FT_ULong *lengths, unsigned count, FT_ULong size, unsigned *accepted) {\n'
                '  FT_StreamRec record = {0}; FT_Stream stream = &record; record.size = size;\n'
                '  FT_Error error = FT_Err_Ok; FT_ULong offsets[2], data_len; unsigned num_subrs = 1; (void)stream;\n'
                + declaration + '  *accepted = 0;\n  for (unsigned i=0; i<count; i++) {\n'
                '    assert(lengths[i] <= size); offsets[0]=0; offsets[1]=lengths[i];\n'
                + block + '    (void)data_len; (*accepted)++; /* Mock allocation observation; no bytes allocated or decrypted. */\n'
                '  }\n' + ('Fail:\n' if mode == 'patched' else '') + '  return error;\n}\n')
        bodies.append(body)
        bindings.append({'mode': mode, 'sourceSha256': expected, 'literalBlockSha256': hashlib.sha256(block.encode()).hexdigest(),
                         'scope': 'literal allocation-budget block; not the complete font parser/allocator/decryptor'})
    header = '#include <assert.h>\n#include <stdio.h>\n#include <ft2build.h>\n#include FT_FREETYPE_H\n#include FT_SYSTEM_H\n#define FT_ERROR(x) ((void)0)\n#define FT_THROW(x) FT_Err_ ## x\n'
    checks = r'''
int main(void) {
  const struct { FT_ULong size, lengths[5]; unsigned count, accepted; FT_Error error; } cases[] = {
    {64,{4,4,4,4},4,4,FT_Err_Ok},
    {16,{16,16,16,16},4,4,FT_Err_Ok},
    {16,{16,16,16,16,16},5,4,FT_Err_Invalid_File_Format},
    {16,{16,16,16,16,3},5,5,FT_Err_Ok},
    {16,{16,16,16,16,4},5,4,FT_Err_Invalid_File_Format}
  };
  for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++) {
    unsigned a=0,b=0;
    assert(original(cases[i].lengths,cases[i].count,cases[i].size,&a)==FT_Err_Ok && a==cases[i].count);
    assert(patched(cases[i].lengths,cases[i].count,cases[i].size,&b)==cases[i].error && b==cases[i].accepted);
  }
  puts("neutral-vendor-budget-cases=5 original-controls=5 patched-controls=5"); return 0;
}
'''
    output.write_text(header + '\n'.join(bodies) + checks)
    return {'sourceBindings': bindings, 'programSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'expectedNeutralCases': 5, 'noFontOrPdfInput': True, 'wholeCveReproduction': False,
            'boundary': 'Integer division cum_len/4 is preserved, including67 accepted versus68 rejected for stream16.'}
