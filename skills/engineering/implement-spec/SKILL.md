---
name: implement-spec
description: 按规格说明与工单依赖图，通过 Git Worktree 隔离并发或串行推进代码实现直至交付。
disable-model-invocation: true
---

# 规格落地与工单推进 (Implement Spec)

> **元规则**：仅供用户手动触发（`disable-model-invocation: true`），严禁自动加载。单工单或单窗口任务走 [implement](../implement/SKILL.md)。默认使用当前客户端原生子代理；用户明确要求跨会话或多 Agent 协作时按 constitution 的 [Herdr 协作模块](../../constitution/modules/herdr.md) 接入。

以规格说明和用户确认的工单依赖图（DAG）为输入，由主协调者调度 Worker（并发或串行）推进代码实现，直至整套规格在集成分支上通过全量测试与代码评审。

---

## 一、核心原则与职责边界

1. **职责分离**

   - [to-spec](../to-spec/SKILL.md) 确立规格；[to-tickets](../to-tickets/SKILL.md) 拆解工单图；`implement-spec` 仅负责调度执行，不重新追问已确认的规格。
   - **Worker 职责纯粹**：
     - **输入**：工单授权范围内的文件、前置依赖工单已生成的实现证据。
     - **动作**：开工前按当前引擎规则加载或读取 [implement](../implement/SKILL.md) 并全程遵循其闭环工作流；仅运行工单直接相关的局部测试，不执行收尾的全量测试要求（全量测试由协调者收口）；提交前自行执行 [code-review](../code-review/SKILL.md) 开展 Spec 与 Standards 两轴自审并修复闭环。
     - **完成标准**：在专属分支提交干净代码，按契约落盘自审与局部测试结果文件；不碰工单文件、集成分支与共享构建输出，不参与合并。
   - **主协调者独占集成与调度**：
     - **输入**：Worker 交付的提交、不可变回报结构与结构化测试/自审文件。
     - **动作**：独占 coordinator 工作树执行集成；独占集成分支推进、合并与冲突解决、工单状态与完整实现证据回写、受影响与全量测试、独立调度 Reviewer 子代理完成最终全局审查。
     - **完成标准**：主协调者保持 Control Plane 职责，不直接在模型对话中吞吐大段 diff 或测试长日志。

2. **集成分支汇聚 (Integration Branch)**
   所有工单成果收敛到专用集成分支（`integrate/<spec-slug>-<run-id>`）。未经全量测试与统一评审，不向发布分支或主干合并。

3. **就绪前沿铁律 (Integrated Frontier)**
   工单图的就绪前沿（Frontier）计算，**仅按「前置依赖已处于 `integrated` 状态」判定**。严禁按 Worker 口头汇报的完成状态放行下游，确保新工单切出的基线包含所有前置成果。

4. **物理隔离与上下文轻量传递**

   - 并发 Worker 独占 `git worktree` 和专属临时分支，严禁共享工作区。
   - 派发给 Worker 的上下文只给**轻量指针**：工单与规格的只读快照路径、依赖工单已生成的实现证据只读路径、独占 worktree 与分支名、关联代码位置（file:line），严禁全文拷贝。

---

## 二、双层状态机与工单回写管理

运行态收敛在项目临时目录 `temp/implement-runs/<run-id>/`。工单 Markdown 仅在状态达成 `integrated` 时写入自包含的结构化实现证据（若工单进入 `blocked`，仅记录阻塞摘要），不污染易变的瞬态执行细节。

### 活跃 Run 保护与权限安全

- **权限安全**：POSIX 环境下创建 run 目录设为 owner-only（目录 700、文件 600），Windows 继承 ACL 后核对，防私有路径与上下文外泄。
- **活跃保护**：未进入 `finished` 的 run 目录（包括 `preparing`、`running`、`awaiting-review`、`reviewed`、`blocked` 以及含有未整合失败现场的 run），**严禁被全局清理脚本无差别删除**。
- **清理门槛**：全局 run 进入 `finished` 终态，且已整合的临时 worktree 正常移除后，才允许清理对应 run 目录。

### 状态写入与防并发锁

