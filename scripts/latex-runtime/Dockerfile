FROM debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS snapshot
ENV DEBIAN_FRONTEND=noninteractive
RUN rm -f /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261106T000000Z trixie main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261106T000000Z trixie-security main' > /etc/apt/sources.list


# Frozen native Poppler V6 stages; only the snapshot alias avoids a name collision.
FROM debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS poppler-snapshot
ENV DEBIAN_FRONTEND=noninteractive
RUN test "$(dpkg --print-architecture)" = arm64 && rm -f /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261106T000000Z trixie main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261106T000000Z trixie-security main' > /etc/apt/sources.list
COPY native-expat/apt-transport.py /recipe/apt-transport.py
RUN printf '%s\n' '8b831a59cd8f2f89925b755973c1ef764daa2722207bfd24742114c67d31ded8  /recipe/apt-transport.py' | sha256sum -c -
FROM poppler-snapshot AS build-dependencies
COPY native-poppler/build-pins.json native-poppler/apt_transport_poppler.py native-poppler/dependency-plan.lock.json /recipe/
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 ca-certificates && python3 /recipe/apt_transport_poppler.py && apt-get -o Acquire::Retries=3 install -y --no-install-recommends build-essential debhelper dh-sequence-gir dpkg-dev cmake gir1.2-cairo-1.0-dev gir1.2-gio-2.0-dev gir1.2-gobject-2.0-dev gtk-doc-tools libboost-dev libcairo2-dev libcurl4-gnutls-dev libfontconfig-dev libfreetype-dev libgdk-pixbuf-2.0-dev libgirepository1.0-dev libglib2.0-dev libgpgme-dev libgpgmepp-dev libgtk-3-dev libjpeg-dev liblcms2-dev libnss3-dev libopenjp2-7-dev libpng-dev libtiff-dev pkgconf python3 qt6-base-dev qtbase5-dev zlib1g-dev fakeroot gpgv patch libpoppler-dev=25.03.0-5+deb13u4 libpoppler-private-dev=25.03.0-5+deb13u4 poppler-utils=25.03.0-5+deb13u4 libcairo2-doc libglib2.0-doc && rm -rf /var/lib/apt/lists/*
FROM build-dependencies AS build
COPY native-expat/prepare.py /recipe/expat_source.py
RUN printf '%s\n' '1f0e50caf5b1cb91b891a2d484feae3187746f0d5e45484f62255356747fa59a  /recipe/expat_source.py' | sha256sum -c -
ADD --chmod=0444 --checksum=sha256:6002f81f463a2d976d84b34170367cc16da2d60bd0ba9ab9d868d6e1c1a935d9 https://deb.debian.org/debian/dists/trixie/main/source/by-hash/SHA256/6002f81f463a2d976d84b34170367cc16da2d60bd0ba9ab9d868d6e1c1a935d9 /inputs/trixie-main-Sources.xz
ADD --chmod=0444 --checksum=sha256:b895e1e28568a486523f93dd5a8707ecb16767c5f134a6e23510b0597114c628 https://deb.debian.org/debian/pool/main/p/poppler/poppler_25.03.0-5+deb13u4.dsc /inputs/poppler_25.03.0-5+deb13u4.dsc
ADD --chmod=0444 --checksum=sha256:97da4ff88517a6bbd729529f195f85c8d7a0c3bb4a3d57cb0c685cbb052fe837 https://deb.debian.org/debian/pool/main/p/poppler/poppler_25.03.0.orig.tar.xz /inputs/poppler_25.03.0.orig.tar.xz
ADD --chmod=0444 --checksum=sha256:2605b5d7e6ce17a307d067048386deedfc41fdac6f75f81ad76050f517fc0de4 https://deb.debian.org/debian/pool/main/p/poppler/poppler_25.03.0-5+deb13u4.debian.tar.xz /inputs/poppler_25.03.0-5+deb13u4.debian.tar.xz
COPY --chmod=0444 native-poppler/inputs/poppler-testdata.tar.xz /inputs/poppler-testdata.tar.xz
COPY native-poppler/pins.json native-poppler/build-pins.json native-poppler/prepare_build.py native-poppler/native_geometry.py native-poppler/verify_consumer.py native-poppler/abi-smoke.cc native-poppler/disable-openjpeg-packaging.diff native-poppler/changelog-proposal.diff native-poppler/series-proposal.diff /recipe/
COPY native-poppler/build-v5.py /recipe/build.py
COPY native-poppler/verify_native_v6.py /recipe/verify_native.py
COPY native-poppler/ctest_v5.py native-poppler/ctest_v5_baseline.json /recipe/
COPY native-poppler/patches/resumide-native-geometry-v1.patch /recipe/patches/
COPY native-poppler/provenance/trixie-main.InRelease native-poppler/provenance/testdata-files.json /recipe/provenance/
RUN python3 -c 'import pathlib,stat; root=pathlib.Path("/inputs"); assert root.is_dir() and not root.is_symlink(); print("AA7_POPPLER_INPUT_MODE_BEFORE",oct(stat.S_IMODE(root.stat().st_mode)),flush=True); root.chmod(0o755); assert all(p.is_file() and not p.is_symlink() and stat.S_IMODE(p.stat().st_mode)==0o444 for p in root.iterdir())' && test -z "$(getent passwd 65532)" && test -z "$(getent group 65532)" && printf '%s\n' 'nativebuild:x:65532:65532:Native source builder:/work:/bin/sh' >> /etc/passwd && printf '%s\n' 'nativebuild:x:65532:' >> /etc/group && mkdir /work /export && chown 65532:65532 /work /export
ENV HOME=/work LANG=C.UTF-8
RUN --network=none setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/build.py
FROM poppler-snapshot AS installation
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 ca-certificates && python3 /recipe/apt-transport.py poppler-utils=25.03.0-5+deb13u4 util-linux && apt-get -o Acquire::Retries=3 install -y --no-install-recommends poppler-utils=25.03.0-5+deb13u4 util-linux
COPY native-poppler/build-pins.json native-poppler/verify_install.py native-poppler/native_geometry.py /recipe/
COPY --from=build /export/libpoppler147_*.deb /export/poppler-utils_*.deb /packages/
COPY --from=build /export/source-and-test-receipt.json /proof/
COPY --from=build /work/source/test/unittestcases/truetype.pdf /probe/truetype.pdf
RUN mkdir /scratch && chown 65532:65532 /scratch && chmod 0700 /scratch
RUN --network=none python3 -B /recipe/verify_install.py install && setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/verify_install.py probe
FROM scratch AS artifacts
COPY --from=build /export/ /
COPY --from=installation /scratch/install-verification.json /install-verification.json
COPY --from=installation /recipe/build-dependency-transport.json /installation-dependency-transport.json

FROM scratch AS native-poppler-runtime-verifier
COPY native-poppler/install-runtime.py native-poppler/build-pins.json native-poppler/ctest_v5.py native-poppler/ctest_v5_baseline.json /recipe/

FROM snapshot AS native-expat-build
COPY native-expat/apt-transport.py /recipe/
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 ca-certificates && python3 /recipe/apt-transport.py build-essential debhelper docbook-to-man docbook2x pkgconf python3 gpgv libexpat1-dev=2.9.0-1~deb13u1 fontconfig && apt-get -o Acquire::Retries=3 install -y --no-install-recommends build-essential debhelper docbook-to-man docbook2x pkgconf python3 gpgv libexpat1-dev=2.9.0-1~deb13u1 fontconfig && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 https://deb.debian.org/debian-security/dists/trixie-security/main/source/by-hash/SHA256/62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 /inputs/trixie-security-Sources.xz
ADD --checksum=sha256:be3658b5ddf20ff644276d0059bd410c6bc8ee262146df6c8eaeed79d9f59d40 https://deb.debian.org/debian/dists/sid/main/source/by-hash/SHA256/be3658b5ddf20ff644276d0059bd410c6bc8ee262146df6c8eaeed79d9f59d40 /inputs/sid-Sources.xz
ADD --checksum=sha256:09fe168e2186a2672e077d9fda02287b51fa08f73914fcc425b3307b503df8ff https://deb.debian.org/debian-security/pool/updates/main/e/expat/expat_2.9.0-1~deb13u1.dsc /inputs/expat_2.9.0-1~deb13u1.dsc
ADD --checksum=sha256:6e8ce7b52ebbaa423c59becc7cf1e6875c42e49228c062ac8123c10e700cec27 https://deb.debian.org/debian-security/pool/updates/main/e/expat/expat_2.9.0.orig.tar.gz /inputs/expat_2.9.0.orig.tar.gz
ADD --checksum=sha256:0c1575a3dc3d039f9e6751821efcdfd5246e04c6af4939defa01226d94541fba https://deb.debian.org/debian-security/pool/updates/main/e/expat/expat_2.9.0-1~deb13u1.debian.tar.xz /inputs/expat_2.9.0-1~deb13u1.debian.tar.xz
ADD --checksum=sha256:c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f https://github.com/libexpat/libexpat/releases/download/R_2_10_0/expat-2.10.0.tar.xz /inputs/expat-2.10.0.tar.xz
ADD --checksum=sha256:8c4623c101959b8709a3f0a10c06a40d413dc7a6f5ffad3bc9d0cd010d850956 https://deb.debian.org/debian/pool/main/e/expat/expat_2.10.0-1.dsc /inputs/expat_2.10.0-1.dsc
ADD --checksum=sha256:b3644a12f62d7762b62c444f69d169ba0234f13138d0240244bca64cbe35286f https://deb.debian.org/debian/pool/main/e/expat/expat_2.10.0.orig.tar.gz /inputs/expat_2.10.0.orig.tar.gz
ADD --checksum=sha256:9be65c3ff79ca0508590970422de0a55f117bb7134a0274dd1ed3261f85631dc https://deb.debian.org/debian/pool/main/e/expat/expat_2.10.0-1.debian.tar.xz /inputs/expat_2.10.0-1.debian.tar.xz
COPY native-expat/pins.json native-expat/prepare.py native-expat/build.py native-expat/abi-smoke.c native-expat/native-utf16-tests.patch native-expat/utf16-adapter-check.c /recipe/
COPY native-expat/provenance/trixie-security.InRelease native-expat/provenance/sid.InRelease /recipe/provenance/
RUN --network=none python3 /recipe/build.py

# Frozen FreeType V4 source repair; runtime keeps libfreetype6 only.
FROM debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS freetype-snapshot
ENV DEBIAN_FRONTEND=noninteractive
RUN test "$(dpkg --print-architecture)" = arm64 && rm -f /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261106T000000Z trixie main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261106T000000Z trixie-security main' > /etc/apt/sources.list
COPY native-expat/apt-transport.py /recipe/
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 ca-certificates && python3 /recipe/apt-transport.py build-essential debhelper autoconf bzip2 gettext libbrotli-dev libbz2-dev libpng-dev libtool libx11-dev pkgconf x11proto-core-dev zlib1g-dev dpkg-dev gpgv python3 libfreetype-dev=2.13.3+dfsg-1+deb13u1 lmodern=2.005-1 && apt-get -o Acquire::Retries=3 install -y --no-install-recommends build-essential debhelper autoconf bzip2 gettext libbrotli-dev libbz2-dev libpng-dev libtool libx11-dev pkgconf x11proto-core-dev zlib1g-dev dpkg-dev gpgv python3 libfreetype-dev=2.13.3+dfsg-1+deb13u1 lmodern=2.005-1 && rm -rf /var/lib/apt/lists/*
FROM freetype-snapshot AS native-freetype-build
COPY native-expat/prepare.py /recipe/expat_source.py
ADD --chmod=0444 --checksum=sha256:62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 https://deb.debian.org/debian-security/dists/trixie-security/main/source/by-hash/SHA256/62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 /inputs/trixie-security-Sources.xz
ADD --chmod=0444 --checksum=sha256:8aa6e936f4b8ce5b1ac530d3c1bc7c5c36e6432ef81385c29ce649a3ed79e8cd https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg-1+deb13u1.dsc /inputs/freetype_2.13.3+dfsg-1+deb13u1.dsc
ADD --chmod=0444 --checksum=sha256:8775e5ffded1a885ba2ccb3ea0e82c73306a03b764080c3e4c79da15b5c9a28a https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz /inputs/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz
ADD --chmod=0444 --checksum=sha256:931bfa17e59c0ec7db391160f43977e0907f36ea3c39d7e6063731cd4612dd51 https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz.asc /inputs/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz.asc
ADD --chmod=0444 --checksum=sha256:b7b66149bea769e226fd3d6d1eee6160e5b6beb4249b088071434fbe85fd1070 https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz /inputs/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz
ADD --chmod=0444 --checksum=sha256:65c66aec6244d247540430b21d3e80b677f1361906347a5be7fad371d46655da https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz.asc /inputs/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz.asc
ADD --chmod=0444 --checksum=sha256:686ec73cbf6783b245dd068a09ce807b729ac0f8a46dd70f7867923c32fdf4de https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig.tar.xz /inputs/freetype_2.13.3+dfsg.orig.tar.xz
ADD --chmod=0444 --checksum=sha256:e7a07cad1b9c803457ec310bc87132429f52171c89f9126c09eb62e203c8c84b https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg-1+deb13u1.debian.tar.xz /inputs/freetype_2.13.3+dfsg-1+deb13u1.debian.tar.xz
COPY native-freetype/prepare.py native-freetype/budget_adapter.py native-freetype/abi-fonts.c /recipe/
COPY native-freetype/pins-v3.json /recipe/pins.json
COPY native-freetype/build-v4.py /recipe/build.py
COPY native-freetype/patches/CVE-2026-95512.patch /recipe/patches/
COPY native-freetype/provenance/trixie-security.InRelease /recipe/provenance/
RUN chmod 0755 /inputs && test -z "$(getent passwd 65532)" && test -z "$(getent group 65532)" && printf '%s\n' 'nativebuild:x:65532:65532:Native source builder:/work:/bin/sh' >> /etc/passwd && printf '%s\n' 'nativebuild:x:65532:' >> /etc/group && mkdir /work /export && chown 65532:65532 /work /export
ENV HOME=/work LANG=C.UTF-8
RUN --network=none setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/build.py
FROM freetype-snapshot AS native-freetype-installation
COPY native-expat/prepare.py /recipe/expat_source.py
COPY native-freetype/verify_install.py /recipe/
COPY native-freetype/pins-v3.json /recipe/pins.json
COPY --from=native-freetype-build /export/libfreetype6_*.deb /export/libfreetype-dev_*.deb /packages/
COPY --from=native-freetype-build /export/source-and-test-receipt.json /proof/
COPY --from=native-freetype-build /export/old-header-fonts /export/original-debian-autopkgtest.sh /probe/
RUN mkdir /scratch && chown 65532:65532 /scratch && chmod 0700 /scratch
RUN --network=none python3 -B /recipe/verify_install.py install && setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/verify_install.py probe
FROM scratch AS native-freetype-artifacts
COPY --from=native-freetype-build /export/ /
COPY --from=native-freetype-installation /scratch/install-verification.json /install-verification.json
COPY --from=native-freetype-installation /scratch/original-debian-autopkgtest.log /original-debian-autopkgtest.log

FROM scratch AS native-freetype-runtime-verifier
COPY native-freetype/install-runtime-v3.py /recipe/install-runtime.py
COPY native-freetype/pins-v3.json /recipe/pins.json

FROM snapshot AS builder
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates gcc libc6-dev python3 python3-pip && rm -rf /var/lib/apt/lists/*
COPY landlock.c requirements.lock /build/
RUN gcc -O2 -Wall -Wextra -Werror /build/landlock.c -o /build/confine && python3 -m pip --isolated install --index-url https://pypi.org/simple --only-binary=:all: --require-hashes --no-deps --no-compile --no-cache-dir --target /build/vendor -r /build/requirements.lock

ADD --checksum=sha256:f78823e2d6f77708ed8adf72b5af721a46adabbc282243368063d77f2fd7ca4b https://deb.debian.org/debian/pool/main/libf/libfontenc/libfontenc1_1.1.8-1+b2_arm64.deb /build/pinned-fonts/libfontenc1.deb
ADD --checksum=sha256:56143f317d241b6dee0275aa1066df936a776810d3bb83fe58563965d9bbe3d3 https://deb.debian.org/debian/pool/main/x/xfonts-encodings/xfonts-encodings_1.0.4-2.2_all.deb /build/pinned-fonts/xfonts-encodings.deb
ADD --checksum=sha256:a87ada29e88cc85d0b51fa20c7c02101538caec81fcf3ef43aaeee54557795dd https://deb.debian.org/debian/pool/main/l/lmodern/lmodern_2.005-1_all.deb /build/pinned-fonts/lmodern.deb

FROM snapshot AS runtime
RUN --mount=type=bind,from=builder,source=/build/pinned-fonts,target=/build-input/fonts,readonly set -eu; \
    apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update; \
    apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y; \
    for artifact in 'libfontenc1=1:1.1.8-1+b2' 'xfonts-encodings=1:1.0.4-2.2' 'lmodern=2.005-1'; do \
      name=${artifact%%=*}; \
      if [ "$name" = libfontenc1 ] && [ "$(dpkg --print-architecture)" != arm64 ]; then printf '%s\n' "APT native download retained for $name on this architecture"; continue; fi; \
      apt-get --print-uris download "$artifact" > /tmp/pinned-font-uri; \
      read -r uri archive size checksum < /tmp/pinned-font-uri; \
      case "$archive" in */*) exit 1 ;; "$name"_*.deb) ;; *) exit 1 ;; esac; \
      printf '%s\n' "APT archive $artifact -> $archive ($size $checksum)"; \
      install -D -m 0644 "/build-input/fonts/$name.deb" "/var/cache/apt/archives/$archive"; \
    done; \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates texlive-xetex texlive-latex-extra texlive-fonts-recommended lmodern=2.005-1 python3 poppler-utils; \
    purge_packages='dirmngr gnupg gnupg-l10n gpg-agent gpgsm mount'; \
    for package in $purge_packages; do \
      [ "$(dpkg-query -W -f='${db:Status-Status} ${Essential} ${Protected}' "$package")" = 'installed no no' ] || exit 1; \
    done; \
    apt-get -o APT::Get::AutomaticRemove=false --simulate --assume-yes --no-install-recommends purge -- $purge_packages > /tmp/latex-purge-plan 2>&1; \
    if grep -Eiq 'essential packages will be removed|protected packages will be removed|should not be done' /tmp/latex-purge-plan; then cat /tmp/latex-purge-plan; exit 1; fi; \
    printf '%s\n' $purge_packages | LC_ALL=C sort > /tmp/latex-purge-expected; \
    awk '/^(Remv|Purg) / {print $2}' /tmp/latex-purge-plan | LC_ALL=C sort -u > /tmp/latex-purge-actual; \
    cmp /tmp/latex-purge-expected /tmp/latex-purge-actual; \
    apt-get -o APT::Get::AutomaticRemove=false --assume-yes --no-install-recommends purge -- $purge_packages; \
    for package in gpg gpgconf libgpgme11t64 libgpgmepp6t64 libpoppler147 poppler-utils; do \
      [ "$(dpkg-query -W -f='${db:Status-Status}' "$package")" = installed ] || exit 1; \
    done; \
    apt-get check; \
    rm -f /tmp/latex-purge-plan /tmp/latex-purge-expected /tmp/latex-purge-actual; \
    rm -f /tmp/pinned-font-uri
