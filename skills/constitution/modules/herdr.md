# Herdr 协作

> 本文件管 Agent 在 Herdr 中协作的通用纪律:何时调度、怎么启动、怎么派活、怎么等结果。命令语法以当前环境 `herdr --skill` 输出的 herdr skill 为权威,本文件不复制命令参考,只写协作纪律;两者冲突时,命令语法以 herdr skill 为准,行为纪律以本文件为准。

## 环境自检

执行任何 Herdr 命令前,先确认自己是否运行在 Herdr pane 内:

```bash
test "${HERDR_ENV:-}" = 1 && echo IN_HERDR || echo NOT_IN_HERDR
```

- 输出 `IN_HERDR`:继续按本文件执行。
- 输出 `NOT_IN_HERDR`:停止。不从桌面版或独立终端控制 Herdr,需要控制时告知用户,由用户决定怎么办。

在 Herdr 内时,命令语法和能力以本地 `herdr --skill`、`herdr <组> --help` 为权威,本地二进制是一手资料,查询不花 token;如无必要禁止联网搜索 Herdr 文档、教程或示例,本地资料查不到的键名和参数先查对方 CLI 的 `--help`,仍查不到再去联网搜索 Herdr 的资料。

## 调度边界

先判断该不该用 Herdr,不得把"任务复杂"直接等同于"使用 Herdr":

- 当前 Agent 内部能独立完成的并行调查、审查、实现或上下文隔离,优先用本客户端原生子 Agent(Pi 用 `Agent` 插件,Codex 用原生子 Agent)。
- Herdr 管理独立、可见、可持续存在的顶层会话,不是当前 Agent 的子 Agent 系统。
- 只有用户明确要求,或任务确实需要独立窗口、不同客户端或模型、跨会话持续运行、复用现有会话时,才用 Herdr。
- 上层规则禁止原生子 Agent 时,不得把 Herdr 当绕过限制的通道;需要新的调度授权先交还用户。

## 启动辅助会话

### 布局

- 默认在自己所在的 workspace 和 tab 内，从自己所在 pane 向右分出辅助区：一个辅助 pane 就直接向右分割；两个时先向右分割第一个，再对右侧 pane 向下分割第二个，辅助区成上下两格，自己留在左侧。当然，如无用户明确授权，不得新建 workspace 或 tab 来放辅助 pane。
- 分割时默认用 `--cwd` 指定目标项目根(项目需要切换到其它目录工作的时候听用户的),用 `--no-focus` 保持用户焦点。
- 只在任务真正需要时创建 pane,不预建空 pane;`herdr pane split` 的方向只用 `right` 或 `down`,不连续盲目分割凑布局。

### 启动流程

用四步流程;Windows 下不得使用已知不可靠的 `herdr agent start`,也不得用 `intercom` 创建新会话(`intercom` 只用于已有会话之间通信):

1. 分割:一个辅助 pane 用 `herdr pane split --current --direction right --cwd <项目根> --no-focus`;要两个时对右侧 pane 再执行 `herdr pane split --pane <右侧-pane-id> --direction down --cwd <项目根> --no-focus`，得到右侧上下两格。
2. 启动:`herdr pane run <pane-id> '<启动命令>'` 手动启动全新 Agent 进程。
3. 命名:`herdr pane rename <pane-id> <本轮唯一名称>`,名称用于后续派活和读结果,不含会误导归类的信息。
4. 派活:等 Herdr 识别出可交互 Agent 后,按"派活与等待"送达任务。

启动前核对目标 pane 的 cwd 和前台进程:必须是目标项目根中的空闲交互式 shell,不带编辑器、旧 Agent 或其他前台任务。

### 启动参数

指定模型和思考等级的写法:

