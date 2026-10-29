# 消息路径

> 本模块只处理已经由主 skill 选择的消息路径,不重新判断交付方式,也不执行文件路径.

## 模式说明

消息路径会启动一个全新的独立 Agent 会话来接手后续工作,而不是在当前会话里拉起子代理.启动前请确认好运行环境.

## 保存临时中转文件

参考 [文件交付模块](./file-delivery.md) 的路径规则,在项目根的 `.agents/handoff/` 目录下保存一份交接快照作为中转文件,文件名格式为 `handoff-<YYYYMMDD-HHMMSS>.md`.

## 环境判断

消息路径目前支持 Herdr 和 tmux 两种环境.

1. 在当前 shell 中执行环境检查:

   ```sh
   test "${HERDR_ENV:-}" = 1 && echo IN_HERDR || echo NOT_IN_HERDR
   test -n "${TMUX:-}" && echo IN_TMUX || echo NOT_IN_TMUX
   ```

   如果使用 PowerShell,执行对应检查:

   ```powershell
   if ($env:HERDR_ENV -eq "1") { "IN_HERDR" } else { "NOT_IN_HERDR" }
   if ([string]::IsNullOrEmpty($env:TMUX)) { "NOT_IN_TMUX" } else { "IN_TMUX" }
   ```

2. 检查结果按以下优先级判断:
   - 输出 `IN_HERDR` 时,使用 Herdr 环境(即使同时输出 `IN_TMUX`,也以 Herdr 为准).
   - 输出 `NOT_IN_HERDR` 且 `IN_TMUX` 时,使用 tmux 环境.
   - 两种环境都不满足,或者检查命令无法正常执行时,保留已经生成的中转文件并把绝对路径告诉用户,停下来如实说明当前环境不支持消息交付,不要去猜测或者擅自改走文件路径.

## 启动接手 Agent

1. **确定 CLI**:默认使用当前会话正在运行的同一个 Agent CLI(pi、codex 或 claude).不要根据模型名、pane 标题或窗口名猜测 CLI;当前 CLI 无法确认时停止执行并如实说明.如果用户指定了要用的 Agent、模型或思考等级,以用户的要求为准.用户的要求如果超出下表范围,停下来如实说明.
2. **读取配置**:如果目标 CLI 和当前会话一致,从当前环境准确读取正在使用的模型和思考等级,使用完全一致的配置启动新会话,不要凭感觉乱填.跨 CLI 交接或者读不到准确参数时,使用目标 CLI 的默认配置并在回复里说明.

| CLI    | 启动命令格式(首条消息作为位置参数) | 模型参数                | 思考等级参数                         |
| ------ | ---------------------------------- | ----------------------- | ------------------------------------ |
| pi     | `pi [选项] "首条消息"`             | `--model <provider/id>` | `--thinking <档位>`                  |
| codex  | `codex [选项] "首条消息"`          | `-m <模型>`             | `-c model_reasoning_effort="<档位>"` |
| claude | `claude [选项] "首条消息"`         | `--model <别名或ID>`    | `--effort <档位>`                    |

各 CLI 的模型与思考等级读取方法:

- **pi**:读取环境变量 `PI_PROVIDER` 与 `PI_MODEL` 拼成模型 ID,`PI_REASONING_LEVEL` 作为思考等级.
- **codex**:读取 `~/.codex/sessions/` 下最新 rollout 文件中 turn_context 的 `model` 与 `effort`;如果读不到,再读取 `~/.codex/config.toml`.
- **claude**:读取 `~/.claude/projects/` 当前项目中对应会话 `.jsonl`里的 `model` 字段;读不到则读取 `~/.claude/settings.json`.

3. **首条指令格式**:
   新会话的启动首条消息统一采用以下格式(交接内容全在中转文件里,首条消息直接指路、明确严格的清理时机与唯一路径):
   `读取 <中转文件绝对路径>，确认目标和第一步动作没有关键冲突后推进下一步工作；在第一步顺利启动且未报错后，只删除该绝对路径下的中转文件复核不存在；若第一步无法启动或发现关键冲突则保留该文件并向用户说明原因`

4. **环境执行命令**:
   - **Herdr 环境**:按总纲《Herdr 协作》布局规则执行,命令语法以当前环境 `herdr --skill` 或 `herdr <组> --help` 为准.
   - **tmux 环境**:打开新窗口并在其中执行已拼装好的目标 CLI 启动命令,把固定首条消息作为位置参数传入(例如 `tmux new-window -n handoff -c /path/to/workdir pi --model <model> "首条消息"`).
   - 启动过程中如果报错,如实向用户报告具体原因.如果中转文件已经生成但新会话启动失败,保留该中转文件并把完整绝对路径告诉用户.

## 交付完成确认

新会话成功启动并注入首条消息后,消息交付即告完成.在 Herdr 环境下,以返回中目标 Agent 对应的 `agent_prompted` 事件作为送达证据(按总纲《Herdr 协作》执行);送达后向用户汇报新会话已启动以及接手的第一步动作,不需要在终端里无限期等待或强求接手方发回汇报.