主协调者是**唯一的状态写入者**。初始化时用原子排他创建机制（如 `noclobber` 或 `O_EXCL`）建立 `run.lock` 文件（记录主进程 PID 与启动时间），接管旧锁前重新原子抢占。状态迁移采用原子写（临时文件 rename）记录 `checkpoint.json`。

**脱敏红线**：checkpoint 仅记录结构化摘要与错误分类。测试原始日志落盘前必须过滤 token、密钥与 `.env` 内容，超长截断；回传与对话一律遵循 constitution 敏感信息脱敏规则（用 `<REDACTED>` 替换）。

命名规范：`<spec-slug>` 与 `<ticket-id>` 仅允许小写字母、数字和连字符（`[a-z0-9-]+`）；`<run-id>` 格式为时间戳加随机后缀（如 `20261017-a1b2`）。

### 1. 工单状态机 (Ticket-Level)

```
pending ──> ready ──> claimed ──> running ──> completed ──> integrated
              ▲                      │
              ├────── (解除阻塞) ─────┼──> blocked (单工单阻塞)
              ├────── (新 attempt) ──┼──> failed (失败现场保留)
              └────── (新 attempt) ──┴──> interrupted (超时/失联)
```

- **pending**：存在未合入集成分支的前置依赖。
- **ready**：所有前置依赖均已 `integrated`，进入就绪前沿。
- **claimed / running**：协调者已分配并启动 Worker。
- **completed**：Worker 已提交代码、落盘可核验的自审与局部测试结果文件、退出码为 0 且独占 worktree 干净（未整合）。
- **integrated**：预检合并成功、受影响测试通过、canonical evidence 已提交集成分支。
- **blocked**：该工单配置缺失、依赖不可用或输入错误，仅挂起该工单及下游，无关工单继续推进。
- **failed**：Worker 报错、测试未通、自审未闭环或集成失败，保留对应 attempt 的现场与代码。
- **interrupted**：Worker 进程超时或未响应，确认停止后归档现场，禁止直接复用原 worktree。

### 2. 工单双轨回写与实现证据沉淀 (Evidence & Dual-Track Projection)

只把 `[x]` 和状态文本写上去，下游拿不到核验基准。工单状态迁移时，必须实行双轨同步：

1. **事实源回写 (Canonical in Integration Branch)**：
   在 coordinator 工作树中修改该工单 Markdown 文件：

   - 将对应项从 `[ ]` 改为 `[x]`，状态元数据更新为 `已完成`；若工单进入 `blocked`，同步更新元数据为 `阻塞: <简短原因>`（不追加实现证据）；

   - 达成 `integrated` 时，在工单末尾追加结构化 `## 实现证据 (Integrated Evidence) - Attempt <attempt>` 子区块。
     **自包含原则**：运行态临时日志路径在 run 归档后会失效，因此工单中的证据必须自包含完整关键事实，不依赖临时文件生存周期。旧 attempt 证据追加保留，不覆盖，保障审计链：

     ```markdown
     ## 实现证据 (Integrated Evidence) - Attempt <attempt>
     - **执行标识**：Run `<run-id>` | 生成时间 `<timestamp>`
     - **集成提交链**：
       - Worker 提交: `<worker-commit>`
       - 代码集成提交: `<code-integration-commit>`
       - 证据文档对应基线: `<code-integration-commit>`（本证据随后续文档提交归档）
     - **实际改动文件 (基于 git diff 提取比对)**：
       - `path/to/file1` (新增/修改说明)
       - `path/to/file2`
     - **暴露核心接口**：导出的核心函数、模型或配置（无则标 `none`）
     - **验收测试命令与结论**：
       - Worker 局部验证: `<test-command>` (exit code 0, 通过用例数/覆盖率摘要)
       - 集成受影响测试: `<affected-test-command>` (exit code 0, 通过用例数/覆盖率摘要)
     - **施工方自审记录**：已按 `implement` 流程完成 Spec 与 Standards 审查，发现项已闭环修复（自审结论: 无阻塞缺陷，代码符合规范）
     - **下游对接提示**：下游工单使用前置产物时的环境要求、导入路径或约定（无则标 `none`）
     ```

   - 提交工单更新：`git commit -m "docs(ticket): complete ticket <ticket-id> with evidence"`。

