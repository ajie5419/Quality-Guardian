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
- 执行 Prisma migration。
- 启动 backend/frontend。
- 执行健康检查。
- 启动发布后维护任务。

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
