FROM debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS snapshot
ENV DEBIAN_FRONTEND=noninteractive
RUN test "$(dpkg --print-architecture)" = arm64 && rm -f /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261106T000000Z trixie main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261106T000000Z trixie-security main' > /etc/apt/sources.list
COPY native-expat/apt-transport.py /recipe/
RUN apt-get -o Acquire::Retries=3 -o APT::Update::Error-Mode=any -o Acquire::Check-Valid-Until=false update && apt-get -o Acquire::Retries=3 --with-new-pkgs --no-remove upgrade -y && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 ca-certificates && python3 /recipe/apt-transport.py build-essential debhelper autoconf bzip2 gettext libbrotli-dev libbz2-dev libpng-dev libtool libx11-dev pkgconf x11proto-core-dev zlib1g-dev dpkg-dev gpgv python3 libfreetype-dev=2.13.3+dfsg-1+deb13u1 lmodern=2.005-1 && apt-get -o Acquire::Retries=3 install -y --no-install-recommends build-essential debhelper autoconf bzip2 gettext libbrotli-dev libbz2-dev libpng-dev libtool libx11-dev pkgconf x11proto-core-dev zlib1g-dev dpkg-dev gpgv python3 libfreetype-dev=2.13.3+dfsg-1+deb13u1 lmodern=2.005-1 && rm -rf /var/lib/apt/lists/*
FROM snapshot AS build
COPY native-expat/prepare.py /recipe/expat_source.py
ADD --chmod=0444 --checksum=sha256:62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 https://deb.debian.org/debian-security/dists/trixie-security/main/source/by-hash/SHA256/62af0f5a1b39263679a788880b48449332ac684c543506a1f35254b8e042b5a4 /inputs/trixie-security-Sources.xz
ADD --chmod=0444 --checksum=sha256:8aa6e936f4b8ce5b1ac530d3c1bc7c5c36e6432ef81385c29ce649a3ed79e8cd https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg-1+deb13u1.dsc /inputs/freetype_2.13.3+dfsg-1+deb13u1.dsc
ADD --chmod=0444 --checksum=sha256:8775e5ffded1a885ba2ccb3ea0e82c73306a03b764080c3e4c79da15b5c9a28a https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz /inputs/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz
ADD --chmod=0444 --checksum=sha256:931bfa17e59c0ec7db391160f43977e0907f36ea3c39d7e6063731cd4612dd51 https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz.asc /inputs/freetype_2.13.3+dfsg.orig-ft2demos.tar.xz.asc
ADD --chmod=0444 --checksum=sha256:b7b66149bea769e226fd3d6d1eee6160e5b6beb4249b088071434fbe85fd1070 https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz /inputs/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz
ADD --chmod=0444 --checksum=sha256:65c66aec6244d247540430b21d3e80b677f1361906347a5be7fad371d46655da https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz.asc /inputs/freetype_2.13.3+dfsg.orig-ft2docs.tar.xz.asc
ADD --chmod=0444 --checksum=sha256:686ec73cbf6783b245dd068a09ce807b729ac0f8a46dd70f7867923c32fdf4de https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg.orig.tar.xz /inputs/freetype_2.13.3+dfsg.orig.tar.xz
ADD --chmod=0444 --checksum=sha256:e7a07cad1b9c803457ec310bc87132429f52171c89f9126c09eb62e203c8c84b https://deb.debian.org/debian-security/pool/updates/main/f/freetype/freetype_2.13.3+dfsg-1+deb13u1.debian.tar.xz /inputs/freetype_2.13.3+dfsg-1+deb13u1.debian.tar.xz
COPY native-freetype/pins.json native-freetype/prepare.py native-freetype/build.py native-freetype/budget_adapter.py native-freetype/abi-fonts.c /recipe/
COPY native-freetype/patches/CVE-2026-95512.patch /recipe/patches/
COPY native-freetype/provenance/trixie-security.InRelease /recipe/provenance/
RUN chmod 0755 /inputs && test -z "$(getent passwd 65532)" && test -z "$(getent group 65532)" && printf '%s\n' 'nativebuild:x:65532:65532:Native source builder:/work:/bin/sh' >> /etc/passwd && printf '%s\n' 'nativebuild:x:65532:' >> /etc/group && mkdir /work /export && chown 65532:65532 /work /export
ENV HOME=/work LANG=C.UTF-8
RUN --network=none setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/build.py
FROM snapshot AS installation
COPY native-expat/prepare.py /recipe/expat_source.py
COPY native-freetype/pins.json native-freetype/verify_install.py /recipe/
COPY --from=build /export/libfreetype6_*.deb /export/libfreetype-dev_*.deb /packages/
COPY --from=build /export/source-and-test-receipt.json /proof/
COPY --from=build /export/old-header-fonts /export/original-debian-autopkgtest.sh /probe/
RUN mkdir /scratch && chown 65532:65532 /scratch && chmod 0700 /scratch
RUN --network=none python3 -B /recipe/verify_install.py install && setpriv --no-new-privs --bounding-set=-all --reuid=65532 --regid=65532 --clear-groups -- /usr/bin/python3 -B /recipe/verify_install.py probe
FROM scratch AS artifacts
COPY --from=build /export/ /
COPY --from=installation /scratch/install-verification.json /install-verification.json
COPY --from=installation /scratch/original-debian-autopkgtest.log /original-debian-autopkgtest.log