2. **主工作区镜像同步 (Projection to Workspace)**：

   - 为让用户在 IDE 中看到进度，协调者在完成集成分支回写后，将该工单文件镜像更新回主工作区对应的工单文件。中间运行态不镜像。
   - **防覆盖防线 (CAS 校验机制)**：
     - 协调者在 `checkpoint.json` 中记录每个工单文件上一次成功镜像后的 `last_projected_sha256`（首次写入时与 `inputs/` 初始快照 hash 对比）。
     - 镜像更新采用排他锁结合临时文件 compare-and-swap 原子重命名机制：在准备覆写前再次核验目标工单文件当前 hash 是否仍与 `last_projected_sha256` 一致。
     - 若 hash 不符，表明用户在外部做了并发编辑，**严禁静默覆盖**，立即放弃本次镜像并标记 projection 事件为 `workspace_mirror_blocked` 并在终端提醒。这属于投影呈现受阻，不阻碍代码集成，但在 run 进入 `finished` 前必须在终态报告中显式列出。

3. **事件驱动看板 (Progress Board)**：
   在任一工单状态变迁或投影事件发生时，主协调者向会话输出一行简明进度看板，禁止低效轮询刷屏。

### 3. 全局状态机 (Run-Level)

```
preparing ──> running ──> awaiting-review ──> reviewed ──> finished
  ▲             │
  │             ├──> blocked (账号欠费/全局阻断，可恢复)
  │             ├──> failed (全局严重错误，可修正后恢复)
  │             └──> interrupted / aborted (用户叫停或中断)
  └────── (人工排查/修正/补充资源后恢复重入) ──┘
```

- **preparing**：校验闭环，建立集成分支、coordinator 工作树与运行态目录。
- **running**：事件驱动调度 Worker 推进工单。
- **awaiting-review**：全部工单均已 `integrated`，在 coordinator 工作区全量测试通过。
- **reviewed**：独立 Reviewer 代码评审完成，评审意见已修复且回归测试通过。
- **finished**：全量测试通过、独立 Reviewer 评审通过无开放缺陷、集成分支证据完整提交、已整合临时 worktree 清理完毕。
- **run-level blocked**：账号欠费、鉴权失效或网络阻断，暂停全局调度；解除后切回 `running`。
- **run-level failed / interrupted / aborted**：运行时崩溃或用户叫停；排查后从 checkpoint 恢复重入。

---

## 三、推进执行流程

### 环境与 Shell 执行约定

正文命令默认在 Bash / Git Bash / WSL 环境执行。Windows 用户或非 POSIX 环境先按 [命令行基本功](../../constitution/modules/command-shell.md) 选取环境或改写脚本，禁止在 CMD / PowerShell 中直接无转义执行 Bash 语法。若 `git worktree` 或路径可用性校验失败，立即暂停汇报，不将环境缺失误判为业务逻辑失败。

### 测试执行与日志通用规范

为了确保测试证据可定位、可验证且不污染主协调者对话上下文，所有测试执行必须遵循统一的落盘与命名规范：

1. **独立存储路径**：
   - Worker 局部测试结果：`temp/implement-runs/<run-id>/logs/<ticket-id>/<attempt>/test-result-worker.json`，原始日志 `test-worker.log`；
   - 集成受影响测试结果：`temp/implement-runs/<run-id>/logs/<ticket-id>/<attempt>/test-result-integration.json`，原始日志 `test-integration.log`；
   - 全量回归测试结果：`temp/implement-runs/<run-id>/logs/test-result-full.json`，原始日志 `test-full.log`。
2. **结构化契约与权限**：
   - 每次命令必须输出结构化 JSON（记录 `command`, `cwd`, `start_time`, `end_time`, `exit_code`, `summary`, `log_path`）；若阶段内执行多条命令，固定以命令数组格式汇总记录于该阶段统一的 `test-result-*.json` 中，所有命令必须满足 `exit_code == 0` 才判定为测试通过；
   - 原始日志文件必须显式设置所有者独占权限（POSIX 600），并执行敏感信息脱敏；
   - 严禁通过管道吞掉真实退出码，必须如实记录命令原生的 `exit_code`。
