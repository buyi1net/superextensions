---
name: implement-spec
description: 按规格说明与工单依赖图，通过 Git Worktree 隔离并发或串行推进代码实现直至交付。
disable-model-invocation: true
---

# 规格落地与工单推进 (Implement Spec)

> **元规则**：仅供用户手动触发（`disable-model-invocation: true`），严禁自动加载。单工单或单窗口任务走 `implement`。默认使用当前客户端原生子代理；用户明确要求跨会话或多 Agent 协作时按 constitution 的 Herdr 纪律接入。

以规格说明和用户确认的工单依赖图（DAG）为输入，由主协调者调度 Worker（并发或串行）推进代码实现，直至整套规格在集成分支上通过全量测试与代码评审。

---

## 一、核心原则与职责边界

1. **职责分离**

   - `to-spec` 确立规格；`to-tickets` 拆解工单图；`implement-spec` 仅负责调度执行，不重新追问已确认的规格。
   - **Worker 职责纯粹**：只改工单授权范围内的文件（源码、测试、配置或 fixture）。**执行范围特别约定**：Worker 仅跑工单直接相关的局部测试和验证，不执行 `implement` 收尾的全量测试要求（全量测试统一收口至协调者）；只在专属分支提交；不碰工单文件、集成分支与共享构建输出，不参与合并。
   - **主协调者独占集成**：独占 coordinator 工作树执行集成；独占集成分支推进、合并与冲突解决、工单状态回写、受影响与全量测试、发起 code-review。

2. **集成分支汇聚 (Integration Branch)**
   所有工单成果收敛到专用集成分支（`integrate/<spec-slug>-<run-id>`）。未经全量测试与统一评审，不向发布分支或主干合并。

3. **就绪前沿铁律 (Integrated Frontier)**
   工单图的就绪前沿（Frontier）计算，**仅按「前置依赖已处于 `integrated` 状态」判定**。严禁按 Worker 口头汇报的完成状态放行下游，确保新工单切出的基线包含所有前置成果。

4. **物理隔离与轻量指针**

   - 并发 Worker 独占 `git worktree` 和专属临时分支，严禁共享工作区。
   - 派发给 Worker 的上下文只给**轻量指针**：工单与规格的只读快照路径、依赖产物路径、独占 worktree 与分支名、关联代码位置（file:line），严禁全文拷贝。

---

## 二、双层状态机与运行态管理

运行态收敛在项目临时目录 `temp/implement-runs/<run-id>/`，不污染工单 Markdown。

### 活跃 Run 保护与权限安全

- **权限安全**：POSIX 环境下创建 run 目录设为 owner-only（目录 700、文件 600），Windows 继承 ACL 后核对，防私有路径与上下文外泄。
- **活跃保护**：处于 `preparing`、`running`、`awaiting-review` 或含有未整合失败现场（`failed` / `blocked` / `interrupted`）的 run 目录，**严禁被全局清理脚本无差别删除**。
- **清理门槛**：全局 run 进入 `finished` 终态，且已整合的临时 worktree 正常移除后，才允许清理对应 run 目录。

### 状态写入与防并发锁

主协调者是**唯一的状态写入者**。初始化时用原子排他创建机制（如 `noclobber` 或 `O_EXCL`）建立 `run.lock` 文件（记录主进程 PID 与启动时间），接管旧锁前重新原子抢占。状态迁移采用原子写（临时文件 rename）记录 `checkpoint.json`。

**脱敏红线**：checkpoint 仅记录结构化摘要与错误分类。测试原始日志落盘前必须过滤 token、密钥与 `.env` 内容，超长截断；回传与对话一律遵循 constitution 敏感信息脱敏规则（用 `<REDACTED>` 替换）。

命名规范：`<spec-slug>` 与 `<ticket-id>` 仅允许小写字母、数字和连字符（`[a-z0-9-]+`）；`<run-id>` 格式为时间戳加随机后缀（如 `20261017-a1b2`）。

### 1. 工单状态机 (Ticket-Level)

```
pending ──> ready ──> claimed ──> running ──> completed ──> integrated
  ▲           ▲                      │
  │           └────── (解除阻塞) ─────┼──> blocked (单单阻塞)
  │                                  ├──> failed (失败现场保留)
  │                                  └──> interrupted (超时/失联)
  └───────────── (新 attempt 重新调度) ────────┘
```

