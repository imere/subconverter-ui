# subconverter WebUI — 工程级实施方案（TDD · Vitest+Vite+React · Docker Compose）

> 状态：方案已确认，待开工（先出方案，确认后进入实现）
> 目标：以 TDD 方式从零构建一个面向 `tindy2013/subconverter` 的 WebUI，工程化与容器化达到可交付标准。

---

## 0. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 功能范围 | **Tier A 转换 UI**（转换面板 + 结果预览/复制/下载 + /version 状态）。Tier B 配置管理、Tier C 管理后台列为后续阶段。 |
| 前端架构 | 纯前端 SPA（React+TS）+ nginx 反代，**前端与 converter 同一端口**（宿主机 `8080`，内部反代到 `subconverter:25500`）。无后端服务。 |
| 后端来源 | 同 compose 内含官方镜像 `tindy2013/subconverter:latest`，`vol` 挂载 `/base/{config,rules,logs}`。 |
| 容器拓扑 | compose 双服务：`subconverter`（内部网络，不暴露宿主机）+ `webui`（nginx 单端口 8080 入口）。 |
| 工程化 | ESLint ≥10 flat + Prettier 最新版 集成进 ESLint（仅 ESLint 校验/修复，无独立 `.prettierignore`）；husky 最新 + lint-staged 最新 门禁；Vitest 最新 + Testing Library TDD。 |
| 依赖策略 | 全部依赖锁定到安装时最新版（ESLint 10+、Prettier、Vite、Vitest、React 19、TypeScript 等均以 `@latest` 安装）。 |
| 仓库 | 远端 `git@github.com:imere/subconverter-ui.git`，项目名 `subconverter-ui`。 |

---

## 1. 项目边界与定位

WebUI 是一套**前端应用**，通过 HTTP 调用 subconverter 的 REST API 完成订阅转换。它本身**不包含**转换引擎（引擎由官方镜像提供）。

**本期（Tier A）范围**：
- 转换面板：表单构造 `/sub?target=&url=&config=&...`，提交后展示/格式化/复制/下载结果。
- 后端状态：调用 `/version` 显示引擎版本与就绪状态。

**后续阶段（不在本期）**：Tier B 配置管理（pref/profile/ruleset 浏览编辑，需 token）、Tier C 完整管理后台（token 管理、规则刷新、日志查看等）。本期 nginx 已预留 `/getruleset`、`/getprofile` 反代通道，便于后续平滑扩展。

**关键技术约束**：subconverter 不返回 CORS 头，浏览器无法跨域直连。因此生产部署必须经由同域 nginx 反代 `/sub`、`/version` 等路径到 subconverter 容器。

---

## 2. 已核实的 subconverter 工程事实（影响 docker/vol 对齐）

| 项 | 值 | 来源 |
|---|---|---|
| 容器内工作目录 | `/base` | 官方 Dockerfile / DeepWiki |
| 监听端口 | `25500/tcp` | 官方 Dockerfile |
| 配置目录 | `/base/config` | DeepWiki 部署文档 |
| 规则目录 | `/base/rules` | DeepWiki 部署文档 |
| 日志目录 | `/base/logs` | DeepWiki 部署文档 |
| 整目录覆盖 | `-v /host/base:/base` | README-docker.md |
| 配置读取顺序 | `pref.toml` → `pref.yml` → `pref.ini` | 源码 |
| 官方镜像 | `tindy2013/subconverter:latest` | README-docker.md |

**结论**：`docker/vol/subconverter/base/{config,rules,logs}` 分别对应容器内 `/base/{config,rules,logs}`，实现"宿主机相对路径 == 容器内真实路径"的对齐要求。

---

## 3. 工程化技术栈（全部依赖锁定到安装时最新版）

| 类别 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node 24 LTS | 最新 LTS，与 Docker 基础镜像一致 |
| 语言 | TypeScript 最新（strict） | 工程级标配 |
| UI | React 19 + Vite 最新 | 模板 `react-ts` |
| 测试 | Vitest 最新 + @testing-library/react + @testing-library/jest-dom + jsdom | TDD 核心 |
| Lint | ESLint ≥10（flat config）+ typescript-eslint + react/react-hooks/jsx-a11y（全部最新版） | |
| 格式化 | **Prettier 最新版 集成进 ESLint**（见 §4） | 用户硬性要求 |
| 钩子 | husky 最新 + lint-staged 最新 | pre-commit 门禁 |
| 容器 | 多阶段 Dockerfile（node 构建 → nginx:alpine 托管） | |
| 编排 | docker compose（本机用 podman 验证） | |

