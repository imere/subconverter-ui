# AGENTS.md — 子代理工作契约

任何被派到本仓库干活的 agent（含 mcode），**先读完本文档再动手**。这不是可选建议：跳过必读清单而产生的返工，代价由你承担。

## 0. 项目一句话

`subconverter-ui`：给 subconverter 做 Web 管理界面的前端项目（React + Vite + TypeScript），附带容器化部署资产与一套密钥闸门。

## 1. 必读清单（按任务类型，先读全再动手）

| 你要做的事 | 必须先读 |
|---|---|
| 改代码 / 加功能 | `package.json`（scripts、engines、依赖版本）、`eslint.config.js`、`tsconfig*.json`、`src/` 下相关目录与同名 `*.test.*` |
| 改 CI / 发布 | `.github/workflows/ci.yml`、`.github/workflows/release.yml`、`.github/dependabot.yml` |
| 改容器 / 部署 | `docker/ex/Dockerfile`、`docker/ex/compose.yml`、`docker/ex/*.sh` |
| 改密钥扫描 / 钩子 | `.gitleaks.toml`、`scripts/secret-scan.js`、`.husky/pre-commit`、`.husky/pre-push` |
| 改文档 | `README.md`、`docs/implementation-plan.md`（后者是设计依据，不是历史归档） |

**读完再动手。** 禁止凭"通用最佳实践"推断本项目的约定。

## 2. 硬约定（违反即返工）

- **包管理器是 pnpm**，不是 npm / yarn。锁文件是 `pnpm-lock.yaml`。
- **Node >= 24**。不要为了兼容旧版本降低语法或依赖版本。
- **ESLint 10 flat config**，Prettier 已作为规则集成进 ESLint。**禁止新建 `.prettierrc` / `.prettierrc.json` / `prettier.config.js`** —— 格式问题一律靠 `pnpm exec eslint --fix` 修。
- **提交信息走 Conventional Commits**，由 commitlint 在 `commit-msg` 钩子里校验。
- **测试用 vitest**；覆盖率与构建产物输出到 `build/`（该目录已忽略）。
- **注释与代码同等重要**：改了逻辑就必须同步更新对应注释；过时注释视为缺陷。
- **注释和文档里禁止写长得像真实凭据的示例值**（如完整的 token 形态字符串）——本仓库有两道密钥扫描器会命中，且它们分不清示例与真密钥。要举例就用明显占位（`EXAMPLE`、`xxxx`）。

## 3. 禁止写进任何文件的内容（私有环境）

以下内容**不得**出现在代码、注释、文档、提交信息里：

- 本机绝对路径（`C:/Users/...`、`F:/...`）、家目录路径
- 代理地址与端口
- 任何 token / PAT / 密码 / 凭据文件的路径与内容
- 内部主机名、私有仓库地址

需要引用位置时，用**仓库相对路径**（如 `docker/ex/compose.yml`）或 `<repo-root>`。

## 4. 文档写作规范（反注水）

- **不写套话**：禁止"背景介绍""意义""总结""总而言之""希望对你有帮助"这类填充段。
- **不复述文件内容**：文档不是源码的复读机，写的是**为什么**和**边界**，不是**有什么**。
- **每条结论带证据**：版本号、命令、行为，必须是真实存在、可复现的；不确定就写"待确认"并说明原因，禁止臆造。
- **优先表格与清单**，少用形容词与排比。
- **不新增文档**来凑数：能并入现有章节就不要新建 `.md`。

## 5. 交付前自查（报告里逐条回答）

1. 改了哪些文件（仓库相对路径）+ 每处一句话说明。
2. 实际运行了哪些命令 + **原始输出**（不要只写"通过"）。
3. 边界情况：列 2–3 个边界输入及实际行为。
4. 不确定 / 没做到的项（宁可写"不确定"，不要粉饰）。
5. 本次改动有没有引入上面第 3 节禁止的私有信息——自查一遍再报告。