- **pending**：存在未合入集成分支的前置依赖。
- **ready**：所有前置依赖均已 `integrated`，进入就绪前沿。
- **claimed / running**：协调者已分配并启动 Worker。
- **completed**：Worker 已提交代码并提供测试通过证据，独占 worktree 干净（未整合）。
- **integrated**：已安全合入集成分支，受影响测试通过，工单 Markdown 回写完成。
- **blocked**：该工单配置缺失、依赖不可用或输入错误，仅挂起该工单及下游，无关工单继续推进。
- **failed**：Worker 报错、测试未通或集成失败，保留对应 attempt 的现场与代码。
- **interrupted**：Worker 进程超时或未响应，确认停止后归档现场，禁止直接复用原 worktree。

**工单 Markdown 同步映射**：仅在工单达 `integrated` 时，协调者在 coordinator 分支回写工单 Markdown：将对应项从 `[ ]` 改为 `[x]`，状态元数据更新为 `已完成`；若工单进入 `blocked`，同步更新元数据为 `阻塞: <简短原因>`。

### 2. 全局状态机 (Run-Level)

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
- **reviewed**：代码评审完成，评审意见已修复且回归测试通过。
- **finished**：运行态就地归档，已整合的临时 worktree 清理完毕。
- **run-level blocked**：账号欠费、鉴权失效或网络阻断，暂停全局调度；解除后切回 `running`。
- **run-level failed / interrupted / aborted**：运行时崩溃或用户叫停；排查后从 checkpoint 恢复重入。

---

## 三、推进执行流程

### 环境与 Shell 执行约定

正文命令默认在 Bash / Git Bash / WSL 环境执行。Windows 用户或非 POSIX 环境先按 `constitution/modules/command-shell.md` 选取环境或改写脚本，禁止在 CMD / PowerShell 中直接无转义执行 Bash 语法。若 `git worktree` 或路径可用性校验失败，立即暂停汇报，不将环境缺失误判为业务逻辑失败。

### 阶段一：开工准备与环境对齐 (Pre-flight Alignment)

在拉起任何 Worker 与建立集成分支前，完成输入核验、环境探查、调度策略对齐和沙箱初始化。探查不到的能力按保守配置处理，不用猜测值继续派工：

1. **输入与基线审查**：

   - 完整读取规格说明与工单依赖图（DAG），核验无循环依赖与悬空依赖；
   - **基线清洁校验**：执行 `git status --porcelain`，输出必须绝对为空（既无未暂存改动，也无已暂存改动），基线严格锁定当前 `HEAD`；
   - 固化主仓库根目录绝对路径：`REPO_ROOT=$(git rev-parse --show-toplevel)` 并校验非空。

2. **环境探查与调度策略对齐**：

   - 按宿主平台使用可用的原生工具探查 CPU 逻辑核心、内存和系统负载：Linux/Git Bash/WSL 可使用 `nproc`、`free -m`、`uptime`；macOS 使用 `sysctl`、`vm_stat`、`uptime`；Windows 使用 PowerShell 的系统信息命令。工具不存在或权限不足时，将该项标为未知，采用保守并发配置，不填造数据，也不把可选探查失败当成业务失败；
   - 只从当前引擎已验证可用的模型目录或候选池读取 Worker 与 Coordinator 的模型 ID。拿不到目录时，Coordinator 沿用当前会话模型，Worker 沿用当前引擎的默认可用模型；不凭“主流模型”“大窗口模型”这类描述猜模型，也不跨引擎强行切换模型；
   - 根据任务类型、工单难度、依赖图宽度、局部测试与构建压力，结合已验证的模型列表形成运行建议。建议至少说明：Worker 与 Coordinator 的候选模型及选择理由、推荐并发数与估算依据、置信度、未知项、备选策略和降载条件；不规定固定的汇报话术；
   - 推荐并发数只是一项初始估计，不由模型单独决定。调度器同时考虑引擎能管理的 Worker 数、模型和供应商并发/配额、宿主 CPU/内存/磁盘压力、任务测试成本、Frontier 宽度和用户预算，运行中的有效并发不得超过这些约束的最小值；
   - 资源、配额或模型能力未知时，从 1 个 Worker 开始，收到终态事件并观察实际负载后一次增加一个空闲槽位；收到 429、过载、超时或资源压力后降载或暂停，不自动超过用户确认的范围，也不自动恢复到更高并发；
   - 开工前向用户汇报实际探查结果、已验证的模型 ID、任务画像、推荐配置、依据和不确定项。用户确认或给出定制指令后才启动 Worker，并将最终配置写入 run 元数据；

