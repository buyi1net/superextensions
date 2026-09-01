# 消息路径

> 本模块只处理已经由主 skill 选择的消息路径，不重新判断交付方式，也不执行文件路径。

## 保存中转文件

 读取[文件交付模块](./file-delivery.md)确认好文件应该保存在哪以及如何保存之后，执行保存前自查，然后再做环境判断。 

## 环境判断

消息路径只支持 Herdr 和 tmux，暂不兼容 Windows Terminal 或其它终端标签页、分屏工具。

1. 在当前会话使用的 shell 中执行：

   ```sh
   test "${HERDR_ENV:-}" = 1 && echo IN_HERDR || echo NOT_IN_HERDR
   test -n "${TMUX:-}" && echo IN_TMUX || echo NOT_IN_TMUX
   ```

   如果当前使用 PowerShell，执行等价检查：

   ```powershell
   if ($env:HERDR_ENV -eq "1") { "IN_HERDR" } else { "NOT_IN_HERDR" }
   if ([string]::IsNullOrEmpty($env:TMUX)) { "NOT_IN_TMUX" } else { "IN_TMUX" }
   ```
2. 输出 `IN_HERDR` 时，使用 Herdr；即使同时输出 `IN_TMUX`，也以 Herdr 为准。
3. 输出 `NOT_IN_HERDR` 且 `IN_TMUX` 时，使用 tmux。
4. 输出 `NOT_IN_HERDR` 且 `NOT_IN_TMUX` 时，停止执行并说明当前环境不支持消息交付。检查命令无法执行或结果无法确认时，同样停止执行；不得猜测，也不得改走文件路径。

## 启动目标 Agent

1. 目标 CLI 默认使用当前会话实际运行的 Agent。不要根据模型名称、pane 标题或窗口名称猜测 CLI；当前 CLI 无法确认时停止执行。
2. 用户指定了 Agent、模型或思考等级时，以用户指定为准。用户指定的 Agent 不在下表时，停止执行并说明不支持，不改走文件路径。
3. 目标 CLI 与当前会话相同时，读取当前会话的准确模型和思考等级，使用相同 CLI、相同模型和相同思考等级启动新会话；不得凭记忆填写参数。
4. 各 CLI 的启动参数如下：

| CLI    | 启动（首条消息为位置参数） | 模型                    | 思考等级                             |
| ------ | -------------------------- | ----------------------- | ------------------------------------ |
| pi     | `pi [选项] "消息"`         | `--model <provider/id>` | `--thinking <档位>`                  |
| codex  | `codex [选项] "消息"`      | `-m <模型>`             | `-c model_reasoning_effort="<档位>"` |
| claude | `claude [选项] "消息"`     | `--model <别名或ID>`    | `--effort <档位>`                    |

5. 模型和思考等级按以下顺序确定：

   - 用户指定了模型或思考等级时，以用户指定为准。
   - 目标 CLI 与当前会话相同时，读取当前会话的准确模型和思考等级，使用相同 CLI、相同模型和相同思考等级启动新会话；不得凭记忆填写参数。
   - 跨 CLI 交接或读不到精确值时，各 CLI 的模型 ID 不通用，不继承目标参数，使用目标 CLI 默认配置，并在简报中说明。

| CLI    | 模型与思考等级的读取                                         |
| ------ | ------------------------------------------------------------ |
| pi     | 环境变量：`PI_PROVIDER` 与 `PI_MODEL` 拼模型 ID，`PI_REASONING_LEVEL` 取思考等级 |
| codex  | 按修改时间最新的 rollout 文件（`~/.codex/sessions/` 下的 `rollout-*.jsonl`）中 turn_context 的 `model` 与 `effort`；读不到时用 `~/.codex/config.toml` 的 `model` 与 `model_reasoning_effort` |
| claude | 会话记录（`~/.claude/projects/` 下当前项目目录中、文件名为 `CLAUDE_CODE_SESSION_ID` 的 `.jsonl`）里 assistant 消息的 `model` 字段；读不到时用 `~/.claude/settings.json` 的 `model`。思考等级没有稳定落盘来源，读不到就按上一条降级 |

6. 启动命令的首条消息固定为一条短指令：`读取 <中转文件绝对路径>，按文件中的接手确认流程开始交接`。交接正文全在中转文件里，不塞进命令行。
7. Herdr 环境：在当前 workspace 的当前 tab 内开 pane 并启动目标 CLI，不新建 workspace 或 tab；命令语法以当前环境 `herdr --skill` 或 `herdr <组> --help` 为权威。
8. tmux 环境：用 `tmux new-window -n handoff -c <工作目录>` 开新窗口，在其中启动目标 CLI。
9. 启动或注入失败时如实报告失败原因；中转文件已写但未送达时保留它，并把路径告诉用户。
