# Test-only: production Dockerfile and flags are deliberately unchanged.
FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    tesseract-ocr=5.3.0-2 tesseract-ocr-eng=1:4.1.0-2 \
    poppler-utils=22.12.0-2+deb12u3 python3=3.11.2-1+b1 \
 && echo '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2  /usr/share/tesseract-ocr/5/tessdata/eng.traineddata' | sha256sum -c - \
 && dpkg-query -W > /opt/ocr-packages.txt \
 && sha256sum /opt/ocr-packages.txt > /opt/ocr-packages.sha256 \
 && test "$(dpkg-query -W -f='${Version}' tesseract-ocr)" = '5.3.0-2' \
 && test "$(dpkg-query -W -f='${Version}' poppler-utils)" = '22.12.0-2+deb12u3' \
 && tesseract --version 2>&1 | grep -F 'tesseract 5.3.0' \
 && pdftoppm -v 2>&1 | grep -F 'pdftoppm version 22.12.0' \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir /scratch && chown 10001:10001 /scratch
ADD --checksum=sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba --chmod=0444 https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/eng.traineddata /opt/tessdata-best/eng.traineddata
ADD --checksum=sha256:a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9 --chmod=0444 https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/LICENSE /opt/tessdata-best/LICENSE
RUN chmod 0755 /opt/tessdata-best
COPY --chown=root:root --chmod=0444 runner.py /opt/ocr-runner.py
ENV PYTHONDONTWRITEBYTECODE=1 TMPDIR=/scratch OMP_THREAD_LIMIT=2 LC_ALL=C.UTF-8
USER 10001:10001
RUN test -r /opt/tessdata-best/eng.traineddata \
 && test -r /opt/tessdata-best/LICENSE \
 && test -r /usr/share/tesseract-ocr/5/tessdata/configs/tsv
WORKDIR /scratch
ENTRYPOINT ["python3", "-I", "-B", "/opt/ocr-runner.py"]