3. **初始化运行沙箱与输入快照**：

   - 先创建 `temp/implement-runs/<run-id>/`，按权限硬防御纪律建立 `run.lock`，并校验目录权限；各 Agent 跨工具调用不得假设继承 `umask`，`run.lock`、`checkpoint.json`、日志、inputs 快照和临时文件必须显式设置 POSIX 600 或通过 Windows ACL 校验，失败立即终止；
   - 在权限校验通过后，将用户指定的规格与全部工单文件复制到 `temp/implement-runs/<run-id>/inputs/`，记录路径映射和 SHA-256 checksum。逐个校验快照文件权限，后续 Worker 与协调者统一引用该不可变快照；

4. **依赖预热与隔离验证**：

   - 在根项目按现有包管理器机制准备只读公共缓存；不要假设根工作树的 `node_modules` 或构建输出会出现在独立 worktree，也不要让 Worker 共享写入依赖锁或构建目录；
   - 每个 Worker worktree 创建后，先按项目实际机制验证依赖可见性和局部测试入口。缺依赖时，只能在该 worktree 的隔离路径安装，或暂停派工等待补齐环境；
   - 预热完成后再次执行 `git status --porcelain`。如果 lockfile、受跟踪生成物或其他文件被改动，立即停止并报告，不能继续使用原基线。

5. **建立 Coordinator 独立工作树**（不污染用户主工作区）：

   ```bash
   umask 077
   mkdir -p "$REPO_ROOT/temp/implement-runs/<run-id>"
   chmod 700 "$REPO_ROOT/temp/implement-runs/<run-id>"
   git worktree add -b integrate/<spec-slug>-<run-id> "$REPO_ROOT/temp/implement-runs/<run-id>/coordinator" HEAD
   ```

   主协调者的合并、工单回写提交、受影响测试、全量测试与评审均在此工作树内执行。

### 阶段二：事件驱动调度与 Worktree 生命周期

禁止低效轮询。**仅在以下事件发生时重新计算就绪前沿（Frontier）**：

- 某一工单合入集成分支（变为 `integrated`）；
- 某一 Worker 终态退出（`completed`、`failed`、`blocked`、`interrupted`）；
- 用户解除阻塞或执行人工恢复。

**并发控制**：调度器根据阶段一形成的运行配置和实时事件维护有效并发。任一时刻的 Worker 数不得超过引擎能力、模型/供应商配额、宿主安全资源估计、Frontier 宽度和用户确认范围中的最小值；资源或配额未知时从 1 个 Worker 开始，最多一次增加一个槽位。Frontier 再大也不能无限铺开；收到 429、过载、超时或资源压力事件后，自动降载或暂停，并等待新的事件或用户指令再恢复。各引擎按以下统一 Worker Adapter 合约调度，不支持并发子代理的引擎退化为单 Worker 串行：
`launched(session_id, engine, model)` -> `completed(result)` / `failed(error_class)` / `interrupted` / `effects_unknown`。

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

#### 2. Worker 独立施工

- 遵循 `implement` 精准修改与 `tdd`。
- 仅修改工单授权文件，不改无关代码与共享配置。
- **测试范围**：仅跑工单直接相关的局部测试，严禁在此执行全量测试。
- 完成后在独占分支提交，向协调者回报不可变结构：
  `(ticket_id, attempt, base_commit, head_commit, test_command, test_summary, clean_status)`。
  其中 `test_summary` 仅包含结构化状态与关键结论，原始详细日志必须经脱敏与限长截断后单独存为 run 内部日志文件，不得直接塞入回报结构。
- **严禁向集成分支执行任何 merge 或 push**。

#### 3. 主协调者串行整合（预检合并）

在 coordinator 工作树下单线程处理：

1. **基线核验**：核验 Worker 回报的 `base_commit` 是否合法。

2. **预检合并（不自动提交）**：
   在 coordinator 工作区执行：

   ```bash
   git merge --no-ff --no-commit implement/<run-id>/<ticket-id>/<attempt>
   ```

