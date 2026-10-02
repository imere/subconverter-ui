# subconverter WebUI — 设计与决策依据

> 状态：**Tier A 已落地实现**（源码、测试、容器资产、CI 均在仓库中）。本文记录的是**为什么这么选**和
> **边界在哪**，不是实施流水账。改代码时同步更新本文对应的决策条目。

---

## 1. 关键决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 功能范围 | **Tier A 转换 UI**：转换面板 + 结果预览/复制/下载 + `/version` 状态 | 配置管理类接口需要 token 与额外的鉴权面，先把「能用」闭环做完再扩 |
| 前端架构 | 纯 SPA + nginx 反代，前端与 converter **同端口**（宿主机 8080 → 内部 `subconverter:25500`），无后端 | 见 §2 |
| 引擎来源 | compose 内用官方镜像 `tindy2013/subconverter:latest`，不自己编 | 引擎不是本项目职责，官方镜像已足够 |
| 容器拓扑 | 双服务 `subconverter`（不暴露宿主机）+ `webui`（唯一入口） | 见 §2 |
| 格式化 | Prettier 集成进 ESLint，**不建 `.prettierrc`** | 避免 prettier CLI 与 eslint 双工具互相覆盖；选项写在 `eslint.config.js` 的 `prettier/prettier` 规则里 |
| 依赖版本 | 跟随上游最新，但 **TypeScript 锁在 `^6.0.0`** | 见 §3 |
| 测试 | Vitest（jsdom + Testing Library），测试与源码同文件相邻 | 配置见 `vitest.config.ts` |

---

## 2. 为什么必须走同源反代

subconverter 不返回 CORS 响应头，浏览器直连会被拦。三种方案的选择：

| 方案 | 结论 |
|---|---|
| 浏览器直连引擎 | **否决**：必然 CORS 失败 |
| 前端 + 自建后端代理 | **否决**：多一个要部署、要维护的服务，本项目没有必要 |
| nginx 同源托管 SPA 并反代 | **采纳**：浏览器只有一个 origin，问题从根上消失；反代规则写在 `docker/ex/nginx.conf` |

nginx 已反代 `/sub`、`/version`、`/getruleset`、`/getprofile`、`/render`、`/refreshrules`。
后四个是**为后续 Tier B 预留的通道，当前前端没有调用它们**——加配置管理时不需要改容器拓扑。

本地开发同样有反代：`vite.config.ts` 把这六个路径转发到本机 25500 端口，
所以 `pnpm dev` 与生产形态一致。

---

## 3. TypeScript 为什么锁在 6.x

`package.json` 固定 `typescript: ^6.0.0`，`.github/dependabot.yml` 显式忽略 `7.x`。

原因：TS 7 不再提供 compiler API，typescript-eslint 无法基于它运行
（`typescript-eslint#12518` 关闭为 "not planned"，支持推迟到 TS 7.1）。升到 7.x 会让
`pnpm lint` 直接失败，而不只是告警。这是生态时间差，不是配置错误。

**解除条件**：typescript-eslint 宣布支持 TS >= 7.1 后，删掉 `dependabot.yml` 里的 `ignore` 块。

### 另一处必要的 override

`pnpm-workspace.yaml` 里对 `string.prototype.repeat` 单独 override `es-abstract` 到 `1.23.9`。

原因：`eslint-plugin-react` 7.37.5（当前唯一支持 ESLint 10 的构建）依赖的 es-shims polyfill 家族，
同时要求两个**互不兼容**的 `es-abstract` 子路径——`2019/*` 只存在于 `<= 1.23.9`，
`2025/*` 只存在于 `>= 1.24`。全局 pin 无论选哪个都会弄坏另一批消费方，
因此只能**选择性地**把 pin 限定在 `string.prototype.repeat` 这一个包上。