3. **主会话防刷屏**：
   - 主协调者对话与看板仅展示工单标识、阶段、exit code 和核心摘要，严禁将原始详细日志打印到上下文。

### 阶段一：开工准备与环境对齐 (Pre-flight Alignment)

在拉起任何 Worker 与建立集成分支前，完成输入核验、环境探查、调度策略对齐和沙箱初始化。探查不到的能力按保守配置处理，不用猜测值继续派工：

1. **输入与基线审查**：

   - 完整读取规格说明与工单依赖图（DAG），核验无循环依赖与悬空依赖；
   - **基线清洁校验**：执行 `git status --porcelain`，除 `.gitignore` 已忽略的 `temp/` 等目录外，跟踪文件与受管工作树必须绝对清洁；基线严格锁定当前 `HEAD`；
   - 固化主仓库根目录绝对路径：`REPO_ROOT=$(git rev-parse --show-toplevel)` 并校验非空。

2. **环境探查与调度策略对齐**：

   - 按宿主平台使用可用的原生工具探查 CPU 逻辑核心、内存和系统负载：Linux/Git Bash/WSL 可使用 `nproc`、`free -m`、`uptime`；macOS 使用 `sysctl`、`vm_stat`、`uptime`；Windows 使用 PowerShell 的系统信息命令。工具不存在或权限不足时，将该项标为未知，采用保守并发配置，不填造数据，也不把可选探查失败当成业务失败；
   - 只从当前引擎已验证可用的模型目录或候选池读取 Worker 与 Coordinator 的模型 ID。拿不到目录时，Coordinator 沿用当前会话模型，Worker 沿用当前引擎的默认可用模型；不凭「主流模型」「大窗口模型」这类描述猜模型，也不跨引擎强行切换模型；
   - 根据任务类型、工单难度、依赖图宽度、局部测试与构建压力，结合已验证的模型列表形成运行建议。建议至少说明：Worker 与 Coordinator 的候选模型及选择理由、推荐并发数与估算依据、置信度、未知项、备选策略和降载条件；不规定固定的汇报话术；
   - 推荐并发数只是一项初始估计，不由模型单独决定。调度器同时考虑引擎能管理的 Worker 数、模型和供应商并发/配额、宿主 CPU/内存/磁盘压力、任务测试成本、Frontier 宽度和用户预算，运行中的有效并发不得超过这些约束的最小值；
   - 资源、配额或模型能力未知时，从 1 个 Worker 开始，收到终态事件并观察实际负载后一次增加一个空闲槽位；收到 429、过载、超时或资源压力后降载或暂停，不自动超过用户确认的范围，也不自动恢复到更高并发；
   - 开工前向用户汇报实际探查结果、已验证的模型 ID、任务画像、推荐配置、依据和不确定项。用户确认或给出定制指令后才启动 Worker，并将最终配置写入 `checkpoint.json` 的 config 字段中；

3. **初始化运行沙箱与输入快照**：

   - 先创建 `temp/implement-runs/<run-id>/`，按权限硬防御纪律建立 `run.lock`，并校验目录权限；各 Agent 跨工具调用不得假设继承 `umask`，`run.lock`、`checkpoint.json`、日志、inputs 快照和临时文件必须显式设置 POSIX 600 或通过 Windows ACL 校验，失败立即终止；
   - 在权限校验通过后，将用户指定的规格与全部工单文件复制到 `temp/implement-runs/<run-id>/inputs/`，记录路径映射和 SHA-256 checksum。逐个校验快照文件权限，后续 Worker 与协调者统一引用该不可变快照；

4. **依赖预热与隔离验证**：

   - 在根项目按现有包管理器机制准备只读公共缓存；不要假设根工作树的 `node_modules` 或构建输出会出现在独立 worktree，也不要让 Worker 共享写入依赖锁或构建目录；
   - 每个 Worker worktree 创建后，先按项目实际机制验证依赖可见性和局部测试入口。缺依赖时，只能在该 worktree 的隔离路径安装，或暂停派工等待补齐环境；
   - 预热完成后再次检查 git 状态。如果 lockfile、受跟踪生成物或其他文件被改动，立即停止并报告，不能继续使用原基线。

