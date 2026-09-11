# 命令行基本功

> 给 Agent 用的 Windows 命令行操作手册。

## 总则

在 Windows 本机干活，命令通常从 `git-bash`、`cmd`、`PowerShell` 这三个入口之一执行。三套环境语法不同、转义规则不同，混着用的时候最容易被多层解析改掉命令。从 Linux 本机远程操作 Windows 时，外层换成系统 bash，`$` 展开和路径转义照样要处理；MSYS 参数转换是 git-bash 这一侧特有的坑。

**复杂命令别在命令行里硬拼。** 什么叫复杂？带变量、带管道、带嵌套引号、多行或多语句，沾一条就算。这种命令直接写成脚本：PowerShell 写 `.ps1` 配 `-File`，Bash 写 `.sh` 配 bash，CMD 写 `.cmd` 或 `.bat` 配 cmd。脚本正文交给对应解释器直接读取，省去外层转义的折腾。单条短命令，比如 `Set-Content C:\temp\cmd.txt 'snap'` 这种，直接跑就行，不用过度设计。

写脚本的时候注意：换扩展名不会自动转换语法。你想用 PowerShell 就得把逻辑改写成 PowerShell 语法，只把 `.cmd` 改成 `.ps1` 是没用的。

`-File` 执行仍然受 PowerShell 执行策略约束。碰到策略报错，先 `Get-ExecutionPolicy -List` 查一下原因，别把策略问题当成转义问题来折腾，也别顺手改全局策略。

**发命令之前先回显一遍**，确认实际传出去的命令长什么样，别只看拼接前的字符串。

## git-bash 入口

`git-bash` 是 MSYS 环境，行为偏向 Linux 但跑在 Windows 上。几个容易踩的坑：

**双引号里的 `$` 会被 bash 提前展开。** 双引号包住 `$p`、`$_`、`$(...)` 时，bash 会先把变量替换掉，命令传到真正执行的地方已经不是原来的样子了。所以往 PowerShell 传命令时，外层一律用单引号，别用双引号。注意单引号也不是万能的：它装不下代码里自己的单引号（PowerShell 的 `'literal string'` 是高频写法），遇到这种情况别在引号里套引号，按总则写脚本。

**Windows 路径末尾的反斜杠会转义引号。** 比如 `"C:\dir\"`，末尾的 `\"` 会被 bash 理解成引号被转义了，直接报语法错误。去掉末尾反斜杠，或者写成 `"C:/dir/"` 更省事。

**MSYS 参数转换和 GNU 同名程序是两个独立的坑，但经常一起出现。** 一方面，`/v`、`/t`、`/groups` 这类参数可能被 MSYS 当成路径来转换；另一方面，`PATH` 里 GNU 版程序排在 Windows 原版前面，`whoami /groups` 会报 `extra operand`，因为跑的是 GNU whoami，不认 `/groups`。从 git-bash 启动 `cmd` 或 PowerShell 时，它们继承同一份 `PATH`，所以换 shell 并不能解决同名程序问题。

**最省心的处理办法：把 Windows 原生命令写进 `.ps1`，用完整路径调用。** 比如在 `.ps1` 里这样写：

```powershell
& "$env:SystemRoot/System32/whoami.exe" /groups
```

PowerShell 不做 MSYS 参数转换，完整路径也避开了 GNU 同名程序，一步到位。

如果非要在 bash 里直接调，就得**完整路径加 `MSYS2_ARG_CONV_EXCL='*'` 两个一起上**，只给完整路径能解决同名程序问题，但 `/groups` 还是会被 MSYS 路径转换吃掉。

## cmd 入口

`cmd` 是 Windows 自带的传统命令行，语法跟 PowerShell 不是一回事，别混着用。

路径带空格必须加引号，不然 `C:\Program Files\Codex` 会被劈成两截。但 `cmd` 对首尾引号有自己的处理逻辑，跨 shell 传参时引号容易被剥掉。所以复杂命令直接写进 `.cmd` 或 `.bat`，不走引用链。