> 全部依赖以 `@latest` 安装（含 ESLint 10+、Prettier、Vite、Vitest、React 19、TypeScript），版本写入 lockfile 锁死。

---

## 4. 工程化配置清单（要点）

### 4.1 Prettier 集成进 ESLint（关键）
采用 `eslint-plugin-prettier` + `eslint-config-prettier`，使 Prettier 作为 ESLint 规则运行，`eslint --fix` 同时修正格式，避免 prettier/eslint 双工具冲突。

```js
// eslint.config.js (flat)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig, // 关闭与 prettier 冲突的规则
  {
    plugins: { prettier },
    rules: { 'prettier/prettier': 'error' }, // prettier 以 lint 错误形式呈现
  },
  { ignores: ['build', 'node_modules', 'docker/vol'] },
];
```

### 4.2 lint-staged + husky
```jsonc
// package.json (节选)
"lint-staged": {
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "vitest related --run"]
}
```
`husky` 安装 `pre-commit` 钩子执行 `lint-staged`；可选增加 `commit-msg` + commitlint 规范提交信息。

### 4.3 其他配置文件
`.prettierrc`（仅存放 prettier 规则；因 prettier 已集成进 ESLint，不单独跑 prettier CLI，故**不另设 `.prettierignore`**，忽略目录统一在 `eslint.config.js` 的 `ignores` 中处理）/ `.editorconfig` / `tsconfig.json` / `tsconfig.node.json` / `vitest.config.ts`（env: jsdom、setupFiles、coverage v8）/ `.dockerignore` / `.gitignore`。

---

## 5. 目录结构（工程级）

```
subconverter-ui/                       # 项目根（git@github.com:imere/subconverter-ui.git）
├── docs/
│   └── implementation-plan.md        # 本文件
├── docker/
│   ├── ex/                           # 全部 docker 配置与运维脚本
│   │   ├── Dockerfile                # 多阶段：node 构建 → nginx:alpine
│   │   ├── nginx.conf                # SPA + 反代 /sub|/version|/getruleset|/getprofile 到 subconverter
│   │   ├── compose.yml               # 双服务：subconverter + webui
│   │   ├── .subconverter.env         # TZ / api_mode / token 等环境变量
│   │   ├── pull.sh                   # 拉取镜像
│   │   ├── start.sh                  # 启动 compose
│   │   ├── down.sh                   # 停止并移除
│   │   ├── roll.sh                   # 重建 webui 镜像并滚动重启
│   │   └── upgrade.sh                # 升级 subconverter 镜像并重建
│   └── vol/                          # 持久化卷（compose 用相对路径 ../vol 挂载）
│       └── subconverter/
│           └── base/
│               ├── config/           # → /base/config
│               ├── rules/            # → /base/rules
│               └── logs/             # → /base/logs
├── public/                           # 静态资源（favicon 等）
├── src/
│   ├── api/
│   │   ├── subconverter.ts           # API 客户端（fetch 封装）
│   │   └── subconverter.test.ts      # TDD：客户端单测（mock fetch）
│   ├── components/
│   │   ├── ConversionForm.tsx
│   │   ├── ConversionForm.test.tsx
│   │   ├── ResultViewer.tsx
│   │   └── ResultViewer.test.tsx
│   ├── hooks/
│   │   ├── useConversion.ts
│   │   └── useConversion.test.ts
│   ├── utils/
│   │   ├── buildSubUrl.ts            # 参数拼装 + URL 编码 + '|' 合并
│   │   └── buildSubUrl.test.ts
│   ├── types/index.ts
│   ├── test/setup.ts                 # jest-dom / 全局 mock
│   ├── App.tsx
│   └── main.tsx
├── .github/workflows/ci.yml          # test + lint + build
├── eslint.config.js
├── .prettierrc
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

**compose 相对路径要点**：`compose.yml` 位于 `docker/ex/`，卷用 `../vol/subconverter/base/...:/base/...`，解析到 `docker/vol/...`，符合"相对路径挂载 + 路径对齐"要求。

---

## 6. TDD 工作流与测试策略

**循环**：Red（先写失败测试）→ Green（最小实现通过）→ Refactor（重构并保绿）。测试先行于每个模块。

**典型测试用例**（覆盖核心逻辑）：
1. `buildSubUrl`：正确编码 `target/url/config`；多订阅 `|` 合并；非法字符转义。
2. `subconverter.convertSubscription`：构造 `/sub` 查询、返回文本；非 200 抛出带后端消息的错误；超时处理。
3. `useConversion`：idle/loading/success/error 状态机；提交时调用 api。
4. `ConversionForm`：必填校验（url）；target 下拉；提交回调触发；展示错误。
5. `ResultViewer`：YAML/文本高亮、复制、下载按钮。

**命令**：`npm test`（watch）、`npm run test:cov`（覆盖率）、`npm run lint`、`npm run build`。

---

## 7. Docker 方案

### 7.1 Dockerfile（多阶段）
```
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/build /usr/share/nginx/html
COPY docker/ex/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```
> 注意：compose 用 `build.context: ../..`（仓库根），`dockerfile: docker/ex/Dockerfile`；`.dockerignore` 排除 `node_modules`、`build`、`docker/vol`。

### 7.2 nginx.conf（SPA + 反代）
- `/` → 静态 SPA（`try_files $uri /index.html`）。
- `/sub`、`/version`、`/getruleset`、`/getprofile`、`/render`、`/refreshrules` → `proxy_pass http://subconverter:25500`。
- 同源解决 CORS；token 类接口（readconf/updateconf）仅在管理范围启用，由前端经反代转发（token 不放前端，或在后端代理注入）。

