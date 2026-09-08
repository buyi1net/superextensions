# 命令行基本功

> 给 Agent 用的 Windows 本机命令行操作指南。覆盖跨 shell 的通用规则和常见坑点。

## 总则

在 Windows 本机干活，命令通常从这三个地方之一执行：**`git-bash`**、**`cmd`**、**`PowerShell`**。这三套环境语法不同、转义规则不同，混着用的时候最容易翻车。

**总则：复杂命令不内联。** 什么算复杂？只要命令里带了双引号、带了 `$_` 这类变量、或者写了好几行、拼了好几条语句，沾上任何一条，都算复杂。这种命令别在命令行里硬凑引号和转义，按命令语言写成脚本：PowerShell 写 `.ps1`，用 PowerShell 的 `-File` 执行；Bash 写 `.sh`，用 bash 执行；CMD 写 `.cmd` 或 `.bat`，用 cmd 执行。换扩展名不会转换语法；要统一用 PowerShell，就先改写成 PowerShell 语法。脚本正文交给对应解释器读取，避免在外层命令行里反复转义。单条、没特殊字符的短命令，内联随便用。

`-File` 仍受执行策略约束。遇到策略报错，先用 `Get-ExecutionPolicy -List` 查原因，不把策略问题当成转义问题，也不擅自修改全局执行策略。

## 命令入口

### git-bash

`git-bash` 是 `MSYS` 环境，行为偏向 `Linux`，但跑在 `Windows` 上。就特别容易踩坑：

- **双引号里的 `$` 会被提前展开。** 双引号包住的 `$p`、`$_`、`$(...)`，`bash` 会当成变量先替换掉，命令传到真正执行的地方已经不是原来的样子了。所以如果要写 `PowerShell` 命令，一律用单引号包，别用双引号。
- **Windows 路径末尾的反斜杠会转义引号。** 比如 `"C:\dir\"`，末尾的 `\"` 会被 bash 理解成转义了引号，导致语法错误。记得去掉末尾反斜杠，或者写成 `"C:/dir/"`。
- 还有 `MSYS` 的路径转换，会试图把 `/v`、`/t` 这类参数当路径处理。真有这种情况就写文件绕过，别在命令行里纠缠。
- **GNU 工具会截胡 Windows 命令。** git-bash 的 `PATH` 里 GNU 版在前，`whoami /groups` 报 extra operand；`cmd //c` 和 PowerShell 裸调也一样中招，它们继承同一份 `PATH`。两条出路，都实测有效：**首选写进 `.ps1` 用完整路径**，如 `C:/Windows/System32/whoami.exe /groups`（PowerShell 不做 MSYS 参数转换，一步到位）；非要在 bash 里直接跑，就得**完整路径加 `MSYS2_ARG_CONV_EXCL='*'` 两个一起上**，只给完整路径时 `/groups` 仍会被 MSYS 路径转换吃掉。

发命令前可以先回显确认一遍，看命令到底长什么样、有没有被上层换掉内容。

### cmd

`cmd` 是 Windows 自带的传统命令行。语法跟 `PowerShell` 不是一回事，切记不要混着用。路径带空格就必须加引号，不然 `C:\Program Files\Codex` 会被劈成两截。但要注意 `cmd` 处理引号有自己的逻辑，有时候引号会被剥掉。所以复杂命令直接写脚本，不走引用链才是最优解。

### PowerShell

`PowerShell` 的版本差异比较大。现代 Windows 自带的 `powershell.exe` 通常是 5.1，`PowerShell 7` 使用 `pwsh.exe`。**使用前先用 `where.exe pwsh` 查可执行路径；本机和远端各自探测。** 这条命令默认只查当前目录和 `PATH`，找不到不等于没安装，还要检查已知安装位置或用户提供的工具目录。找到后启动该程序，用 `$PSVersionTable.PSVersion` 核实版本；它只显示当前 shell 的版本，不能替代查找。确认 `PowerShell 7` 可用就优先用，确实不可用才用 5.1。