5. **建立 Coordinator 独立工作树**（不污染用户主工作区）：

   ```bash
   umask 077
   mkdir -p "$REPO_ROOT/temp/implement-runs/<run-id>"
   chmod 700 "$REPO_ROOT/temp/implement-runs/<run-id>"
   git worktree add -b integrate/<spec-slug>-<run-id> "$REPO_ROOT/temp/implement-runs/<run-id>/coordinator" HEAD
   ```

   主协调者的合并、工单回写提交、受影响测试、全量测试与评审调度均在此工作树内执行。

### 阶段二：事件驱动调度与 Worktree 生命周期

禁止低效轮询。**仅在以下事件发生时重新计算就绪前沿（Frontier）**：

- 某一工单合入集成分支（变为 `integrated`）；
- 某一 Worker 终态退出（`completed`、`failed`、`blocked`、`interrupted`）；
- 用户解除阻塞或执行人工恢复。

**并发控制**：调度器根据阶段一形成的运行配置和实时事件维护有效并发。任一时刻的 Worker 数不得超过引擎能力、模型/供应商配额、宿主安全资源估计、Frontier 宽度和用户确认范围中的最小值；资源或配额未知时从 1 个 Worker 开始，最多一次增加一个槽位。Frontier 再大也不能无限铺开；收到 429、过载、超时或资源压力事件后，自动降载或暂停，并等待新的事件或用户指令再恢复。不支持并发子代理的引擎退化为单 Worker 串行。

#### 1. 创建独立 Worker Worktree

- 路径必须包含 attempt：`$REPO_ROOT/temp/implement-runs/<run-id>/worktrees/<ticket-id>/<attempt>/`。

- **路径防御**：先建父目录并对其 `realpath` 校验，严禁软链接与 `..` 穿越。创建前比对 `git worktree list --porcelain`。

- 创建命令：

  ```bash
  mkdir -p "$REPO_ROOT/temp/implement-runs/<run-id>/worktrees/<ticket-id>"
  WORKER_PARENT=$(realpath "$REPO_ROOT/temp/implement-runs/<run-id>/worktrees/<ticket-id>")
  WORKER_DIR="$WORKER_PARENT/<attempt>"
  git worktree add -b implement/<run-id>/<ticket-id>/<attempt> "$WORKER_DIR" integrate/<spec-slug>-<run-id>
  ```

- 校验该 worktree 的 HEAD 与当前 integration tip 一致。

#### 2. Worker 独立施工与交付物契约

- **开工指令铁律**：主协调者派发给 Worker 的任务指令中必须包含硬性规定：**「开工前必须按宿主环境加载或读取 [implement](../implement/SKILL.md)（在 Pi 环境中读取对应 SKILL.md），全程严格遵守其工作流。」**
- 遵循 `implement` 流程：精准修改、[tdd](../tdd/SKILL.md) 与施工方自审。
- 仅修改工单授权文件，不改无关代码与共享配置。
- **局部测试与自审闭环**：
  - 仅跑工单直接相关的局部测试，严禁执行全量测试；
  - 测试命令执行结果与日志必须写入 run 日志目录 `logs/<ticket-id>/<attempt>/test-result-worker.json` 与日志文件（多条命令按统一 schema 的数组记录）；
  - 测试通过后，Worker 在提交前必须执行 [code-review](../code-review/SKILL.md) 开展 Spec 与 Standards 两轴自审。**产物隔离防污染**：自审报告统一落盘至 run 日志目录 `temp/implement-runs/<run-id>/logs/<ticket-id>/<attempt>/worker-review.md`，严禁写在专属 worktree 内，以确保提交后 worktree 保持绝对 clean；修复问题后重新确认局部测试通过。
- **完工汇报**：
  在独占分支提交代码后，向协调者汇报不可变结构：
  `(ticket_id, attempt, base_commit, head_commit, changed_files, export_apis, test_result_path, review_report_path, review_digest, clean_status)`。
  协调者若发现文件缺失、自审未闭环或测试结果中任一命令 exit_code 不为 0，严禁推进到 `completed`。自审关键结论同步记录于 checkpoint，避免依赖临时文件生命周期。
- **严禁向集成分支执行任何 merge 或 push**。

#### 3. 主协调者串行整合（预检合并）

