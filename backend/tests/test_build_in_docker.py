"""Cluster: build the Mini App INSIDE Docker (no host npm, no dist bind-mount).

Background: deploy.sh used to `npm ci && npm run build` on the VPS and bind-mount
miniapp/dist into the Caddy container. `npm run build` atomically replaces dist
(new inodes), so the mount served stale/empty bytes until a manual
`docker compose up -d --force-recreate caddy` — and that recreate caused a brief
TLS gap. The root fix: build the Mini App inside a multi-stage Dockerfile
(Dockerfile.web: node:22-alpine build stage -> caddy:2-alpine runtime with
/srv/miniapp baked in), and drop the dist bind-mount entirely.

This module enforces that the new structure stays in place. Each test reads
the file from disk fresh; a regression that re-introduces the bind-mount or
the host npm step is caught here before it ships.

Contract points (one test per point):
  (1) Dockerfile.web is multi-stage: node build stage -> caddy runtime.
  (2) Dockerfile.web bakes the built dist into /srv/miniapp.
  (3) docker-compose.yml's web service is built from Dockerfile.web.
  (4) docker-compose.yml does NOT bind-mount miniapp/dist into any service.
  (5) docker-compose.yml keeps caddy_data/caddy_config volumes on the web tier.
  (6) docker-compose.yml keeps the web tier's 80/443 host port mapping.
  (7) deploy.sh does NOT call npm or require Node on the host.
  (8) deploy.sh does NOT use --force-recreate caddy (the workaround that
      papered over the stale-mount failure).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
DOCKERFILE = REPO / "Dockerfile"
DOCKERFILE_WEB = REPO / "Dockerfile.web"
COMPOSE = REPO / "docker-compose.yml"
DEPLOY_SH = REPO / "deploy" / "scripts" / "deploy.sh"
INSTALL_SH = REPO / "deploy" / "scripts" / "install.sh"


# All files must exist (regression).
@pytest.mark.parametrize("p", [DOCKERFILE_WEB, COMPOSE, DEPLOY_SH])
def test_files_exist(p: Path) -> None:
    assert p.exists(), f"missing: {p}"


# --- (1) Dockerfile.web: multi-stage ----------------------------------------

def test_dockerfile_web_is_multistage() -> None:
    """Dockerfile.web must be a multi-stage build: a `node:` build stage
    that produces the Mini App and a `caddy:` runtime stage that serves it.
    """
    body = DOCKERFILE_WEB.read_text(encoding="utf-8")
    # At least two `FROM ... AS` stages.
    stages = re.findall(r"^FROM\s+\S+(?:\s+AS\s+\S+)?", body, re.MULTILINE | re.IGNORECASE)
    assert len(stages) >= 2, (
        f"Dockerfile.web: expected at least 2 FROM stages (build + runtime), "
        f"got {len(stages)}: {stages!r}"
    )
    # One stage must be node (the builder) and one must be caddy (the runtime).
    assert any(re.match(r"FROM\s+node:", s, re.IGNORECASE) for s in stages), (
        f"Dockerfile.web: expected a `FROM node:` build stage, got {stages!r}"
    )
    assert any(re.match(r"FROM\s+caddy:", s, re.IGNORECASE) for s in stages), (
        f"Dockerfile.web: expected a `FROM caddy:` runtime stage, got {stages!r}"
    )


def test_dockerfile_web_runs_npm_ci_and_npm_run_build() -> None:
    """The node stage must install deps via `npm ci` (deterministic vs npm
    install) and produce the dist via `npm run build`.
    """
    body = DOCKERFILE_WEB.read_text(encoding="utf-8")
    # Strip the runtime stage to focus on the build stage. Find the second
    # `FROM` (the caddy runtime) and take everything before it.
    parts = re.split(r"^FROM\s+caddy:", body, maxsplit=1, flags=re.MULTILINE | re.IGNORECASE)
    assert len(parts) == 2, "Dockerfile.web: could not locate the caddy runtime FROM"
    build_stage = parts[0]
    assert re.search(r"\bnpm\s+ci\b", build_stage), (
        "Dockerfile.web (build stage): expected `npm ci` for deterministic install"
    )
    assert re.search(r"\bnpm\s+run\s+build\b", build_stage), (
        "Dockerfile.web (build stage): expected `npm run build` to produce dist"
    )


def test_dockerfile_web_copies_miniapp_source() -> None:
    """The build stage must COPY the miniapp package.json/lock first (so the
    layer cache survives source-only edits) and then the full miniapp/ tree.
    """
    body = DOCKERFILE_WEB.read_text(encoding="utf-8")
    parts = re.split(r"^FROM\s+caddy:", body, maxsplit=1, flags=re.MULTILINE | re.IGNORECASE)
    build_stage = parts[0]
    assert re.search(r"COPY\s+miniapp/package(?:\.json|-lock\.json)", build_stage), (
        "Dockerfile.web (build stage): expected COPY of miniapp/package*.json "
        "BEFORE the source COPY (so npm ci is layer-cache-friendly)"
    )
    assert re.search(r"COPY\s+miniapp/\s+", build_stage) or re.search(r"COPY\s+miniapp\s+\./", build_stage), (
        "Dockerfile.web (build stage): expected COPY of miniapp/ source tree"
    )


# --- (2) Dockerfile.web: bake dist into image -------------------------------

def test_dockerfile_web_bakes_dist_into_srv_miniapp() -> None:
    """The caddy runtime stage must COPY --from=<builder> ... /srv/miniapp.
    Baking the dist into the image is the whole point of this cluster: no
    host bind-mount, no stale inodes, no force-recreate.
    """
    body = DOCKERFILE_WEB.read_text(encoding="utf-8")
    # The cross-stage COPY must reference the build stage by name (AS frontend-build).
    m = re.search(
        r"COPY\s+--from=(\S+)\s+(\S+)\s+/srv/miniapp\b",
        body,
    )
    assert m, (
        "Dockerfile.web: expected `COPY --from=<builder> ... /srv/miniapp` "
        "in the caddy runtime stage (bake dist into the image)"
    )
    # The source must be the build stage's dist output (something ending in /dist).
    src = m.group(2)
    assert src.rstrip("/").endswith("/dist") or src.endswith("/dist/") or src.endswith("dist"), (
        f"Dockerfile.web: COPY --from={m.group(1)} {src} /srv/miniapp — "
        f"source should be the builder's dist directory, got {src!r}"
    )


def test_dockerfile_web_no_host_bind_mount_hint() -> None:
    """Sanity: Dockerfile.web itself must not contain a `volumes:` section
    (that would suggest the operator should bind-mount dist after all).
    """
    body = DOCKERFILE_WEB.read_text(encoding="utf-8")
    assert not re.search(r"^VOLUME\s+", body, re.MULTILINE), (
        "Dockerfile.web: should not declare VOLUME — the Mini App is baked in, "
        "not mounted"
    )


# --- (3) docker-compose.yml: web service ------------------------------------

def test_compose_has_web_service_built_from_dockerfile_web() -> None:
    """The `web` service must build from `Dockerfile.web` (not from the
    stock caddy:2-alpine image, which would mean the dist is bind-mounted
    again at runtime).
    """
    body = COMPOSE.read_text(encoding="utf-8")
    # Find the web service block (top-level `web:` key).
    # Top-level keys are at indent 2 in this compose file.
    m = re.search(r"^  web:\s*\n((?:^    .+\n?)+)", body, re.MULTILINE)
    assert m, (
        "docker-compose.yml: expected a top-level `web:` service. "
        "Did you rename/remove the old `caddy` service without adding `web`?"
    )
    web_block = m.group(1)
    # Must declare a `build:` with `dockerfile: Dockerfile.web`.
    assert re.search(r"build:\s*\n", web_block), (
        "docker-compose.yml: `web:` service must declare a build: section "
        "(not just `image: caddy:2-alpine` — that would re-introduce the "
        "bind-mount failure mode)"
    )
    assert re.search(r"dockerfile:\s*Dockerfile\.web\b", web_block), (
        "docker-compose.yml: `web:` service must build from Dockerfile.web"
    )


def test_compose_drops_old_caddy_service_with_dist_bind_mount() -> None:
    """The old `caddy:` service that bind-mounted miniapp/dist must be gone.
    A regression that re-adds the bind-mount would silently re-introduce
    the stale-dist / force-recreate / TLS-gap failure.
    """
    body = COMPOSE.read_text(encoding="utf-8")
    # No top-level `caddy:` service block.
    assert not re.search(r"^  caddy:\s*$", body, re.MULTILINE), (
        "docker-compose.yml: stale top-level `caddy:` service found. "
        "Remove it — the new `web:` service (built from Dockerfile.web) "
        "supersedes it. The old bind-mount of miniapp/dist is what caused "
        "every deploy to break."
    )
    # No bind-mount of miniapp/dist as a real directive (strip comments first
    # so a `# ...` mention in the header doesn't trip the check).
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert "miniapp/dist" not in code_lines, (
        "docker-compose.yml: `miniapp/dist` reference found in non-comment "
        "text — the bind-mount of miniapp/dist into a Caddy container is "
        "what caused the stale-content / force-recreate deploy failure. "
        "The dist is now baked into the web image by Dockerfile.web."
    )


# --- (5) docker-compose.yml: caddy_data/caddy_config volumes -----------------

def test_compose_keeps_caddy_data_and_config_volumes() -> None:
    """Let's Encrypt certs (caddy_data) and the runtime config cache
    (caddy_config) MUST persist across container rebuilds — losing them
    means a fresh cert issuance and a TLS gap. They must be declared as
    named volumes (top-level `volumes:`) and mounted on the web service.
    """
    body = COMPOSE.read_text(encoding="utf-8")
    # Top-level volumes block.
    assert re.search(r"^volumes:\s*$", body, re.MULTILINE), (
        "docker-compose.yml: top-level `volumes:` block missing — "
        "caddy_data and caddy_config must be named volumes"
    )
    for name in ("caddy_data", "caddy_config"):
        # Allow trailing whitespace / inline comments after the colon.
        # Note: `\b` after `:` doesn't work — `:` and the following space are
        # both non-word chars, so there's no word boundary there.
        assert re.search(rf"^  {name}:", body, re.MULTILINE), (
            f"docker-compose.yml: named volume `{name}:` missing from top-level volumes"
        )
    # And both must be mounted on the web service.
    m = re.search(r"^  web:\s*\n((?:^    .+\n?)+)", body, re.MULTILINE)
    assert m, "docker-compose.yml: web service block not found"
    web_block = m.group(1)
    assert re.search(r"-\s+caddy_data:/data\b", web_block), (
        "docker-compose.yml: `web:` service must mount caddy_data:/data "
        "(Let's Encrypt certs)"
    )
    assert re.search(r"-\s+caddy_config:/config\b", web_block), (
        "docker-compose.yml: `web:` service must mount caddy_config:/config "
        "(Caddy runtime config cache)"
    )


# --- (6) docker-compose.yml: 80/443 ports -----------------------------------

def test_compose_keeps_80_and_443_ports_on_web() -> None:
    """TLS lives on the web tier. The host must keep publishing 80 (ACME
    http-01) and 443 (HTTPS). Losing either means cert renewal or serving
    breaks.
    """
    body = COMPOSE.read_text(encoding="utf-8")
    m = re.search(r"^  web:\s*\n((?:^    .+\n?)+)", body, re.MULTILINE)
    assert m, "docker-compose.yml: web service block not found"
    web_block = m.group(1)
    assert re.search(r'-\s+"80:80"', web_block), (
        "docker-compose.yml: web service must publish 80:80 (ACME http-01)"
    )
    assert re.search(r'-\s+"443:443"', web_block), (
        "docker-compose.yml: web service must publish 443:443 (HTTPS)"
    )


# --- (7) deploy.sh: no host npm ---------------------------------------------

def test_deploy_sh_does_not_call_npm() -> None:
    """The whole point of this cluster is that the host no longer needs
    Node/npm — the Mini App is built inside the web image. A regression
    that re-adds `npm ci` / `npm run build` here re-introduces the
    inode-replace / stale-mount failure on the next deploy.
    """
    body = DEPLOY_SH.read_text(encoding="utf-8")
    # Strip comments so a `# we no longer call npm` note doesn't fail.
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert not re.search(r"\bnpm\s+ci\b", code_lines), (
        "deploy.sh: `npm ci` must not run on the host — the Mini App is "
        "built inside Docker (Dockerfile.web's node stage)"
    )
    assert not re.search(r"\bnpm\s+run\s+build\b", code_lines), (
        "deploy.sh: `npm run build` must not run on the host — "
        "the Mini App is built inside Docker"
    )
    assert not re.search(r"\bnpm\s+install\b", code_lines), (
        "deploy.sh: `npm install` must not run on the host — "
        "the Mini App deps are installed by the node stage of Dockerfile.web"
    )


def test_deploy_sh_does_not_pushd_into_miniapp() -> None:
    """deploy.sh must not `pushd miniapp` — there's nothing to build there
    anymore. A regression here usually pairs with a re-introduced npm call.
    """
    body = DEPLOY_SH.read_text(encoding="utf-8")
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert not re.search(r"\bpushd\s+miniapp\b", code_lines), (
        "deploy.sh: `pushd miniapp` suggests an on-host npm build — "
        "the Mini App is now built inside Docker"
    )


# --- (8) deploy.sh: no --force-recreate workaround --------------------------

def test_deploy_sh_does_not_force_recreate() -> None:
    """The old `--force-recreate caddy` was the manual workaround for the
    stale-bind-mount bug. With dist baked into the image, a plain
    `up -d` swaps the container cleanly. Re-adding `--force-recreate`
    silently re-papers-over a regression (or worse, causes a TLS gap for
    no reason).
    """
    body = DEPLOY_SH.read_text(encoding="utf-8")
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert not re.search(r"--force-recreate\b", code_lines), (
        "deploy.sh: `--force-recreate` must not be used — the stale-dist "
        "bug it was working around is gone (dist is baked into the image)"
    )


def test_deploy_sh_uses_plain_up_minus_d() -> None:
    """deploy.sh must end with a plain `docker compose up -d` (no service
    selector, no --force-recreate). That picks up new images for every
    service and recreates only the changed ones — atomic, no TLS gap.
    """
    body = DEPLOY_SH.read_text(encoding="utf-8")
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert re.search(
        r"docker\s+compose[^\n]*up\s+-d\b(?!.*\bcaddy\b)(?!.*--force-recreate)",
        code_lines,
    ), (
        "deploy.sh: expected `docker compose --env-file .env.prod up -d` "
        "(no service selector, no --force-recreate)"
    )


def test_deploy_sh_keeps_health_check() -> None:
    """The post-deploy curl /api/health check must stay — it's how the
    operator confirms the new stack is actually serving. The URL may be in a
    shell variable (HEALTH_URL) used inside a retry loop, so accept either a
    literal /api/health on the curl line OR a HEALTH_URL var that ends with it.
    """
    body = DEPLOY_SH.read_text(encoding="utf-8")
    has_curl_health = bool(
        re.search(r"curl\s+-fsS[^\n]*\/api\/health", body)
        or (
            re.search(r'HEALTH_URL="[^"]*/api/health"', body)
            and re.search(r"curl\s+-fsS[^\n]*\$HEALTH_URL", body)
        )
    )
    assert has_curl_health, "deploy.sh: post-deploy `/api/health` curl check is missing"


def test_install_sh_does_not_require_node() -> None:
    """install.sh must not install Node/npm — and must not document them as
    required. The on-VPS Mini App build is gone; only Docker is needed now.
    """
    body = INSTALL_SH.read_text(encoding="utf-8")
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    # No `apt-get install ... nodejs` etc.
    assert not re.search(r"apt-get\s+install[^\n]*\bnode(?:js)?\b", code_lines), (
        "install.sh: must not install Node — the Mini App is built inside Docker"
    )
    # No `curl ... nodejs.org` install pattern.
    assert not re.search(r"nodesource|nodejs\.org", body, re.IGNORECASE), (
        "install.sh: must not pull Node from nodesource — the Mini App "
        "is built inside Docker"
    )
