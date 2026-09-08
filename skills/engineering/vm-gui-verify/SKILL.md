---
name: vm-gui-verify
description: 对 Windows VM 做远程 GUI 验证时使用，覆盖连接选路、交互会话驱动、截图点击键入和环境重建。
---

# 远程 VM GUI 验证

接管用户已有的 Windows VM，验证真实桌面上的应用。不处理 Linux GUI，也不引入 Sandbox、Arena、UFO 或整套视觉自动化平台。

## 1. 连接决策树

1. VM 在可控制的 Hyper-V / VirtualBox / VMware 宿主上，且已有直连条件：优先考虑 PowerShell Direct / VBoxManage guestcontrol / vmrun，免走网络连接。本 skill 的脚本控制器只实现 SSH；hypervisor 直连列为选路分支，尚未实测，不把它当成现成脚本接口。直连也不能绕过非交互会话的 GUI 隔离。
2. 走网络连接：22 端口开，直接走 SSH。plink/pscp 优先，paramiko 兜底；缺工具先找用户要，安装依赖先获授权。
3. 只有 5985 可用、准备走 WinRM：先在本机查 `Get-Service WinRM` 和 `Get-PSDrive WSMan`。服务未运行或 `WSMan:` 盘符不存在，直接放弃这条路，别靠改注册表/GPO 连续试错。健康检查通过也不等于认证已配好；裸 IP 连接不能因为远端在域内就省略 TrustedHosts 等认证条件。
4. 都不通：停下找用户，交代已验证的通道和缺口。

跨 shell、凭据和工具箱纪律先读 [命令行基本功](../../constitution/modules/command-shell.md)。连接前从用户或 VM 控制台确认主机指纹；控制台可用 `ssh-keygen -lf C:\ProgramData\ssh\ssh_host_ed25519_key.pub` 核对对应密钥。密码文件由用户按凭据纪律提供，明确存放位置、访问权限和用完清理方式；不把对话中的密码复制进文件。

本机控制器是 [scripts/vm.py](./scripts/vm.py)。必填 `--host`、`--user`、`--password-file`、`--hostkey`；当前只支持密码文件认证，没有密钥参数。`--transport auto|plink|paramiko` 默认 `auto`，在 `--putty-dir`（默认 `D:\MyProgram\AiBin\putty`）同时找到 plink.exe 和 pscp.exe 就选 putty，否则尝试 paramiko。putty 分支固定使用 `-batch`、`-hostkey`、`-pwfile`；先确认现有版本支持这些参数，旧版不支持时找用户补齐工具。

| 本机动作 | 实际行为 |
|---|---|
| `run '<命令>'` | 交远端默认 shell 执行，通常是 cmd；不自动转成 PowerShell |
| `runps '<PS 语句>'` | 远端先用 `where.exe pwsh` 探测，pwsh 优先、powershell 5.1 兜底，再用 UTF-16LE Base64 的 `-EncodedCommand` 下发 |
| `put <本地路径> <远端路径>` | 上传文件；远端父目录须已存在 |
| `get <远端路径> <本地路径>` | 下载文件；先确认本轮产物已生成 |

命令输出带 `OUT:`、`ERR:`、`EXIT:` 前缀，读回执时核对 OUT 中的内容和退出结果。`--port` 默认 22，`--timeout` 默认 60 秒，长命令显式调大；`runps` 的探测与执行各用一次该超时，不是整个调用的总时限。当前 paramiko 的 put/get 没把该超时传给 SFTP，不能把它当作传输总时限；需要受控传输超时时使用 plink/pscp 分支。`runps` 的编码只保护 Python 收到的语句，不能补救本机 shell 已展开的变量；复杂命令仍写 `.ps1` 上传后用 `-File` 执行。

以下示例在本机 git-bash 执行。先替换占位符；`<skill目录>` 是本 skill 的实际路径，`<密码文件>` 指已有文件，不是密码原文。示例显式选 plink/pscp，便于约束传输超时；确需 paramiko 时先确认依赖可用，再改 `--transport`。后文的 `vm` 都指这个本地辅助函数，不是新的脚本子命令。