在 coordinator 工作树下单线程处理，禁止大段长日志进入对话：

1. **基线与真实 diff 核验**：

   - 核验 Worker 回报的 `base_commit` 是否合法且与集成分支 tip 兼容；
   - 检查 Worker worktree clean 状态；
   - 协调者主动通过 `git diff --name-only base_commit..head_commit` 提取实际改动文件，比对 Worker 授权范围，不盲信 Worker 自报清单。

2. **预检合并（不自动提交）**：
   在 coordinator 工作区执行：

   ```bash
   git merge --no-ff --no-commit implement/<run-id>/<ticket-id>/<attempt>
   ```

3. **受影响范围验证与提交**：

   - **受影响测试集判定规则**：
     由工单自身声明的测试命令与本次实际 `changed_files` 所关联的测试套件取并集作为受影响测试集。
   - 在未提交的合并工作态下运行受影响测试，命令输出落盘至 `logs/<ticket-id>/<attempt>/test-result-integration.json` 并记录真实退出码：
     - **测试通过 (exit code 0)**：

       ```bash
       git commit -m "integrate: ticket <ticket-id> (attempt <attempt>)"
       ```

       在 coordinator 工作树中按【工单双轨回写与实现证据沉淀】规则追加证据、标记完成并提交：

       ```bash
       git commit -m "docs(ticket): complete ticket <ticket-id> with evidence"
       ```

       执行主工作区镜像同步（前置 CAS Hash 校验），工单状态置为 `integrated`；
       向对话输出简明进度看板；
       **安全清理 worktree**：核验 Worker 绝对路径合法、进程已退出、在该路径下核验 `git status --porcelain --untracked-files=all` 为空后执行：

       ```bash
       WORKER_WT_PATH=$(realpath "$REPO_ROOT/temp/implement-runs/<run-id>/worktrees/<ticket-id>/<attempt>")
       git worktree remove "$WORKER_WT_PATH"
       git branch -d implement/<run-id>/<ticket-id>/<attempt>
       ```

     - **测试失败 (exit code != 0) 或合并冲突**：
       **立即安全回滚**：

       ```bash
       git merge --abort
       ```

       保留原现场与分支，记录错误摘要与日志路径，工单置为 `failed`，绝不留下脏工作区。

---

## 四、异常分级熔断、中断处理与崩溃恢复

严禁将所有失败归结为简单重试，严禁执行全局 `git worktree prune`。

### 1. 故障分级处理

- **瞬态故障 (429 / 临时 5xx / 网络超时且零进展)**：记录 attempt，预算内重试或换模型；耗尽后标为 `blocked`。
- **单工单故障 (配置错误 / 依赖缺失 / 测试失败 / 逻辑缺陷)**：工单标为 `blocked` 或 `failed`，**严禁 remove worktree**，脱敏后保留代码、diff 与日志。无关工单继续并发推进。
- **全局运行故障 (账号欠费 / 鉴权失效 / 全局网络阻断)**：全局 run 置为 `blocked`，暂停后续派工，保存运行态快照，上报用户。
- **超时失联 (Worker 未响应)**：标为 `interrupted`，核对进程与 worktree，确认停止后保存现场。禁止直接复用原 worktree。

### 2. 用户中断 (Ctrl+C) 与 Effects Unknown 现场处置

当中途遭遇强行中断或工具执行状态不明时：

1. **停止盲猜**：禁止根据退出码盲目判定成功或失败；
2. **一次性现场排查**：检查 `run.lock` 状态、`checkpoint.json` 最新记录、`coordinator` 与各个 worktree 的 `git status`、是否存在未提交的 `MERGE_HEAD` 以及活跃 Worker 进程；
3. **安全收口**：若存在未提交的预检合并，立即执行 `git merge --abort` 退出；若仍有活跃 Worker 正在运行，必须向其发出停止信号；受影响工单置为 `interrupted`（记录未响应或孤儿原因），现场完整保留，**禁止在此状态下为该工单直接派发新 attempt**，等待用户决定恢复或接管。

### 3. 协调者崩溃恢复序列 (Crash Recovery)

恢复只能在同一主机/文件系统上做（不支持跨机搬迁）。协调进程重启或重连后，按以下序列恢复：