**批处理文件的编码和行尾：** `.bat` / `.cmd` 由 `cmd.exe` 按当前代码页解析，先用 `chcp` 查实际代码页，不凭系统语言猜（中文系统默认是 GBK，但别依赖这个默认）。用 GBK 就直接写中文；想用 UTF-8 则文件必须无 BOM，并在文件开头单独一行先执行 `chcp 65001`，再跑含中文的命令，带 BOM 的 UTF-8 会被并入首行命令，直接报错。行尾必须 CRLF，LF 会让 `goto` 跨块定位标签失败。

## PowerShell 入口

PowerShell 版本差异比较大。现代 Windows 自带的 `powershell.exe` 通常是 5.1，PowerShell 7 用 `pwsh.exe`。

**上来先干一件事：查有没有 7。** 跑 `where.exe pwsh` 看能不能找到。这个命令只查当前目录和 `PATH`，找不到不等于没装，顺手检查一下已知安装位置，或者问问用户工具目录在哪。找到后启动 `pwsh.exe`，用 `$PSVersionTable.PSVersion` 核实一下版本。确认 7 可用就优先用，实在没有才退回到 5.1。

**7 比 5.1 省心在哪：** 支持 `&&`，能正确读无 BOM 的 UTF-8 脚本，写文本默认无 BOM。但别指望换了 7 就能消灭所有编码问题，外部程序、Python 和远端输出各有各的编码，读写两端不一致照样乱码。

**如果只能用 5.1，这几个编码坑要单独处理：**

- `.ps1` 文件本身：UTF-8 必须带 BOM，否则中文会被按 ANSI 误读。这点和 `.bat` 不能带 BOM 刚好相反，别搞混。
- 写 JSON 文件：`Set-Content -Encoding utf8` 会带 BOM，部分解析器拒绝读取（YAML 规范允许 BOM，遇到读取失败看具体解析器，不能一概归因于 BOM）。写无 BOM 用这个：

```powershell
[IO.File]::WriteAllText($absolutePath, $content, [System.Text.UTF8Encoding]::new($false))
```

注意 `$absolutePath` 用确认过的绝对路径，.NET API 的相对路径不一定以 PowerShell 当前目录为基准。

- 判断文件有没有 BOM：看文件开头三个字节是不是 `239,187,191`（十六进制 `EF BB BF`）。别拿 `123,34`（`{"`）当判据，无 BOM 的合法 JSON 也可以以 `{}` 或空白开头。

**编码速查：**

| 场景 | 编码要求 |
|------|----------|
| PowerShell 7 的 `.ps1` | UTF-8 无 BOM |
| PowerShell 5.1 的 `.ps1` | UTF-8 带 BOM |
| `.bat` / `.cmd` | 跟 `chcp` 查到的当前代码页走；用 UTF-8 需无 BOM + 首行 `chcp 65001` |
| PowerShell 5.1 写 JSON | 无 BOM，用 `[IO.File]::WriteAllText` |

**Python 输出乱码：** 报 `UnicodeEncodeError` 时先区分是 stdout、stderr 还是文件写入。确认是标准输出编码不匹配、接收端也按 UTF-8 读取时，在脚本开头加 `sys.stdout.reconfigure(encoding='utf-8')`。标准错误用 `sys.stderr` 对应处理。允许丢字符的展示输出才加 `errors='replace'`，数据输出保留严格报错，replace 会把编不了的字符静默换成 `?`，数据就坏了。

实在被 5.1 搞烦了，可以直接跟用户申请装个新版 `pwsh`，以后少走很多弯路。

## 远程操作

**先确认工具有没有。** Windows 本机远程操作，标准工具箱是 `plink.exe` 和 `pscp.exe`。用之前先确认工具在不在，没有就问用户能不能提供，不要自己找替代或绕路。这是"缺资源红线"在远程场景的具体化。