3. **受影响范围验证与提交**：

   - 在未提交的合并工作态下，运行该工单受影响测试：
     - **测试通过**：

       ```bash
       git commit -m "integrate: ticket <ticket-id> (attempt <attempt>)"
       ```

       在 coordinator 工作树中更新工单状态并提交：

       ```bash
       git commit -m "docs(ticket): complete ticket <ticket-id>"
       ```

       工单状态置为 `integrated`；
       **安全清理 worktree**：核验 Worker 绝对路径合法、进程已退出、在该路径下核验 `git status --porcelain --untracked-files=all` 为空后执行：

       ```bash
       WORKER_WT_PATH=$(realpath "$REPO_ROOT/temp/implement-runs/<run-id>/worktrees/<ticket-id>/<attempt>")
       git worktree remove "$WORKER_WT_PATH"
       git branch -d implement/<run-id>/<ticket-id>/<attempt>
       ```

     - **测试失败或合并冲突**：
       **立即安全回滚**：

       ```bash
       git merge --abort
       ```

       保留原现场与分支，工单置为 `failed`，绝不留下脏工作区。

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
3. **安全收口**：若存在未提交的预检合并，立即执行 `git merge --abort` 退出；若仍有活跃 Worker 正在运行，必须向其发出停止信号或显式标记为挂起孤儿态；受影响工单置为 `interrupted`，现场完整保留，**禁止在此状态下为该工单直接派发新 attempt**，等待用户决定恢复或接管。

### 3. 协调者崩溃恢复序列 (Crash Recovery)

恢复仅支持在同一主机/文件系统上进行（不支持跨机搬迁）。协调进程重启或重连后，按以下序列恢复：

1. **接管互斥锁**：扫描 `temp/implement-runs/`，读取 `run.lock`。比对 PID 与启动时间确认原进程已死亡后，重新排他抢占接管；
2. **复用集成上下文**：核验 `integrate/<spec-slug>-<run-id>` 分支与 coordinator 工作树。完好则直接复用，**严禁再次执行带 `-b` 的创建命令**；
3. **清理僵尸 Worker**：读取 `checkpoint.json`，核验活跃会话。状态仍为 `claimed` 或 `running` 但进程已死亡的 Worker，工单状态置为 `interrupted`，保留 worktree 现场；
4. **重建 Frontier**：基于集成分支已 `integrated` 的提交和冻结快照，重新计算就绪前沿，恢复派工。

### 4. 状态恢复路径与交接 (Handoff)

- **解除单单阻塞 (blocked -> ready)**：补齐凭据或修正配置后，重新激活该工单放入 frontier。
- **失败工单重试 (failed / interrupted -> ready)**：保留失败 attempt 现场作为审计，递增 attempt 编号（如 `<ticket-id>/attempt-2`），建立全新隔离路径，从最新 integration tip 切出新分支重新派发。
- **用户交接 (Handoff 衔接)**：需要跨 Agent 或人工交接时，调用 `handoff`。仅交接 `run-id`、`REPO_ROOT`、集成分支名、checkpoint 状态与工单 DAG 完成度；**严禁将原始未脱敏日志与凭据写入交接文件**。
- **清理门槛**：仅处于 `integrated` 终态的 worktree 允许正常移除；未整合的失败现场保留用于排查，不参与正常清理门槛。

---

## 五、全量验收与收尾交付

1. **工单清零**：确认所有工单均达 `integrated` 终态。
2. **全量回归测试**：在 coordinator 工作区集中执行全量自动化测试套件。
3. **架构与代码评审**：
   - 调用 `code-review` 对集成分支相对于基线的整体改动全面审查。
   - 评审意见在 coordinator 工作区或开修复 attempt 针对最新 tip 修正，修正后**必须重新运行受影响测试与全量回归测试**，直至评审闭环。
4. **收尾归档**：
   - 评审闭环后，全局 run 置为 `reviewed` -> `finished`。

   - **安全注销 Coordinator 工作树**：主协调进程退出 coordinator 目录回到根目录（`cd "$REPO_ROOT"`），确认 clean 后移除：

     ```bash
     cd "$REPO_ROOT"
     git worktree remove $(realpath "$REPO_ROOT/temp/implement-runs/<run-id>/coordinator")
     ```
5. **交付收口 (按项目边界执行)**：
   - 交付终点：**经过全量测试验证与评审闭环的集成分支（`integrate/<spec-slug>-<run-id>`）**，并向用户汇报集成报告与 review 证据。
   - **红线**：未经用户明确授权，严禁擅自将集成分支 `git merge` 到主干、推送到远程仓库或提交 PR；规格说明亦不擅自归档。