```bash
vm() {
  python '<skill目录>/scripts/vm.py' --host '<VM地址>' --user '<控制台用户>' --password-file '<密码文件>' --hostkey 'SHA256:<已确认指纹>' --transport plink "$@"
}
vm run 'quser'
```

## 2. session 0 隔离与驱动方案

SSH/WinRM 的非交互会话看不到也点不到真人桌面，直接从那里启动 GUI 不能作为验证结果。先用 `quser` 确认有已登录、可操作的 console 会话，再把驱动放进该用户的交互会话。没有桌面会话就停下找用户登录。

[register-task.ps1](./scripts/register-task.ps1) 注册并启动计划任务，四项一起保留：`LogonType Interactive`、`RunLevel Highest`、`-WindowStyle Hidden`、`ExecutionTimeLimit ([TimeSpan]::Zero)`。隐藏窗口防止用户把驱动黑窗口关掉，不限时防止系统终止长驻任务。[driver.ps1](./scripts/driver.ps1) 启动时写日志，循环中约每 30 秒向 `driver.log` 写心跳；卡在命令里时心跳也会停，不能只凭任务存在就判驱动活着。

实际参数与限制：

- `driver.ps1 [-WorkDir C:\temp]`：在指定目录读写协议文件。
- `register-task.ps1 [-TaskName vm-gui-driver] [-WorkDir C:\temp] [-User <控制台用户名>]`：`-User` 默认执行注册脚本的用户名。当前任务动作固定调用 `powershell.exe`，并未探测 pwsh；`-WorkDir` 只改变 driver.ps1 的启动路径，没有作为参数传给 driver，协议目录仍为默认 `C:\temp`。因此这套注册流程目前只用默认目录，不要宣称自定义工作目录已打通。
- [init-env.ps1](./scripts/init-env.ps1) 支持 `-WorkDir`、`-TaskName`、`-TargetExe`、`-TargetProcess`；后两项必须同时给或同时省略。它建目录、校验驱动、写目标配置，再调用同目录的注册脚本，没有 `-User` 参数。下面流程要求 SSH 用户就是 console 用户。

从零部署或回滚后重建，按这条顺序执行：先确认账号和桌面，再建远端目录、上传三份 PS 脚本，最后运行初始化。`vm.py` 留在本机，不上传。初始化不包含安装被测应用，应用及测试数据按项目自己的恢复流程准备。

```bash
vm runps 'New-Item -ItemType Directory -Force -Path C:\temp'
vm put '<skill目录>/scripts/driver.ps1' 'C:/temp/driver.ps1'
vm put '<skill目录>/scripts/register-task.ps1' 'C:/temp/register-task.ps1'
vm put '<skill目录>/scripts/init-env.ps1' 'C:/temp/init-env.ps1'
vm runps 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\init-env.ps1 -TargetExe <应用exe路径_空格写成__> -TargetProcess <进程名_不带.exe>'
```

`target.txt` 第 1 行是 exe 路径（空格写成 `__`），第 2 行是进程名（不带 `.exe`）；第 3 行起可选 launch 参数。初始化脚本只生成前两行，没有启动参数选项。注册会替换同名任务，初始化给了目标参数就会覆盖目标配置；重建前确认该任务和目录归本次验证使用。已有驱动时先通过本轮 `die` 回执确认退出，不能假设重新注册会清理所有旧实例。旧驱动退出后、重启前清空本次验证的 `cmd.txt`，避免重放旧动作；尤其残留 `die` 会让新驱动立即退出。

完成标准：任务运行在正确用户下，`driver.log` 有本次启动记录和新心跳，再通过下一节的本轮 `fg`、`snap` 回执确认能读到桌面。只有初始化输出 `task: Running` 还不够。

## 3. 指令协议

驱动约每 350 毫秒读一次 `C:\temp\cmd.txt`，执行后写 `stamp.txt`。这是单槽文件协议，不是队列：一轮只发一条，等本轮回执后再发下一条，避免覆盖未消费命令。