# Reuse accepted source-build AND fresh-install proof; no host-produced package input.
RUN --network=none --mount=type=bind,from=artifacts,source=/,target=/build-input/poppler,readonly --mount=type=bind,from=native-poppler-runtime-verifier,source=/recipe,target=/build-input/poppler-recipe,readonly python3 -I -B /build-input/poppler-recipe/install-runtime.py
COPY --from=native-expat-build /export/source-and-test-receipt.json /export/build-outcome.json /opt/latex/native-expat/
COPY --from=native-expat-build /recipe/pins.json /opt/latex/native-expat/pins.json
RUN --network=none --mount=type=bind,from=native-expat-build,source=/export,target=/build-input/expat,readonly python3 - <<'PYVERIFY'
import hashlib
import json
import pathlib
import subprocess
import sysconfig

metadata = pathlib.Path('/opt/latex/native-expat')
pins = json.loads((metadata / 'pins.json').read_text())
receipt = json.loads((metadata / 'source-and-test-receipt.json').read_text())
outcome = json.loads((metadata / 'build-outcome.json').read_text())
assert pins['packageVersion'] == receipt['packageVersion'] == '2.10.0-1~deb13u1+resumide1'
assert pins['upstreamVersion'] == receipt['sourceVersion'] == '2.10.0'
assert outcome['status'] == 'pass' and outcome['failure'] is None
assert all(phase.get('exitCode') == 0 for phase in outcome['phases'])
for mode in ('build', 'buildw'):
    assert receipt['upstreamCheckCounts'][mode]['checks'] == 5328
    assert receipt['upstreamCheckCounts'][mode]['failures'] == 0
    assert outcome['upstreamChecks'][mode] == receipt['upstreamCheckCounts'][mode]
