FROM debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN rm -f /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261106T000000Z trixie main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261106T000000Z trixie-security main' > /etc/apt/sources.list
COPY apt-transport.py /recipe/
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
COPY pins.json prepare.py build.py abi-smoke.c native-utf16-tests.patch utf16-adapter-check.c /recipe/
COPY provenance/ /recipe/provenance/
RUN --network=none python3 /recipe/build.py
FROM scratch AS artifacts
COPY --from=build /export/ /