### 7.3 compose.yml（双服务，安全默认）
```yaml
services:
  subconverter:
    image: tindy2013/subconverter:latest
    container_name: subconverter
    env_file: .subconverter.env
    volumes:
      - ../vol/subconverter/base/config:/base/config
      - ../vol/subconverter/base/rules:/base/rules
      - ../vol/subconverter/base/logs:/base/logs
    restart: unless-stopped
    # 不暴露到宿主机，仅内部网络可达

  webui:
    build:
      context: ../..
      dockerfile: docker/ex/Dockerfile
    container_name: subconverter-webui
    ports:
      - "8080:80"
    depends_on:
      - subconverter
    restart: unless-stopped
```

---

## 8. 后续阶段路线（本期之外）

- **Tier B 配置管理**：`/getprofile`、`/getruleset` 浏览编辑，`/updateconf` 写回（需 token）。token 经 nginx 透传，建议加 Basic Auth 保护管理类接口。
- **Tier C 管理后台**：token 管理、`/refreshrules`、`/readconf`、日志查看（挂载 `/base/logs`）、健康检查、历史记录。

本期已锁定上述三项决策，无需再确认。

---

## 9. 分阶段实施步骤（确认后执行）

- **P0 脚手架**：Vite+React+TS 初始化，目录结构，全部工程化配置（ESLint+Prettier 集成、husky、lint-staged、vitest）。验证 `npm run lint/test/build` 全绿。
- **P1 API 层（TDD）**：先写 `subconverter.test.ts` 与 `buildSubUrl.test.ts`，再实现客户端与工具函数。
- **P2 UI 层（TDD）**：`useConversion` → `ConversionForm` → `ResultViewer` → `App`，逐组件红绿重构。
- **P3 容器化**：Dockerfile、nginx.conf、compose.yml、ex/ 脚本、vol/ 占位目录。
- **P4 podman 验证**：见第 10 节。
- **P5 文档与 CI**：README、GitHub Actions CI。

---

## 10. 本机 podman 构建与调试验证

```bash
# 1. 构建 webui 镜像
podman build -f docker/ex/Dockerfile -t subconverter-ui:local .

# 2. 启动双服务
cd docker/ex && ./start.sh          # = podman compose -f compose.yml up -d

# 3. 健康检查
curl -fsS http://localhost:8080/version   # 经 nginx 反代到 subconverter
curl -fsS http://localhost:8080/              # SPA 首页

# 4. 端到端转换（经反代）
curl "http://localhost:8080/sub?target=clash&url=<ENCODED>"

# 5. 清理
./down.sh
```
> 验证点：镜像可构建、SPA 可服务、反代可达 subconverter、卷挂载生效（`docker/vol/subconverter/base/logs` 出现日志）。需先确认本机 `podman compose` 子命令可用（否则安装 `podman-compose`）。

---

## 11. 风险与备注

- **CORS**：必须由 nginx 反代，不可浏览器直连 subconverter。
- **token 安全**：若启用配置管理（readconf/updateconf），token 不应落到前端；建议经后端代理或仅内网暴露。
- **卷路径对齐**：实现时用 `podman run --rm tindy2013/subconverter:latest ls -la /base` 复核容器内真实结构，确保 `vol/` 与实际一致。
