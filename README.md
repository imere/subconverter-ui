# Subconverter WebUI

[![CI](https://github.com/imere/subconverter-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/imere/subconverter-ui/actions/workflows/ci.yml)
[![Release](https://github.com/imere/subconverter-ui/actions/workflows/release.yml/badge.svg)](https://github.com/imere/subconverter-ui/actions/releases)

A engineering-grade, test-driven WebUI for [`tindy2013/subconverter`](https://github.com/tindy2013/subconverter).
It builds subscription-conversion requests and proxies them to a subconverter engine through a
single-origin nginx entry point, so the browser never hits a CORS wall.

> Scope (Tier A): conversion panel + result preview / copy / download + engine `/version` status.
> The nginx proxy already exposes `/getruleset`, `/getprofile`, `/render`, `/refreshrules`, so the
> config-management tiers (B / C) can be layered on later without touching the container topology.

---

## Architecture

```
                :8080 (host)
   ┌────────────────────────────────────────────┐
   │  nginx  (webui container)                   │
   │   ├─ /            → SPA (static)            │
   │   ├─ /sub         ┐                         │
   │   ├─ /version     ├─ proxy ───────────────┐ │
   │   ├─ /getruleset  ┘                       ▼ │
   │   └─ /getprofile, /render, /refreshrules   │
   └────────────────────────────────────────────┘
                                                   │  internal network (sc-net)
                                                   ▼
                                      ┌──────────────────────────┐
                                      │  subconverter:25500      │
                                      │  (official image,        │
                                      │   not exposed to host)   │
                                      │  /base/{config,rules,    │
                                      │         logs}←volume     │
                                      └──────────────────────────┘
```

**Why a single nginx entry point?** subconverter does not emit CORS headers, so a browser calling
it directly is blocked. By serving the SPA and reverse-proxying the API on the same origin, CORS
disappears and there is no backend to maintain.

---

## Tech stack

| Layer        | Choice                                                      |
|--------------|-------------------------------------------------------------|
| Runtime      | Node 24 LTS                                                 |
| Language     | TypeScript (strict) — pinned to `^6` (see note below)       |
| UI           | React 19 + Vite 8                                           |
| Tests        | Vitest 5 + Testing Library + jsdom (TDD: red → green)       |
| Lint         | ESLint 10 (flat config)                                     |
| Format       | **Prettier 3, integrated into ESLint** (no `.prettierignore`) |
| Git hooks    | husky 9 + lint-staged 17 (pre-commit) + commitlint 19 (commit-msg) |
| Runtime img  | `nginx:1.27-alpine` (SPA host + reverse proxy)              |

> **TypeScript version note:** `typescript-eslint@8` (currently latest) only supports
> `typescript >=4.8.4 <6.1.0`, so TypeScript is pinned to `^6` even though `7.x` exists.
> This is an ecosystem timing constraint, not a misconfiguration; everything else is on its latest.

---

## Project structure

```
subconverter-ui/
├── docker/
│   ├── ex/                     # example orchestration + build assets
│   │   ├── Dockerfile          # multi-stage: pnpm build → nginx:alpine
│   │   ├── nginx.conf          # SPA + reverse proxy to subconverter
│   │   ├── compose.yml         # two services: subconverter + webui
│   │   ├── .subconverter.env   # TZ / API_MODE / token for the engine
│   │   ├── pull.sh  start.sh  down.sh  roll.sh  upgrade.sh
│   │   └── ...
│   └── vol/                    # persisted volumes (relative paths in compose)
│       └── subconverter/base/{config,rules,logs}/   # → /base/* in container
├── src/
│   ├── api/subconverter.ts          # fetch client (convert / getVersion)
│   ├── utils/buildSubUrl.ts         # /sub query-string builder
│   ├── hooks/useConversion.ts       # idle→loading→success|error state machine
│   ├── components/                  # ConversionForm, ResultViewer
│   ├── types/index.ts               # shared domain types
│   └── test/setup.ts                # jest-dom matchers
├── .github/workflows/ci.yml         # test + lint + build + image build
├── .github/workflows/release.yml     # tag → GHCR image + GitHub release
├── .github/dependabot.yml            # automated dependency updates
├── .commitlintrc.json               # conventional-commit policy
├── .husky/                          # pre-commit (lint-staged) + commit-msg (commitlint)
├── .nvmrc                           # pins Node 24 for contributors
└── docs/implementation-plan.md      # the agreed implementation plan
```

Tests live next to the code they cover (`*.test.ts(x)`).

---

## Getting started (local dev)

Prerequisites: **Node 24**, **pnpm 10** (latest).

```bash
pnpm install        # install dependencies (lockfile is committed)
pnpm dev            # start Vite dev server (http://localhost:5173)
pnpm test           # watch mode
pnpm test:run       # single run (CI)
pnpm test:cov       # coverage (v8)
pnpm lint           # ESLint (Prettier enforced as a rule)
pnpm lint:fix       # auto-fix
pnpm build          # tsc --noEmit + vite production build → build/
```

The dev server targets `/sub` and `/version` at the same origin; for a real engine you would
point them at a running subconverter (e.g. via a Vite dev proxy or by running the stack below).

### TDD workflow

This project was built red → green:

1. Write the test (e.g. `src/utils/buildSubUrl.test.ts`).
2. Run it — it fails (module missing / behavior absent).
3. Implement the minimum in `buildSubUrl.ts` to make it pass.
4. `pnpm test:run` + `pnpm lint` stay green.

Husky's pre-commit hook runs `lint-staged`, which runs `eslint --fix` on staged files, so
formatting and linting are enforced before every commit. The `commit-msg` hook runs `commitlint`
against the [Conventional Commits](https://www.conventionalcommits.org/) spec, so history stays
machine-readable (and release notes can be auto-generated).

---

## Docker / Podman deployment

All orchestration assets live in `docker/ex/`. The compose file defines two services on a private
`sc-net` network; only the `webui` service is published to the host on **port 8080**.

```bash
cd docker/ex

# first time / after config changes to the engine
./pull.sh          # pull subconverter + build webui images
./start.sh         # up -d  → http://localhost:8080

# everyday
./down.sh          # stop & remove containers (volumes preserved)
./roll.sh          # rebuild & restart only the webui (front-end rollout)
./upgrade.sh       # upgrade subconverter image + rebuild webui, recreate both
```

### Volumes

`docker/vol/subconverter/base/{config,rules,logs}` are mounted into the engine container at
`/base/{config,rules,logs}` so pref.yml, rulesets and logs persist across restarts. They are
git-ignored except for the `.gitkeep` placeholders.

### Environment

`docker/ex/.subconverter.env` is passed to the engine container. Set `SUBCONVERTER_TOKEN` before
exposing the stack, and consider a Basic-Auth layer in front of the management endpoints
(`/getprofile`, `/refreshrules`, …) if you later implement the config-management tiers.

> **Note on tooling:** the scripts use `podman compose`. On a Docker host, replace
> `podman compose` with `docker compose` in the scripts (the compose file is compatible).

---

## CI / CD

**CI** (`.github/workflows/ci.yml`) runs on every push / PR to `main`, across a matrix of
`ubuntu-latest`, `macos-latest` and `windows-latest` (`fail-fast: false`, so one platform's
failure never hides the others): `pnpm install --frozen-lockfile` → `pnpm lint` →
`pnpm test:cov` → `pnpm build` → `docker build` of the webui image (validates the `Dockerfile`).
Coverage and build output are uploaded once, from the Linux job — the artifacts are identical
on every platform.

**Release** (`.github/workflows/release.yml`) publishes to GitHub Container Registry on two
channels:

| Trigger | Image tags | Architectures |
| --- | --- | --- |
| push to `main` | `ghcr.io/imere/subconverter-ui:alpha` | `linux/amd64` (fast feedback) |
| push tag `v*` | `:<version>`, `:<major>.<minor>`, `:latest` | `linux/amd64`, `linux/arm64` |

Tagged releases additionally open a GitHub Release with auto-generated notes.

```bash
git tag v0.0.1
git push origin v0.0.1      # → builds & publishes the image, creates the release
```

**Dependency updates** — Dependabot (`.github/dependabot.yml`) opens weekly PRs for npm (pnpm),
GitHub Actions, and the Docker base image, grouped so they don't spam.

---

## Secret hygiene

Four layers, strongest first:

1. **GitHub Push Protection** — in *Settings → Code security*, enable **Secret
   scanning** and **Push protection**. This is the only layer that still stops a
   leaked token when local hooks are bypassed (`--no-verify`), because the check
   happens on GitHub's side. Enable it manually; it cannot be set from a file.
2. **Least-privilege credentials** — fine-grained PATs with the smallest scope and
   a short expiry. CI authenticates with the built-in `GITHUB_TOKEN`, never a
   personal token.
3. **Pre-commit hook** — `scripts/secret-scan.mjs` refuses a commit containing
   anything credential-shaped (GitHub PATs, AWS keys, Slack/npm tokens, private
   keys, `token = "..."` assignments). Zero dependencies: plain node, so it runs
   identically on every machine.
4. **CI** — the same scanner runs on every push/PR (`pnpm secret:scan`) as a
   backstop.

Suppress a genuine false positive by appending `secret-scan:ignore` to that line;
run it manually with `pnpm secret:scan`.

> If a token ever reaches a remote, **revoke/rotate it first** — deleting the
> commit does not un-leak it — then purge it from history with `git filter-repo`.

---

## License

MIT (or align with the subconverter project as appropriate).