1. **接管互斥锁**：扫描 `temp/implement-runs/`，读取 `run.lock`。比对 PID 与启动时间确认原进程已死亡后，重新排他抢占接管；
2. **复用集成上下文**：核验 `integrate/<spec-slug>-<run-id>` 分支与 coordinator 工作树。完好则直接复用，**严禁再次执行带 `-b` 的创建命令**；
3. **清理僵尸 Worker**：读取 `checkpoint.json`，核验活跃会话。状态仍为 `claimed` 或 `running` 但进程已死亡的 Worker，工单状态置为 `interrupted`，保留 worktree 现场；
4. **重建 Frontier**：基于集成分支已 `integrated` 的提交和冻结快照，重新计算就绪前沿，恢复派工。

### 4. 状态恢复路径与交接 (Handoff)

- **解除单工单阻塞 (blocked -> ready)**：补齐凭据、配额恢复或修正配置后，重新激活该工单放入 frontier。
- **失败工单重试 (failed / interrupted -> ready)**：保留失败 attempt 现场作为审计，递增 attempt 编号（如 `<ticket-id>/attempt-2`），建立全新隔离路径，从最新 integration tip 切出新分支重新派发。
- **用户交接 (Handoff 衔接)**：需要跨 Agent 或人工交接时，调用 [handoff](../../productivity/handoff/SKILL.md)。仅交接 `run-id`、`REPO_ROOT`、集成分支名、checkpoint 状态与工单 DAG 完成度；**严禁将原始未脱敏日志与凭据写入交接文件**。
- **清理门槛**：仅处于 `integrated` 终态的 worktree 允许正常移除；未整合的失败现场保留用于排查，不参与正常清理门槛。

---

## 五、全量验收与收尾交付

1. **工单清零**：确认所有工单均达 `integrated` 终态。
2. **全量回归测试**：在 coordinator 工作区集中执行全量自动化测试套件。测试输出落盘至 `logs/test-result-full.json` 与日志文件，协调者仅读取原生 exit code 与关键摘要。
3. **架构与代码评审 (Reviewer 独立子代理模式)**：
   - 为防止主协调者会话被全局海量 diff 撑爆上下文，主协调者**不得在自身会话中直接审查全量 diff**。
   - 主协调者**派发独立的 Reviewer 子代理**（带 [code-review](../code-review/SKILL.md) skill），按 [评审报告模板](../code-review/modules/REPORT-TEMPLATE.md) 针对集成分支相对于基线的整体 diff 独立展开 Spec 与 Standards 两轴评审。
   - **Reviewer 交付物契约**：Reviewer 必须将审查结论落盘至 `temp/implement-runs/<run-id>/reviewer-report.md`，协调者仅读取该文件中的结构化判定（通过状态、缺陷清单与建议）。该临时报告路径仅在 run 活跃期有效，最终向用户汇报的交付报告与 checkpoint 中必须完整内嵌两轴审查裁决与缺陷闭环证据，不依赖 temp 目录持久性。报告缺失或存在未解决缺陷时，严禁进入 `reviewed` / `finished`。
   - 若有评审意见需修复，在 coordinator 工作区或开启专用修复 attempt 针对最新 tip 修正，修正后**必须重新运行受影响测试与全量回归测试**，直至评审闭环。
4. **收尾归档**：
   - **安全注销 Coordinator 工作树**：主协调进程退出 coordinator 目录回到根目录（`cd "$REPO_ROOT"`），确认 clean 后移除：

     ```bash
     cd "$REPO_ROOT"
     git worktree remove $(realpath "$REPO_ROOT/temp/implement-runs/<run-id>/coordinator")
     ```

   - worktree 正常移除后，全局 run 置为 `reviewed` -> `finished`。
5. **交付收口 (按项目边界执行)**：
   - 交付终点：**经过全量测试验证与评审闭环的集成分支（`integrate/<spec-slug>-<run-id>`）**，并向用户汇报集成报告与 review 证据。若运行期间存在未恢复的 `workspace_mirror_blocked`，在报告中显式说明。
   - **红线**：未经用户明确授权，严禁擅自将集成分支 `git merge` 到主干、推送到远程仓库或提交 PR；规格说明亦不擅自归档。