| 写入 cmd.txt 的内容 | 动作与回执 |
|---|---|
| `launch` | 按 target.txt 启动目标应用 |
| `run <exe> [args...]` | 在桌面会话启动程序；与 vm.py 的 `run` 远程 shell 动作不同 |
| `snap <PNG路径>` | 截整个虚拟屏幕，保存 PNG；保存目录须已存在 |
| `click <x> <y>` | 按桌面绝对坐标移动并左键单击 |
| `keys <文本>` | SendKeys 键入；如 `{ENTER}`、`^c`，不是原样文本粘贴 |
| `fg` | 回 `FG: [前台窗口标题]`；只查询，不激活窗口，也不返回进程身份 |
| `esc` | 给当前前台窗口发 Esc |
| `kill` | 按 target.txt 第 2 行强杀同名进程；先确认不会误杀用户的同名实例 |
| `die` | 写 `BYE` 并退出驱动 |

普通动作成功回 `OK`，捕获的异常回 `ERR: ...`。当前未知命令也可能落到默认 `OK`，所以只用表内命令，不能拿任意 `OK` 证明送达。`kill` 会静默忽略停止进程的错误，没找到目标也能回 `OK`；是否退出还要查进程。

命令按空白切分。`run` 的 exe 路径、`snap` 的 PNG 路径、`keys` 的文本内空格写成 `__`；`keys` 只读一个 token。`run` 的后续参数和 `target.txt` 的 launch 参数没有 `__` 解码，不能把这条占位约定推广到所有参数；复杂参数用已上传的脚本承载。非 ASCII 路径和文本尚未验证：driver 固定用 PS5.1，pwsh 写入的无 BOM UTF-8 文件可能被它按 ANSI 读取。使用中文前先核对 cmd.txt / target.txt 的写入编码与读端一致，不把乱码当应用故障。

**键入和 Esc 前先发 `fg`，核对前台确实是被测应用。** 标题不足以区分窗口时，再看截图或进程信息。前台不对就先定位并激活目标窗口，再重新 `fg`；管理员 PowerShell 也可能抢前台，不能盲发按键。

**回执必须属于本轮。** 每次写命令前记录远端 `stamp.txt` 的修改时间；写入后带截止时间等待它更新，再核对回执内容、当前命令和驱动日志。时间用远端文件时间前后比较，不靠本机与 VM 时钟一致。回执没有请求 ID，也不回显普通命令；只有单个驱动、单个发令者且没有未完成命令时，这组证据才可对应到本轮。旧 `OK`、固定睡两秒、任务还在，都不能代替核对。

驱动按去掉首尾空白后的命令内容去重。相邻两次同命令不会再执行；清空文件或只改时间也不能重置去重。需要重复时，先执行一条不同的安全命令并确认回执，例如带本轮唯一文件名的 `snap`，再发原命令。

下面是一轮截图的发令与取证示例，不是可整段无等待连跑的命令链：

```bash
# 发令前保存旧回执时间；首次没有文件是正常情况
vm runps 'Get-Item C:\temp\stamp.txt -ErrorAction SilentlyContinue | Select-Object LastWriteTimeUtc'
vm runps 'Set-Content C:\temp\cmd.txt "snap C:\temp\screen-<本轮唯一编号>.png"'
# 带截止时间等待新回执，再读取内容；尚未更新就不要往下拉图
vm runps 'Get-Item C:\temp\stamp.txt | Select-Object LastWriteTimeUtc'
vm runps 'Get-Content C:\temp\stamp.txt'
# 确认修改时间已更新且回执为 OK，再检查本轮唯一文件确实存在
vm runps 'Get-Item C:\temp\screen-<本轮唯一编号>.png'
vm get 'C:/temp/screen-<本轮唯一编号>.png' '<本地截图路径>'
```

## 4. 双向验证

每个 GUI 动作分两步确认，证据分别留：