`PowerShell 7` 支持 `&&`，能正确读取无 `BOM` 的 `UTF-8` 脚本，写文本默认使用 `UTF-8` 无 `BOM`。但外部程序、`Python` 和远端输出仍有各自的编码，读写两端不一致照样会乱码，不能指望换成 `pwsh` 就消除所有编码问题。

**如果只有 5.1 可以用，需要特别注意编码：**

- `Set-Content -Encoding utf8` 写出来的文件带 `BOM`，部分 `JSON` 解析器会拒绝读取；`YAML` 规范允许文档开头带 `BOM`，不能一概说带了就报错。写无 `BOM` 的 `UTF-8` 用 `[IO.File]::WriteAllText(绝对文件路径, 内容, [System.Text.UTF8Encoding]::new($false))`。这里传入已确认的绝对文件系统路径；.NET API 的相对路径不一定以 PowerShell 当前目录为基准。判断 `UTF-8` 文件是否带 `BOM`，检查前三个字节是否为 `239,187,191`（十六进制 `EF BB BF`）。`123,34` 只是 `{"` 的字节，不是 `BOM` 判据；无 `BOM` 的合法 `JSON` 也可以以 `{}` 或空白开头。
- Python 脚本输出报 `UnicodeEncodeError` 时，在脚本开头加 `sys.stdout.reconfigure(encoding='utf-8', errors='replace')`

如果实在太难用，可以向用户申请安装新版的 `pwsh`，这样以后可以少走很多弯路。

## SSH 远程

Windows 平台远程执行命令和传文件时，先检查 `plink.exe`、`pscp.exe` 在不在，如果不存在，直接问用户能不能提供，不要自己另找替代或绕路。这是“缺资源红线”在远程场景的具体化。另外注意：Windows 的 `OpenSSH` 服务端初始默认 shell 是 `cmd`，但管理员可以通过 `DefaultShell` 改成 `PowerShell` 或其它 shell。远端使用什么 shell 由服务端配置决定，不由 `ssh` 或 `plink` 决定。执行前先探一下远端 shell（跑 `ver`：输出版本号是 `cmd`，报“无法识别”是 `PowerShell`），再按它的语法显式调用需要的解释器，别默认远端一定是 `cmd` 或 `PowerShell`。

**无人值守：**plink 首次连一台主机，会交互式问"是否缓存主机密钥"，没人按 y 就永远停在那。所以非交互调用一律带 `-batch`：遇到要交互的场景直接报错退出，不等人。`-batch` 拒绝首连时，先拿主机指纹（用户给，或从可信渠道确认），用 `-hostkey SHA256:xxx` 显式写进命令，之后固定不变。指纹没确认就连，等于闭眼信中间人。

**认证：**关于私钥，`plink` 只认 `PuTTY` 的 `.ppk` 格式。手里是 `OpenSSH` 私钥（`id_rsa` 那种）要先用 `puttygen` 转；`puttygen` 没装就向用户申请。密码可以用 `-pwfile 密码文件`。`-pw 明文` 会进 `shell history` 和进程列表，等于明文落盘。密码文件分两类：**用户提供的长期凭据文件**（项目专用那种）只引用路径，不动内容、不顺手删；**agent 自己临时建的密码文件**，写清放哪、用完要么清掉要么明确交给用户接管。示例和对外文档里的密码一律占位符。

**传文件：**`plink` 只执行远程命令，传文件用 `pscp`，方向由参数顺序决定：`pscp 本地文件 user@host:远程路径` 上传，参数顺序反过来就是下载。

## 命令超时

写脚本的时候要留意命令的执行时长，别让工具等超时了。比如 `Test-NetConnection` 逐端口探测就很慢，测 7 个端口能跑满 120 秒。真需要批量测端口，别在命令行里逐个敲，写成脚本一次性跑完，脚本里自己控制超时。

所有长时间运行的命令都一样：能合并的就合并，该设超时就设超时，别让外层工具干等着超时报错。
