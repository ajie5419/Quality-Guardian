# 发布工作流

本文记录本仓库的标准发布路径。以后有新需求或修复时，按这里执行。

## 核心结论

功能代码合并到 `main` 后，不会直接发布生产。

真实链路是：

```text
功能分支
  -> 功能 PR
  -> 合并到 main
  -> release-please 自动创建或更新发布 PR
  -> 合并发布 PR
  -> 自动创建 qgs-v* tag
  -> deploy workflow 自动部署生产
  -> deploy 成功后才算发布完成
```

也就是说，发布分两次合并：

1. 合并功能 PR：把需求代码进 `main`。
2. 合并 release PR：生成版本、tag，并触发生产部署。

## 新需求标准流程

1. 从最新 `main` 开功能分支。

   ```bash
   git switch main
   git pull --ff-only
   git switch -c codex/<scope>
   ```

2. 在功能分支完成需求、测试和文档更新。

3. 提交信息必须使用 release-please 能识别的 Conventional Commit：

   ```text
   feat(<scope>): add new capability
   fix(<scope>): fix production issue
   docs(<scope>): update documentation
   chore(<scope>): maintenance change
   ```

   常用规则：
   - 新功能用 `feat(...)`，会触发 minor 版本。
   - 缺陷修复用 `fix(...)`，会触发 patch 版本。
   - 只改文档、测试或清理代码，通常不会单独触发新版本，除非已有待发布变更。

4. 推送分支并创建功能 PR 到 `main`。

   ```bash
   git push -u origin codex/<scope>
   gh pr create --base main --head codex/<scope>
   ```

5. 等功能 PR 的 CI 全部通过后，再合并功能 PR。

   ```bash
   gh pr checks <功能PR编号> --watch
   gh pr merge <功能PR编号> --merge --delete-branch
   ```

6. 功能 PR 合并到 `main` 后，`release-please` workflow 会自动运行。

   它会创建或更新一个标题类似下面的发布 PR：

   ```text
   chore(main): release qgs x.y.z
   ```

7. 检查发布 PR 内容和 CI。

   发布 PR 通常只改这些文件：

   ```text
   .release-please-manifest.json
   CHANGELOG.md
   package.json
   ```

   必须等发布 PR 的检查全部通过：

   ```bash
   gh pr checks <发布PR编号> --watch
   ```

8. 合并发布 PR。

   ```bash
   gh pr merge <发布PR编号> --merge --delete-branch
   ```

9. 合并发布 PR 后，release-please 会创建 `qgs-v*` tag。

   这个 tag 会触发 `.github/workflows/deploy.yml`：

   ```text
   qgs-v0.14.0 -> deploy workflow -> build images -> push images -> deploy ECS
   ```

10. 等 deploy workflow 完成。

    ```bash
    gh run list --limit 10
    gh run watch <deploy-run-id>
    ```

    只有 deploy run 结论为 `success`，才算真正发布完成。

## 判断是否已经发布

不能只看 PR 是否合并。必须同时满足：

- 发布 PR 已合并。
- GitHub Release 已生成，对应 tag 形如 `qgs-v*`。
- `deploy` workflow 已完成且结论为 `success`。
- 本地 `main` 可 fast-forward 到远端最新提交，工作树干净。

推荐核对命令：

```bash
gh release list --limit 5
gh run list --limit 10
git status --short --branch
```

## 当前自动化配置

### release-please

配置文件：

- `.github/workflows/release-please.yml`
- `release-please-config.json`
- `.release-please-manifest.json`

触发条件：

```yaml
on:
  push:
    branches:
      - main
```

作用：

- 读取 `main` 上的 conventional commits。
- 自动维护版本号。
- 自动更新 `CHANGELOG.md`、`package.json`、`.release-please-manifest.json`。
- 自动创建或更新发布 PR。

### deploy

配置文件：

- `.github/workflows/deploy.yml`

触发条件：

```yaml
on:
  push:
    tags:
      - 'qgs-v*'
```

作用：

- 构建 backend Docker image。
- 构建 frontend Docker image。
- 推送镜像到 ACR。
- SSH 到 ECS 更新 compose 镜像 tag。
- 执行 Prisma migration 和本版本启动前置的 release maintenance。
- 启动 backend/frontend 并执行健康检查。

