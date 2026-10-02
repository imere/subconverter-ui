# Subconverter WebUI

[![CI](https://github.com/imere/subconverter-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/imere/subconverter-ui/actions/workflows/ci.yml)
[![Release](https://github.com/imere/subconverter-ui/actions/workflows/release.yml/badge.svg)](https://github.com/imere/subconverter-ui/actions/releases)

`subconverter-ui` 是 [`tindy2013/subconverter`](https://github.com/tindy2013/subconverter) 的前端管理界面
（React 19 + Vite + TypeScript），本身不含转换引擎。

浏览器只访问一个同源入口（nginx），由它反代 `/sub`、`/version` 等路径到内网里的 subconverter 容器。
这样绕开 CORS，且不需要维护后端服务。

当前功能范围是转换面板 + 结果预览/复制/下载 + `/version` 引擎状态。nginx 已反代
`/getruleset`、`/getprofile`、`/render`、`/refreshrules`，后续加配置管理功能时不用改容器拓扑。

## 前置要求

| 项 | 要求 | 依据 |
|---|---|---|
| Node | `>=24`（`.nvmrc` 固定为 24） | `package.json` `engines`、`.nvmrc` |
| 包管理器 | pnpm，锁文件 `pnpm-lock.yaml`；CI 固定 pnpm 12 | `.github/workflows/ci.yml` |
| 容器部署 | Docker + Compose v2 插件（`docker compose`，带空格） | `docker/ex/*.sh` |

`pnpm-workspace.yaml` 必须与锁文件一起提交：它承载 `overrides` 与 `minimumReleaseAge`，
缺失时 `pnpm install --frozen-lockfile` 会以 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` 失败。

## 本地开发常用命令

```bash
pnpm install          # 依赖安装（锁文件已提交）
pnpm dev              # Vite 开发服务器，http://localhost:5173
pnpm test             # watch 模式
pnpm test:run         # 单次运行
pnpm test:cov         # 覆盖率（v8 provider，输出到 build/coverage）
pnpm lint             # ESLint（含 Prettier 规则）
pnpm lint:fix         # 自动修复
pnpm build            # tsc --noEmit && vite build，产物在 build/
pnpm preview          # 预览构建产物
pnpm secret:scan      # 手动跑零依赖密钥扫描（见「安全闸门」）
```

开发服务器已配好代理：`/sub`、`/version`、`/getruleset`、`/getprofile`、`/render`、`/refreshrules`
会转发到本机的 subconverter（`vite.config.ts`，默认端口 25500）。想对着真实引擎开发，
先按下面「容器部署」把栈跑起来。

**Prettier 没有独立配置**：选项写在 `eslint.config.js` 的 `prettier/prettier` 规则里。
格式问题一律用 `pnpm lint:fix` 修，不要新建 `.prettierrc` 一类文件。

## 目录结构

```
subconverter-ui/
├── docker/
│   ├── ex/                     # 部署资产
│   │   ├── Dockerfile          # 多阶段：node:24-alpine 构建 → nginx:1.31-alpine
│   │   ├── nginx.conf          # SPA 托管 + 反代到 subconverter
│   │   ├── compose.yml         # 双服务：subconverter + webui
│   │   ├── .subconverter.env   # 引擎的 TZ / API_MODE / SUBCONVERTER_TOKEN
│   │   └── pull.sh start.sh down.sh roll.sh upgrade.sh
│   └── vol/                    # 持久化数据（git-ignored，由 start.sh 创建）
├── src/
│   ├── api/subconverter.ts     # 引擎客户端
│   ├── utils/buildSubUrl.ts    # /sub 查询串拼装
│   ├── hooks/useConversion.ts  # idle→loading→success|error 状态机
│   ├── components/             # ConversionForm、ResultViewer
│   ├── types/index.ts
│   └── test/setup.ts
├── scripts/secret-scan.js      # 零依赖密钥扫描（gitleaks 的兜底）
├── .gitleaks.toml              # gitleaks 规则：默认集 + URI/JDBC/internal-token 补充规则
├── .husky/                     # pre-commit、pre-push、commit-msg
├── .github/workflows/          # ci.yml、release.yml
├── .github/dependabot.yml      # 依赖更新
├── .commitlintrc.json          # Conventional Commits
├── pnpm-workspace.yaml         # overrides，随锁文件一起提交
├── eslint.config.js            # ESLint 10 flat config，内含 Prettier 选项
└── docs/implementation-plan.md # 设计与决策依据
```

测试与被测代码同文件相邻（`*.test.ts` / `*.test.tsx`），由 `vitest.config.ts` 收集。

## 容器部署

编排资产都在 `docker/ex/`。compose 定义两个服务、共用 `sc-net` bridge 网络，
只有 `webui` 把端口发布到宿主机 **8080**；subconverter 不对宿主机暴露。

```bash
cd docker/ex

./pull.sh          # 拉取镜像，不启动
./start.sh         # 创建缺失的卷目录后 up -d → http://localhost:8080
./down.sh          # 停止并移除容器（卷保留）
./roll.sh          # 只重建并重启 webui（纯前端迭代）
./upgrade.sh       # 拉新引擎镜像 + 重建 webui，重建两个服务
```

- **卷**：`docker/vol/subconverter/base/{config,rules,logs}` 以相对路径挂到引擎容器的
  `/base/{config,rules,logs}`。整个 `docker/vol/subconverter/` 被 git 忽略，属于本机运行时数据。
  `start.sh` 会在缺失时创建这三个目录，否则 compose 会以 root 身份创建。
- **环境**：`docker/ex/.subconverter.env` 传给引擎容器。仓库里 `SUBCONVERTER_TOKEN` 留空，
  对外暴露前必须设成强值——它是 `/readconf`、`/updateconf`、`/flushcache` 的访问凭据。
  管理类接口（`/getprofile`、`/refreshrules` 等）若要启用，还需在前面加一层 Basic Auth。
- 启动后可这样验：`curl -fsS http://localhost:8080/version`（经 nginx 到引擎）、
  `curl -fsS http://localhost:8080/`（SPA 首页）。

## 安全闸门

两道扫描器同时在用：**gitleaks**（150+ 规则，主力）和 **`scripts/secret-scan.js`**
（零依赖兜底，机器上没有 gitleaks 时接上）。三道闸门各自拦的东西不同：

| 闸门 | 触发时机 | 扫描范围 | 绕过方式 |
|---|---|---|---|
| pre-commit | `git commit` | `gitleaks protect --staged`；无 gitleaks 时扫 `git diff --cached` 的新增行 | `git commit --no-verify` |
| pre-push | `git push` | 将要推送、尚未在任何远端的提交（`HEAD --not --remotes`） | `git push --no-verify` |
| CI | push / PR 到 `main` | 完整历史（`fetch-depth: 0`）+ gitleaks，再跑一次 `pnpm secret:scan` | 无法绕过，但提交已经存在 |

**本地两道钩子都可以用 `--no-verify` 跳过**，这是事实，不要把它们当强制关卡。CI 是兜底，
且它跑在提交产生之后——真泄了必须先吊销/轮换凭据，删提交不解决问题。
本仓库已公开，服务端 push protection 可在 Settings → Code security and analysis 免费开启；
**在它开启之前**，本地两道钩子仍是唯一能把凭据挡在历史之外的环节。开启后它才是唯一绕不过的一层。

误报处理：两套扫描器都认 `secret-scan:ignore` 追加到行尾；gitleaks 还支持行尾 `#gitleaks:allow`
或把 fingerprint 写进 `.gitleaksignore`。锁文件和 `.gitleaks.toml` 自身已在两边的忽略列表里。

## 贡献与提交规范

- 提交信息走 [Conventional Commits](https://www.conventionalcommits.org/)，由 commitlint 在
  `commit-msg` 钩子校验（`.commitlintrc.json` 继承 `@commitlint/config-conventional`）。
- pre-commit 先跑 lint-staged，对暂存文件执行 `eslint --fix`，再过密钥闸门。
- 功能按 TDD 推进：先写测试，再写实现，`pnpm test:run` 与 `pnpm lint` 保持绿。
- 依赖升级由 Dependabot 每周一提 PR（npm / GitHub Actions / `docker/ex` 镜像）。
  其中 `typescript` 7.x 被显式忽略：TS 7 不带 compiler API，typescript-eslint 目前跑不了，
  升上去会让 `pnpm lint` 直接失败。解除条件见 `.github/dependabot.yml` 注释。

**License：待确认。** 仓库根目录没有 `LICENSE` 文件，`package.json` 也没有 `license` 字段。

### CI 做了什么

`ci.yml` 在 `ubuntu-latest` / `macos-latest` / `windows-latest` 上跑
（`fail-fast: false`）：装依赖（`HUSKY=0` 跳过钩子安装）→ 密钥扫描（仅 Linux）→
`pnpm lint` → `pnpm test:cov` → `pnpm build`；覆盖率与构建产物只在 Linux job 上传一次。
另有一个 `image` job 单独 `docker build` 校验 `Dockerfile`。

顺序上有个约束：覆盖率上传必须在 `pnpm build` 之前——两者产物都落在 `build/`，
而 vite 的 `emptyOutDir` 会把目录清空。

### 发布

`release.yml` 有两个通道：

| 触发 | 镜像 tag | 架构 |
|---|---|---|
| push 到 `main` | `:alpha` | `linux/amd64` |
| push tag `v*` | `:<version>`、`:<major>.<minor>`、`:latest` | `linux/amd64`、`linux/arm64` |

打 tag 还会生成 GitHub Release（自动 notes），并附上 `README.md`、`docker/ex/compose.yml`、
`docker/ex/Dockerfile`、`docker/ex/nginx.conf`。分支构建可以被新提交取消，tag 构建不会。
