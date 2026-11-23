# Test-only: production Dockerfile and flags are deliberately unchanged.
ARG TARGETARCH

FROM scratch AS security-arm64
ADD --checksum=sha256:4fa6cc317a264db2d5cb90167720120a91910740cb3f14a838ebfb348abc1075 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/a/apt/apt_2.6.2_arm64.deb /apt.deb
ADD --checksum=sha256:586df8843e204aaf0c809fc804262289ea81d988cd4049a8fa6b2c3d58b64e88 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/a/apt/libapt-pkg6.0_2.6.2_arm64.deb /libapt-pkg6.0.deb
ADD --checksum=sha256:8498d2c0bd6747dfc2fc6eec62774a86967079555f7043d5a7b78ee4efbbc0fb --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/p/pcre2/libpcre2-8-0_10.42-1+deb12u2_arm64.deb /libpcre2-8-0.deb
ADD --checksum=sha256:03d979b849a1a0a8955eee28b988dbc25a407fd3a0581df5c94e6ae7bcc01ddf --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/p/perl/perl-base_5.36.0-7+deb12u4_arm64.deb /perl-base.deb

FROM scratch AS security-amd64
ADD --checksum=sha256:796fc7fe18866f5b1fb27a115d7339e549d71b7ddbc15b8d6fc4226c243e96d1 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/a/apt/apt_2.6.2_amd64.deb /apt.deb
ADD --checksum=sha256:023a7017b75295fc7037c7a4352847f9516a36a82cc5e1650d6832d238860913 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/a/apt/libapt-pkg6.0_2.6.2_amd64.deb /libapt-pkg6.0.deb
ADD --checksum=sha256:d2f7edfcc7689b9e0761c2742cc824ac86a20768bc5e8057818dc6875291fe76 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/p/pcre2/libpcre2-8-0_10.42-1+deb12u2_amd64.deb /libpcre2-8-0.deb
ADD --checksum=sha256:d7d1943aec9597629bf73075efcc5ef6dc9bda96d78e80d843156ecd448478b8 --chmod=0444 https://deb.debian.org/debian-security/pool/updates/main/p/perl/perl-base_5.36.0-7+deb12u4_amd64.deb /perl-base.deb

FROM security-${TARGETARCH} AS ocr-security

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
RUN --network=none --mount=type=bind,from=ocr-security,source=/,target=/security,readonly \
    --mount=type=bind,source=install-security-packages.py,target=/install-security-packages.py,readonly \
    LC_ALL=C python3 -I -B /install-security-packages.py \
 && dpkg-query -W > /opt/ocr-packages.txt \
 && sha256sum /opt/ocr-packages.txt > /opt/ocr-packages.sha256
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