Linux 本机远程操作 Windows，用系统自带的 `ssh` / `scp`，密码认证配 `sshpass`，密钥认证不需要。putty 工具箱只在 Windows 本机用，Linux 侧不适用。

**远端 shell 不一定是 cmd。** Windows OpenSSH 服务端初始默认 shell 是 `cmd`，但管理员可以通过 `DefaultShell` 改成 PowerShell 或其它。远端用什么不由 `ssh` 或 `plink` 决定，**执行前先确认远端实际 shell**：

- 跑 `ver`：输出版本号是 `cmd`，报"无法识别"一般是 PowerShell，但命令不识别只说明这次探测没成功，不能据此认定另一种 shell
- 跑 `$PSVersionTable.PSVersion`：输出版本就是 PowerShell

确认之后，再按它的语法显式调用需要的解释器，别默认远端一定是 cmd。

**无人值守和主机指纹。** `plink` 首次连接会交互式问"是否缓存主机密钥"，没人按 y 就永远停住。所以**非交互调用一律带 `-batch`**，遇到交互直接报错退出，不等。`-batch` 拒绝首连时，拿主机指纹（用户给，或从可信渠道确认，现场连接返回的指纹不能单独作为可信依据），用 `-hostkey SHA256:xxx` 写进命令，之后沿用。**指纹没确认就连，等于闭眼信中间人。**

**认证。** 私钥：`plink` 只认 PuTTY 的 `.ppk` 格式，手里是 OpenSSH 私钥（`id_rsa` 那种）先用 `puttygen` 转，没装就找用户要。密码：用 `-pwfile 密码文件`，别用 `-pw`，`-pw` 明文会进 shell history 和进程列表，等于明文落盘。

**密码文件分两类：**

- 用户提供的长期凭据文件（项目专用），只引用路径，不动内容，不顺手删
- Agent 自己临时建的，记清放哪，用完要么删掉，要么明确交给用户接管

**示例和文档里一律用占位符**，不贴真凭据。

**传文件。** `plink` 只执行远程命令，传文件用 `pscp`，方向看参数顺序：`pscp 本地文件 user@host:远程路径` 是上传，把源和目标互换就是下载。

## 超时

Agent 跑命令，最大的时间浪费就是傻等：命令不会自己退出，agent 就一直挂在那里等，直到外层工具超时，或者一直占着不放。所以核心动作只有一个：**跑之前先确认这条命令会不会自己退出，不会退出的必须包 timeout 再跑。**

**预判退出行为。** 交互式（等输入）、常驻监听、watch 类命令都不会自己退，一律包 timeout；拿不准的，按不会退出处理。

**timeout 按预期完成时间定，不按最大耐心定。** 预期 1 分钟就给 2 分钟，给外层工具留出收尾时间；没有基准，就用短超时试跑拿基准。别用大数值兜底，那只会把挂死的时间拖得更长。超过预期 3 倍还没返回，按挂住处理。

**长跑命令一律重定向日志**，无人值守的输出写到 `temp/` 下的日志文件。挂住时第一动作是看日志和进程树，区分“已完成未退出”和“没跑完”：前者直接取结果，后者查清原因再动进程，**不是重跑**。

**慢命令批量做。** 比如 `Test-NetConnection` 逐端口探测很慢，测 7 个端口就能跑满 120 秒。这类命令写成脚本一次性跑完，脚本里自己控制每次探测的超时和整批时长。注意：仅仅把命令挪进脚本不会减少等待，要真的控制单次和整批的时长。

**进自动化链路的入口，跑完必须自动退出。** 新增或改动会进自动化链路的入口（npm scripts、测试入口）时，无人值守跑完必须自动退出且退出码可见：汇总打印后显式退出进程。需要人工交互或常驻监听的脚本，不注册进自动化入口，只手动跑。