### 发布前置数据任务

发布执行器的顺序是：preflight -> 拉取镜像 -> 启动 Redis -> 停止旧 backend -> Prisma migration -> release maintenance -> 启动服务 -> healthcheck。maintenance 不是发布后的后台清理；它只能包含新版本启动前必须完成的幂等数据任务。

任务定义位于 `apps/backend/scripts/release-maintenance-manifest.ts`，由 `apps/backend/scripts/run-release-maintenance.ts` 读取并写入 `release_maintenance_tasks` ledger：

- 只连续执行 manifest 中声明、且 ledger 尚未 `COMPLETED` 的任务；历史任务不会被每次发布重放。
- 每项任务以 `taskKey + revision` 定位，并保存 SHA-256 checksum。完成且 checksum 一致时跳过；失败或 `RUNNING` 租约过期时在下一次发布重试。
- 同一 `taskKey + revision` 的 checksum 漂移会阻断发布。修复必须新增 revision，不能修改已完成记录。
- 历史 remediation、historical identity sidecar、投影重建、窗口/评分对账均为独立运维任务，禁止加入同步发布 manifest。

新增 release maintenance 前，必须确认它是该版本的启动前置条件、实现幂等，并提供稳定 taskKey、递增 revision、SHA-256 checksum 和测试。否则应改为独立运维命令或持久队列 worker。

### 有界执行与回滚

远端发布统一由 `scripts/deploy/run-remote-release.sh` 执行。它使用固定容器名 `qms-release-migration` 与 `qms-release-maintenance`，对镜像拉取、migration、maintenance 和健康检查设置上限；失败或超时后清理固定容器、恢复备份 compose 配置并拉起旧服务。preflight 会在停止 backend 前拒绝已有的固定 one-off 容器，避免误杀其他发布。

如果生产发布失败，重试前必须人工确认失败原因、检查 compose 回滚和数据库状态，并定向清理已确认属于该失败发布的旧随机名 one-off 容器。不得直接重跑发布，更不得使用宽泛 Docker prune 或跳过 maintenance。

## 常见误区

### 误区 1：功能 PR 合并后就是发布完成

不是。功能 PR 合并后只是进入 `main`，还需要 release-please 生成发布 PR，并合并发布 PR 触发 tag 和 deploy。

### 误区 2：release PR 合并后就是发布完成

也不是。release PR 合并后会生成 tag 并触发 deploy。必须等 deploy workflow 成功。

### 误区 3：看到 GitHub Release 就说明生产已经更新

不一定。GitHub Release 只说明 tag/release 已生成。生产是否更新，以 `deploy` workflow 是否成功为准。

### 误区 4：所有 commit 都会触发新版本

不是。release-please 主要根据 Conventional Commit 判断是否需要发版。`feat` 和 `fix` 会进入版本变更；普通 `docs`、`chore` 不一定触发新版本。

## 发布失败时的处理原则

- 发布 PR CI 失败：先修代码或测试，再等 release-please 更新发布 PR；不要强合。
- deploy 失败：查看失败 step 日志，优先确认镜像构建、ACR 登录、ECS SSH、Prisma migration、健康检查。
- maintenance 失败、租约未过期或 checksum 漂移：保持 fail-closed。先确认 ledger 状态、任务版本与 checksum；失败/过期租约可由后续发布重新领取，漂移必须新增 revision。不要删除 ledger 记录规避门禁。
- 发现旧随机名 migration/maintenance 容器：先人工核对来源和日志，再定向删除确认残留；固定容器残留会被 preflight 拒绝，清理后才能重试。
- migration 失败：不要手动改生产表结构，必须通过 Prisma migration 或既有 deploy baseline 逻辑处理。
- deploy 成功前，不要对外宣称发布完成。

## 最小口令

以后说“合并 PR 并发布”，默认执行完整链路：

```text
检查功能/发布 PR
  -> 等 CI 全绿
  -> 合并 PR
  -> 等 release/tag
  -> 等 deploy workflow
  -> 确认 success
  -> 同步本地 main
```
