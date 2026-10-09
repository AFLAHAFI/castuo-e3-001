# e3bundle CLI as a container image: verify evidence bundles without installing Python.
# Usage: docker run --rm -v "$PWD:/data" ghcr.io/traky12/e3bundle:<version> verify <bundle> ...

# --- build: produce the wheel from this source tree -------------------------
FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS build
WORKDIR /src
COPY pyproject.toml README.md LICENSE ./
COPY scripts/ ./scripts/
RUN python -m pip install --no-cache-dir --disable-pip-version-check --upgrade pip \
 && python -m pip wheel --no-cache-dir --disable-pip-version-check --wheel-dir /wheels .

# --- runtime: only the installed tool, non-root, no network needed -----------
FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="e3bundle" \
      org.opencontainers.image.description="Verify evidence bundles offline: SHA-256 manifests and Ed25519 signatures." \
      org.opencontainers.image.source="https://github.com/Traky12/castuo-e3-001" \
      org.opencontainers.image.url="https://traky12.github.io/castuo-e3-001/" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY --from=build /wheels /wheels
RUN python -m pip install --no-cache-dir --disable-pip-version-check /wheels/*.whl \
 && rm -rf /wheels \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin e3
USER 10001
WORKDIR /data
ENTRYPOINT ["e3bundle"]
CMD ["--help"]
