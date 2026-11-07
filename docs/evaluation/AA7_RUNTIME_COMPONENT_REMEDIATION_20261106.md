# AA7 runtime component remediation proposal

Read-only verification completed on exact paperfix8f7. No source/build/package operation was performed. Four hardened metadata-only containers and the exact private metadata directory were removed after durable verification; native dpkg state remained unchanged. All978 raw scanner findings remain untouched.

Native APT combined purge simulation removes exactly `dirmngr gnupg gnupg-l10n gpg-agent gpgsm mount`: all six installed, Essential=no, Protected=no, no native guard warning, no extra removal, no required-file intersection. The dependency graph includes actual supervisor imports/extensions, production/verification ELF dependencies and compiler closure. Retain gpg/gpgconf/libgpgme/Poppler. Projected inventory delta31matches(9high/6medium/16low) is not a scan result.

The initial7-package proposal including login was rejected before action: Essential=no concealed Protected=yes, and full native output warned. That failed proposal and correction are preserved. Broad Java/Perl/X11/xdg/GnuPG removals also remove required TeX/Poppler packages and are rejected; util-linux library purge fails native dependency resolution. No force/allow bypass is proposed.

Proposed Dockerfile change ONLY, before lists cleanup. It checks installed/Essential/Protected, native simulated exact removal set and warnings, performs a normal purge with autoremove off, checks retained packages/dependencies, and preserves source flags/geometry/artifact checks. Shell syntax and expected-set formatting were verified.

```diff
--- a/scripts/latex-runtime/Dockerfile
+++ b/scripts/latex-runtime/Dockerfile
@@ -25,6 +25,21 @@
       install -D -m 0644 "/build-input/fonts/$name.deb" "/var/cache/apt/archives/$archive"; \
     done; \
     apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates texlive-xetex texlive-latex-extra texlive-fonts-recommended lmodern=2.005-1 python3 poppler-utils; \
+    purge_packages='dirmngr gnupg gnupg-l10n gpg-agent gpgsm mount'; \
+    for package in $purge_packages; do \
+      [ "$(dpkg-query -W -f='${db:Status-Status} ${Essential} ${Protected}' "$package")" = 'installed no no' ] || exit 1; \
+    done; \
+    apt-get -o APT::Get::AutomaticRemove=false --simulate --assume-yes --no-install-recommends purge -- $purge_packages > /tmp/latex-purge-plan 2>&1; \
+    if grep -Eiq 'essential packages will be removed|protected packages will be removed|should not be done' /tmp/latex-purge-plan; then cat /tmp/latex-purge-plan; exit 1; fi; \
+    printf '%s\n' $purge_packages | LC_ALL=C sort > /tmp/latex-purge-expected; \
+    awk '/^(Remv|Purg) / {print $2}' /tmp/latex-purge-plan | LC_ALL=C sort -u > /tmp/latex-purge-actual; \
+    cmp /tmp/latex-purge-expected /tmp/latex-purge-actual; \
+    apt-get -o APT::Get::AutomaticRemove=false --assume-yes --no-install-recommends purge -- $purge_packages; \
+    for package in gpg gpgconf libgpgme11t64 libgpgmepp6t64 libpoppler147 poppler-utils; do \
+      [ "$(dpkg-query -W -f='${db:Status-Status}' "$package")" = installed ] || exit 1; \
+    done; \
+    apt-get check; \
+    rm -f /tmp/latex-purge-plan /tmp/latex-purge-expected /tmp/latex-purge-actual; \
     rm -f /tmp/pinned-font-uri; \
     rm -rf /var/lib/apt/lists/*
 COPY landlock.c supervisor.py inspect_pdf.py build-closure.py texmf.cnf requirements.lock /opt/latex/
```

GnuPG's seven high CVE24882 matches name tpm2daemon's PKDECRYPT/RSA/ECC handler. [Debian splits that daemon into a separate package](https://packages.debian.org/trixie/tpm2daemon). Full installed/file inventory and actual filesystem checks find no daemon or TPM/TSS package. The [official sole-program build target](https://raw.githubusercontent.com/gpg/gnupg/gnupg-2.4.7/tpm2d/Makefile.am), [handler](https://raw.githubusercontent.com/gpg/gnupg/gnupg-2.4.7/tpm2d/command.c) and [decrypt functions](https://raw.githubusercontent.com/gpg/gnupg/gnupg-2.4.7/tpm2d/tpm2.c) support a CVE-specific component-not-installed review. Raw findings remain separate; no other GnuPG finding or whole source group is cleared.

Util-linux's actual nsenter/libmount code remains installed. [Official advisories advertise same-branch2.41.6 fixes](https://github.com/util-linux/util-linux/security/advisories); the tag exists. Plan a coherent native security backport from authenticated Trixie2.41.5 source, preserving Essential/Protected/versioned dependencies, ABI and regressions. CVE78409's upstream range>=2.42 still needs exact Debian-source/patch verification before any non-applicability claim. Exact source hashes and four primary advisory links are recorded; no source archives downloaded or util patch/build performed.

[Full native outputs, function/source proof, rejected history, hashes and proposal](AA7_RUNTIME_COMPONENT_REMEDIATION_20261106.json). Root review/integration, guarded build, unchanged full runtime/PDF/profile/render/browser checks and a fresh unsuppressed scan remain required. Full security/Phase7 remains OPEN.