packages = list(pathlib.Path('/build-input/expat').glob('libexpat1_*.deb'))
assert len(packages) == 1
package = packages[0]
package_hash = hashlib.sha256(package.read_bytes()).hexdigest()
assert receipt['builtPackages'][package.name] == package_hash
field = lambda name: subprocess.check_output(['dpkg-deb', '-f', str(package), name], text=True).strip()
assert field('Package') == 'libexpat1'
assert field('Version') == pins['packageVersion']
assert field('Architecture') == subprocess.check_output(['dpkg', '--print-architecture'], text=True).strip()
# APT's no-download path rejects local-deb filenames; this entire step has no network.
subprocess.run(['apt-get', '-o', 'Acquire::Retries=3', 'install', '-y', '--no-install-recommends', '--no-remove', str(package)], check=True)
assert subprocess.check_output(['dpkg-query', '-W', '-f=${Version}', 'libexpat1'], text=True) == pins['packageVersion']
multiarch = sysconfig.get_config_var('MULTIARCH')
assert isinstance(multiarch, str) and '/' not in multiarch and multiarch
for library in receipt['abiChecks']:
    path = pathlib.Path('/usr/lib') / multiarch / library['library']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == library['sha256']
# Debian Python links Expat at startup; retain its old mapping as diagnostics only.
import pyexpat
current_python = {'version': pyexpat.EXPAT_VERSION, 'expatMaps': [line for line in pathlib.Path('/proc/self/maps').read_text().splitlines() if '/libexpat.so.' in line]}
consumer_code = """import ctypes, hashlib, json, pathlib, pyexpat, sys, sysconfig
import xml.etree.ElementTree as E
assert pyexpat.EXPAT_VERSION == 'expat_2.10.0', pyexpat.EXPAT_VERSION
library = ctypes.CDLL('libexpat.so.1')
library.XML_ExpatVersion.restype = ctypes.c_char_p
library.XML_ExpatVersion.argtypes = []
native_version = library.XML_ExpatVersion().decode()
assert native_version == 'expat_2.10.0', native_version
assert E.fromstring('<fontconfig><dir>neutral &amp; safe</dir></fontconfig>')[0].text == 'neutral & safe'
expat_maps = [line for line in pathlib.Path('/proc/self/maps').read_text().splitlines() if '/libexpat.so.' in line]
assert expat_maps and not any('(deleted)' in line for line in expat_maps)
installed = (pathlib.Path('/usr/lib') / sysconfig.get_config_var('MULTIARCH') / 'libexpat.so.1').resolve()
assert {pathlib.Path(line.split()[-1]).resolve() for line in expat_maps} == {installed}
source_receipt = json.loads(pathlib.Path('/opt/latex/native-expat/source-and-test-receipt.json').read_text())
expected = next(item['sha256'] for item in source_receipt['abiChecks'] if item['library'] == 'libexpat.so.1')
installed_hash = hashlib.sha256(installed.read_bytes()).hexdigest()
assert installed_hash == expected
print(json.dumps({'pyexpatVersion': pyexpat.EXPAT_VERSION, 'ctypesVersion': native_version, 'pyexpatOrigin': pyexpat.__spec__.origin, 'pythonExecutable': sys.executable, 'mappedLibrary': str(installed), 'mappedLibrarySha256': installed_hash, 'expatMaps': expat_maps, 'elementTreeNeutralParse': True}, sort_keys=True))
"""
fresh_python = json.loads(subprocess.check_output(['/usr/bin/python3', '-I', '-B', '-c', consumer_code], text=True))
metadata_hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in metadata.iterdir() if p.is_file()}
(metadata / 'installed-package.json').write_text(json.dumps({'package': 'libexpat1', 'version': pins['packageVersion'], 'packageSha256': package_hash, 'metadataSha256': metadata_hashes, 'buildInterpreterDiagnostic': current_python, 'freshPythonConsumer': fresh_python}, indent=2) + '\n')
subprocess.run(['apt-get', 'check'], check=True)
PYVERIFY
RUN --network=none --mount=type=bind,from=native-freetype-artifacts,source=/,target=/build-input/freetype,readonly --mount=type=bind,from=native-freetype-runtime-verifier,source=/recipe,target=/build-input/freetype-recipe,readonly python3 -I -B /build-input/freetype-recipe/install-runtime.py
RUN rm -rf /var/lib/apt/lists/*
COPY landlock.c supervisor.py inspect_pdf.py build-closure.py build-fontconfig.py texmf.cnf requirements.lock /opt/latex/
COPY native_geometry.py /opt/latex/native_geometry.py
COPY --from=builder /build/confine /opt/latex/confine
COPY --from=builder /build/vendor/ /opt/latex/
RUN test ! -e /opt/latex/home && install -d -o 0 -g 0 -m 0555 /opt/latex/home && python3 /opt/latex/build-closure.py && dpkg-query -W -f='${Package}=${Version}\n' > /opt/latex/packages.lock && chmod -R a-w /opt/latex && mkdir /scratch && chown 65532:65532 /scratch
USER 65532:65532
WORKDIR /scratch
ENV HOME=/opt/latex/home LANG=C.UTF-8
ENTRYPOINT ["/usr/bin/python3", "-I", "/opt/latex/supervisor.py"]