| CLI | 模型 | 思考等级 |
|---|---|---|
| pi | `pi --model <provider/id>` | `--thinking <off\|minimal\|low\|medium\|high\|xhigh\|max>` |
| codex | `codex -m <model>` | `-c model_reasoning_effort="<level>"` |
| claude | `claude --model <别名或ID>` | `--effort <low\|medium\|high\|xhigh\|max>` |
| opencode | TUI 不带模型参数,模型由 opencode 配置决定;非交互用 `opencode run -m <provider/model>` | `--variant <level>` |

- pi 的思考档位以 `pi --help` 列出的为准;codex 的可用档位看 `~/.codex/config.toml` 的 `enabled-reasoning-efforts`,用户配置了哪些就用哪些;claude 和 opencode 的档位以各自 `--help` 输出为准,opencode 的 `--variant` 档位随 provider 变化。
- 拿不准的参数查对方 `--help` 或本机配置,不猜、不联网搜、不给对方传它不认识的参数。

### 无会话测试

测试对话不能有会话文件落地(避免污染测试环境)时:

- pi 加 `--no-session`,本次会话不写会话文件。
- codex 交互式没有对应参数,会话文件照常落地;只有 `codex exec --ephemeral` 支持不落盘跑非交互任务。
- claude 和 opencode 当前没有无会话参数,会话照常落地。

需要无会话环境但 CLI 不支持时,如实告知用户,由用户决定换用支持的 CLI 还是事后自行清理;不自行删除会话文件。

## 派活与等待

1. 派活:`herdr agent prompt <名字> "任务" --wait --timeout <ms>`,用服务器端事件等待,不做客户端轮询。
2. 送达证据:只有返回中目标 Agent 对应的 `agent_prompted` 事件能证明送达;退出码为零、pane 存在、Agent 处于 idle 都不算。
3. 未送达:只检查一次目标 Agent 是否实际收到,确认未收到后才重发,不连续重发同一任务。
4. 等结果:`herdr agent wait <名字> --until done|blocked`,只等完成或阻塞事件;Agent 进入 `blocked` 时只读阻塞原因,交用户决定,不用轮询绕过。
5. 读结果:`herdr agent read <名字> --source recent-unwrapped --lines N`。
6. 状态来源:以 Herdr 集成主动上报的状态为准,不另写状态探测脚本,不翻其他 Agent 客户端的源码研究状态机制。

### 派活文本与回传

- 派活前核对目标 Agent 的项目归属和工作目录;只给同一项目或用户明确指定的 Agent 派活,禁止把项目 A 的任务派给项目 B 的 Agent。
- 派活文本自带协作说明:交代背景、目标、验收标准,并写明完成后在输出末尾给出完整汇报。
- 被调度方(收到来自其他 Agent 的任务时)同样命中本文件:完成后把结论整理成输出末尾一段完整汇报,包含做了什么、改动位置、验证证据;中间过程不指望对方盯梢,对方靠一次 `herdr agent read` 就能拿到全部结论。

## 失败处理

- 命令失败或超时:先读一次当前 Agent 或 pane 的现场;能复用的残留 pane 继续用,确定废弃的立即精确关闭,不带失败残留连续开新窗口。

## 禁止事项

- 禁止在 `HERDR_ENV` 不为 1 时执行 Herdr 命令。
- 禁止用 `herdr agent start` 启动 Agent,禁止用 `intercom` 创建新会话。
- 禁止循环读取 pane 输出等待完成,禁止未经允许轮询日志文件,禁止自写 Agent 状态检查脚本。
- 禁止未核对项目归属和工作目录就跨项目派活。
- 禁止启动失败后不检查、不复用、不清理就继续拆分新 pane。

## 完成检查

1. 环境自检通过,本次任务确实满足调度边界,没有把原生子 Agent 能干的活外派成顶层会话;
2. 目标 Agent 的项目归属、工作目录、pane 前台进程都已核对;
3. 送达有 `agent_prompted` 证据,等待用的是事件等待,没有轮询;
4. 失败产生的 pane 已复用或精确清理,没有幽灵会话;
5. 命令语法来自当前 `herdr --skill` 或 `--help`,协作纪律以本文件为准。
