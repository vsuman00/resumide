"""Run the installed supervisor around a rendered PDF padded with comments."""

import base64
from contextlib import redirect_stdout
from hashlib import sha256
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys


CAP = 5 * 1024 * 1024
PDF = Path('/scratch/main.pdf')
SUPERVISOR = Path('/opt/latex/supervisor.py')
PHRASE = 'Neutral output boundary fixture.'


def verify(size):
    assert size in {CAP, CAP + 1}
    observed = {'paddingRuns': 0, 'outputReads': 0, 'textRuns': 0}
    read_bytes = Path.read_bytes
    popen = subprocess.Popen

    def read(path):
        if path == PDF:
            observed['outputReads'] += 1
        return read_bytes(path)

    class RendererProbe(popen):
        def __init__(self, args, *positional, **keywords):
            self.pad_output = args[:2] == ['/opt/latex/confine', '/usr/bin/xdvipdfmx']
            if args[0] == '/usr/bin/pdftotext':
                observed['textRuns'] += 1
            super().__init__(args, *positional, **keywords)

        def wait(self, *positional, **keywords):
            result = super().wait(*positional, **keywords)
            if self.pad_output and result == 0:
                self.pad_output = False
                original = read_bytes(PDF)
                marker = original.rfind(b'\nstartxref\n')
                assert original.startswith(b'%PDF-') and marker > 0
                assert original.rstrip().endswith(b'%%EOF')
                assert len(original) < size - 2
                comment = b'%' + b' ' * 126 + b'\n'
                start = marker + 1
                repeats, remainder = divmod(size - len(original), len(comment))
                tail = b'%' + b' ' * (remainder - 2) + b'\n' if remainder >= 2 else b'\n' * remainder
                padded = original[:start] + comment * repeats + tail + original[start:]
                assert len(padded) == size
                PDF.write_bytes(padded)
                observed['paddingRuns'] += 1
            return result

    captured = io.StringIO()
    subprocess.Popen = RendererProbe
    Path.read_bytes = read
    try:
        with redirect_stdout(captured):
            try:
                runpy.run_path(str(SUPERVISOR), run_name='__main__')
            except SystemExit as stopped:
                assert stopped.code == 0
    finally:
        subprocess.Popen = popen
        Path.read_bytes = read_bytes

    assert observed['paddingRuns'] == 1 and PDF.stat().st_size == size
    result = json.loads(captured.getvalue())
    receipt = {
        **observed,
        'outputBytes': size,
        'supervisorSha256': sha256(read_bytes(SUPERVISOR)).hexdigest(),
    }
    if size == CAP:
        assert set(result) == {'pdf', 'pages', 'text', 'diagnostics'}
        assert result['pages'] == 1 and result['text'].strip() == PHRASE
        assert result['diagnostics'] == []
        pdf = base64.b64decode(result['pdf'], validate=True)
        assert len(pdf) == size and pdf == read_bytes(PDF)
        assert observed['outputReads'] == 1 and observed['textRuns'] == 1
        return {**receipt, 'pages': 1, 'pdfSha256': sha256(pdf).hexdigest()}

    assert result == {'error': 'output_invalid'}
    assert observed['outputReads'] == 0 and observed['textRuns'] == 0
    return {**receipt, 'code': result['error']}


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