1. **送达**：动作前核对前台窗口，动作后核对本轮驱动回执。鼠标还要确认落点确在目标控件内。
2. **响应**：拉取本轮截图独立观察，再核对应用状态文件或其它可观察结果。驱动 `OK` 只说明指令执行到了，不代表应用接受了输入，更不代表业务成功。

点击位置优先按窗口几何计算，例如已知窗口尺寸和居中位置。vision 识别只兜底；退化框、落在图片或目标窗口外的结果直接丢弃，重新定位，不按错框硬点。裁剪图坐标先换回原图，虚拟屏截图坐标再加虚拟屏原点，才能交给 `click` 的桌面绝对坐标。

坐标点歪、被测应用的预览模式只展示界面而故意不接业务回调、按键送给其它窗口，都可能表现为“应用没反应”。先排除送达问题，再按应用的模式和预期判断是否为功能 bug。验收至少覆盖“连接 → 注册驱动 → 截图 → 点击 → 键入”，并含一次环境重建；每步都有送达和响应证据才算完成。

## 5. Known Pitfalls

以下实证来自 ChatGPT-Launcher 主会话（2026-09-08 04:08–06:35 UTC，601 行 JSONL；会话文件名 `2026-09-08T04-08-06-626Z_01a07f33-a6e2-7235-a7ee-6fd10e93fefd.jsonl`），行号据研发材料《远程VM验证沉淀-报错对照表》核对，场景细节据《远程VM验证与命令行基本功沉淀-规格说明》。`L` 指该会话行号；这两份研发材料和原始会话不随 skill 分发，仅作来源标识，操作不依赖它们。

1. **长远程命令超时 + 被测应用锁文件。** 实证 L491：旧 vm.py 的 120 秒限制触发 paramiko `PipeTimeout`；L493–L497 是占用诊断与恢复现场。规格说明记录：移动约 300MB 版本目录时，用户验收留下的 6 个 Codex 进程锁住文件。长操作显式配 `--timeout`、后台化或先停已确认的占用者；项目自己的恢复脚本要幂等，重跑不破坏已完成部分。例如这次版本目录恢复按“停占用者 → 完成移动 → 修 junction”执行，不是本 skill 内置的业务恢复脚本。另有 GUI exe 继承 stdout 占住 SSH 通道的社区经验，本会话未发生、未独立核验；作为预防，GUI 启动走驱动协议与 SSH 通道分离。
2. **VM 快照/还原点回滚抹掉整个环境。** L539 用户确认恢复过还原点；L545 的 `sftp.put` 报 ENOENT，L546 建目录后 L547 上传成功，计划任务和伪造安装也没了。遇到 `FileNotFoundError` 先查远端目录，不先怪传输库。恢复先查 `quser`、任务状态和目录清单，缺什么重建什么；本 skill 的驱动环境按第 2 节重新建目录、上传脚本、运行 `init-env.ps1`，被测应用另按项目流程恢复。
3. **VM 整机失联。** L531 连接超时，L533 确认 ping 丢包 100%、22 端口关闭；L594 再次连接超时。关机/睡眠是当时的推测，不是由这些输出证实的原因。把它当整机可用性问题处理：一次探活确认后，将已完成结果落盘，告知用户并等恢复，不反复重试，也不继续修改 WinRM 配置。
4. **真人共享 VM 桌面。** 开始前约定谁在操作，不能假设独占。L398、L453 两次 `Command aborted`；第二次中断前已有取图成功和后续操作输出，中断不等于整条命令链没执行。规格说明还记录用户 Escape 中断、手动跑完更新并改掉状态文件。中断后重新确认前台、应用状态和本轮待验步骤，再续跑；可见驱动窗口会被误关，保留 Hidden 和心跳日志。
5. **截图还没生成就去拉。** L345 发 snap 后等两秒，读到旧 `OK` 仍拉图失败；L347 查到任务 Ready、旧 stamp 和未消费命令。L404 再次拉图失败，L406 日志停在此前 run 指令。先按第 3 节确认 stamp 属于本轮，再核对本轮唯一 PNG 存在后下载；回执不更新就查驱动日志和任务状态，不把旧图当新响应。