**边界**：`pnpm-workspace.yaml` 必须与锁文件一同分发。缺失时 `--frozen-lockfile` 安装会以
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` 失败——`docker/ex/Dockerfile` 因此单独 `COPY` 了这两个文件。

---

## 4. 容器与卷

- **多阶段镜像**：`node:24-alpine` 构建静态产物 → `nginx:1.31-alpine` 托管。
  运行时镜像里没有 node，也没有源码。
- **卷路径对齐**：`compose.yml` 用相对路径 `../vol/subconverter/base/{config,rules,logs}`
  挂到容器 `/base/{config,rules,logs}`，实现"宿主机相对路径 == 容器内路径"。
- **卷不提交**：`docker/vol/subconverter/` 在 `.gitignore` 里，属于本机运行时数据。
  `docker/ex/start.sh` 负责创建缺失目录，否则 compose 会以 root 建目录。
- **token 不进前端**：`docker/ex/.subconverter.env` 里的 `SUBCONVERTER_TOKEN` 只传给引擎容器，
  仓库中留空。若将来启用 `/readconf`、`/updateconf`，token 不能落到前端代码或构建产物里。

引擎侧事实（工作目录 `/base`、端口 25500、`/base/{config,rules,logs}`）来自上游文档与镜像，
在仓库内由 `compose.yml` 的挂载路径和 `nginx.conf` 的 `proxy_pass` 间接印证。

---

## 5. 已落地的工程化约定

- ESLint 10 flat config，**刻意不继承 `@eslint/js` recommended**：`no-undef` 在 TypeScript 项目里
  冗余，且要额外引入 `globals` 依赖；类型安全由 `build` 里的 `tsc --noEmit` 保证。
- ESLint 忽略 `*.config.ts` 与所有 `*.test.*`（配置与测试文件不参与规则校验）。
- `lint-staged` 只对暂存的 `*.{ts,tsx,js,jsx}` 跑 `eslint --fix`——**不跑测试**。
- 行尾统一 LF：`.gitattributes` 的 `* text=auto eol=lf` 与 `eslint.config.js` 里的
  `endOfLine: 'lf'` 必须同步。不同步的话 Windows runner 检出 CRLF，
  `prettier/prettier` 会在每一行报 "Delete `CR`"，只有 Windows 红、Linux 和 macOS 绿。
- 覆盖率与构建产物都落在 `build/`，该目录已 git 忽略。

---

## 6. 密钥闸门的设计取舍

两层扫描器并行，理由是「有 gitleks 的机器不该退化，没 gitleaks 的机器不该裸奔」：

| 层 | 定位 |
|---|---|
| gitleaks（`.gitleaks.toml`） | 主力，150+ 规则。CI 里固定 `GITLEAKS_VERSION`，浮动 tag 会让上游悄悄改变"干净"的定义 |
| `scripts/secret-scan.js` | 兜底，零依赖。它留在 CI 循环里是为了**防止自己悄悄失效**——gitleaks 过而它挂，说明是自家扫描器的 bug，不是有泄漏 |

`gitleaks.toml` 在默认规则集上**追加**了两类实测缺口：连接 URI 里的 `user:password@host`、
JDBC URL 里的 password。理由是这类凭据是 URI 组件，没有 provider 前缀，任何按前缀匹配的规则都命中不了。
allowlist 用第二个 `[[allowlists]]` 块而非顶层 `[allowlist]`，因为顶层写法会**覆盖** gitleaks
内置的占位符过滤，误报反而变多。

**钩子实现上的一个坑**：`secret-scan.js` 的 `--patch` 模式从 **stdin 读 diff**，不自己调 git。
因为在部分 Windows 环境下 node 派生 `git` 会失败（EBUSY），而跑钩子的 shell 调 git 没问题。
钩子管道传 diff，脚本本身保持无进程依赖。

### 边界：本地闸门不是强制关卡

`pre-commit` / `pre-push` 都能用 `--no-verify` 跳过。CI 是唯一绕不过去的，但它跑在提交已经存在之后。
本仓库已公开，服务端 push protection 可在 Settings → Code security and analysis 免费开启
（开启后它是唯一绕不过去的一层）；未开启前，本地钩子是唯一能把凭据拦在历史之外的环节。

真发生泄漏时的顺序是：**先吊销/轮换凭据，再处理历史**。删提交不解密已推送的对象。

误报用 `secret-scan:ignore` 追加到行尾——同一个标记两套扫描器都认。

---

## 7. CI 与发布中的取舍

- **三平台矩阵**（Linux/macOS/Windows，`fail-fast: false`）：行尾、路径分隔符、shell 差异只会在
  某一个平台上现形，砍掉任何一平台都会让 CI 变绿但漏掉真实故障。
- **产物只上传一次**（Linux job）：三份构建产物字节一致。
- **覆盖率上传必须在 build 之前**：两者都落在 `build/`，vite 的 `emptyOutDir` 会清空该目录。
- **CI 下载 gitleaks 二进制而不用 `gitleaks-action`**：后者对组织账号需要 license key。
- **发布分两通道**：`main` 只发 amd64 `:alpha`（快速反馈），tag `v*` 才做多架构 + GitHub Release。
  分支构建允许被新提交取消，tag 构建不可取消。
- 依赖升级全部走 Dependabot，周一开 PR；`typescript` 的 ignore 见 §3。

---

## 8. 后续阶段（本期之外）

- **Tier B 配置管理**：`/getprofile`、`/getruleset` 浏览编辑，`/updateconf` 写回。需要 token，
  且管理类接口应加一层 Basic Auth——这些路径的反代已经在 nginx 里备好。
- **Tier C 管理后台**：token 管理、`/refreshrules`、日志查看（依赖已挂载的 `/base/logs`）、
  健康检查、历史记录。

**待确认**：License。仓库根目录没有 `LICENSE` 文件，`package.json` 也没有 `license` 字段，
发布前需要确定。

---

## 9. 本机验证方式

```bash
# 构建 webui 镜像
docker build -f docker/ex/Dockerfile -t subconverter-ui:local .

# 起栈
cd docker/ex && ./start.sh

# 验证点：SPA 可服务、反代可达引擎、卷挂载生效（docker/vol 下出现日志）
curl -fsS http://localhost:8080/version
curl -fsS http://localhost:8080/
curl "http://localhost:8080/sub?target=clash&url=<ENCODED>"

# 清理
./down.sh
```

`curl` 里的 `localhost:8080` 是 compose 发布的应用端口，不是宿主机私有信息。
