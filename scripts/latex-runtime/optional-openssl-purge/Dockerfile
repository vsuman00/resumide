# The build operator must bind the local base reference to the reviewed image ID.
ARG LOCAL_PDF_BASE=resumide-latex@sha256:115d58407c3951915925597e3722a5077ceef840f41b7c0c59a0f47910657d02
FROM ${LOCAL_PDF_BASE} AS purged
USER 0:0
RUN --network=none --mount=type=bind,source=purge.py,target=/build-input/purge.py,readonly \
    /usr/bin/python3 -I -B /build-input/purge.py

FROM scratch
COPY --from=purged / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    DEBIAN_FRONTEND=noninteractive HOME=/opt/latex/home LANG=C.UTF-8
USER 65532:65532
WORKDIR /scratch
ENTRYPOINT ["/usr/bin/python3", "-I", "/opt/latex/supervisor.py"]
