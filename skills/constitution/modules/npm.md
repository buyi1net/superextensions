# NPM手册

> npm 平台政策变化快，本文政策类条目一律写成条件式（以实际报错、官方页面实时状态为准）；政策的新鲜度由维护方负责核验，不依赖使用方比对日期。命令写法、终端选择、超时纪律按[《命令行基本功》](./command-shell.md)；registry 连不上、网络代理问题看[《网络代理》](./network.md)。

## 总则

agent 在 npm 发布链路上最先撞的不是 npm 本身，是三层约束，后面的坑全是这三层的展开：

1. **npm 自动接管 2FA 挑战（弹浏览器、等确认）要求 stdin 和 stdout 都被识别为 TTY。** agent 的 bash 是管道环境，这个条件不成立，两条命令的表现不同：login 默认走 web 授权，登录链接在 TTY 检查之前就输出到 stdout，所以能后台跑；publish 的挑战要 npm 接管浏览器流程，没有 TTY 就死。
2. **npm 的日志和错误输出只做尽力脱敏，别赌它。** 登录链接被刻意以未打码形式输出到 stdout；`_logs` 只做尽力脱敏，不保证清干净，不要当登录链接的来源，也不要假设它存了完整链接。要拿链接给用户，读 stdout 重定向落盘的临时文件。
3. **`name@version` 一旦发布不可复用。** 版本内容不能覆盖，unpublish 之后这个版本号也不能再用；unpublish 本身受平台政策约束、不可撤销。所以发布前把摘要（包名、版本、目标 registry、dist-tag、access、文件数）给用户过目：确认的不是「可以发了」，是「要发的就是这个东西」；包名、版本、可见性的变更都是用户决策。

人机分工：agent 独立做「查」的部分（registry、身份、版本、打包边界）；过 2FA 挑战要人坐在浏览器前确认，弹出的终端窗口里跑的命令归用户，login 由 agent 后台跑（见「终端与 2FA」）。**发布成没成，agent 靠事后对 registry 查询确认，不靠看窗口**。

## 终端与 2FA

**发布要有带 TTY 的终端；人在场的发布走弹窗，CI 走 trusted publishing（见下）。** 弹终端窗口的命令同时含嵌套引号和多语句，属复杂命令，按[《命令行基本功》](./command-shell.md)写成 `.ps1`/`.sh`/`.cmd` 脚本再执行；Windows 示例进窗口后自动执行 publish，macOS 的 `open -a Terminal <包目录>` 只开终端不执行命令，publish 由用户手敲。窗口只是人工入口：窗口里的发布结果不返回给 agent，验证发布永远用 registry 查询，这是唯一完成判据。

**login 后台跑：** stdout 重定向到包目录外的临时文件，从文件里抓登录链接，在对话里给用户一次，用后即弃。这个文件是受保护的凭据载体：链接交出去后就删掉文件，不进包、不进交接、不进报告。grep 抓不到链接时，看自己重定向的文件分三种情况：文件不存在是重定向路径不对；文件里是报错是登录流程不对；文件里只有授权提示是还没落盘，等两秒重抓。在 timeout 约束内重试，不无限等。用户回报完成后，对目标 registry 重跑 `npm whoami`（目标确认见「认证」），命令成功才算登录完成，口头回报不作数。

**CI / 无桌面：** CI 里没有 TTY 也没有人，别现场过 2FA，发版走 npm 官方的 trusted publishing（OIDC）。前提：包已在 npm 上存在，包设置页才有入口，全新包的第一次发布走人工路径。配置入口在 npmjs.com 的包设置里，把 GitHub workflow 配成 trusted publisher，按需选 publish、stage publish（显式暂存发布，先审批再上架）或两者都开。注意 OIDC 只在 publish 过程中生效，`whoami` 查不出 OIDC 状态；配置没完成就停下报告用户，不走降级捷径。

**winpty 是假出路**（经验观察，非源码结论，适用范围未验证）：伪 TTY 在无真实控制台环境下自身崩溃，报错来自 winpty 不是 npm，按 winpty 环境问题处理。

**终端窗口会锁目录：** 终端窗口停在工作目录（CWD）里时，这个目录被窗口锁住，后续删除报 EPERM，发布完关掉窗口。EPERM 的来源不止锁目录一种：编辑器、杀毒软件占用，或权限不足，按逐项排查处理。

## 认证

**先搞清楚目标 registry，再谈认证。** 认证按 registry 区分，两个配置会改写发布目标：`@scope:registry`（scope 级）和 `package.json` 的整个 `publishConfig`（含 registry、dist-tag、access）。确认目标要三处都看过：默认 registry（`npm config get registry`）、scope registry（查 `~/.npmrc` 和项目 `.npmrc` 里的 `@scope:registry` 行）、publishConfig（看 `package.json`）。对默认 registry 的 `whoami` 通过证明不了另一个 registry 可发布：whoami、view、publish、login 全对目标 registry 做，命令显式指向目标用 `--registry=<目标>`。`npm login` 会把认证写进 user `.npmrc`。

**whoami 的语义边界：** 通过只证明身份，不证明对这个包有写权限，写权限要到 publish 才暴露；publish 被拒且消息指向权限时按无权限报告用户，不重试。

**2FA 的两种来源，分开看：**

- 账号设置页观察：只见 security-key / passkey 入口，没找到 Authenticator App（TOTP）选项。
- 官方文档与 CLI：CLI 的 2FA 设置仍支持 authenticator OTP（走 otpauth 协议；官方安全文档列认证器为支持项）。

两种并存，别下「平台只有 passkey」的绝对结论；排障按实际错误消息分流，三种信号都可能出现：EOTP、E401 + one-time pass、classic OTP（Authenticator App 生成的那种）。passkey 电脑手机各注册一把、恢复码离线备份，这两件只能用户在 npmjs.com 账号设置里做，agent 提醒到位即可。

**强制 2FA 有两级：** 账号级「Require two-factor authentication for write actions」和包级「Require two-factor authentication and disallow tokens」。包级会连 token 路径一起禁掉，GAT、OIDC 和交互式发布的可用性都要重新确认。deprecate、dist-tag、owner 这类拿不准的操作一律按会触发挑战处理，先备好交互终端。

**发布时的挑战：** 交互终端里走 web 授权，浏览器确认后命令自动继续。授权会在使用者的机器上缓存，缓存生效时命令直接过、agent 可自己跑；缓存失效当场弹挑战，非 TTY 环境会死，所以发布前先备好交互终端。缓存有效期未文档化，别依赖。

**访问令牌的创建与使用：** granular token 官方只支持网页创建（npmjs.com → Access Tokens）。CLI 的 `npm token create` 带有 granular 参数，但官方文档明确 CLI 创建不受支持，不因 CLI 有参数就推荐它。用 token 时配进 `.npmrc` 的 `_authToken` 行（凭据文件的正常形态），不进命令行参数和历史，不写进交接和报告。

**带 Bypass 2FA 的 granular token：** 按 npm 官方页面实时状态判断。npm changelog 里关于限制 bypass token 直接发布的公告，与实际页面可能不一致，以页面为准，别当长期政策。token 不进命令行参数和历史，不写进任何产物。

## 发布

**打包边界与敏感扫描是两步，别混。** `npm pack --dry-run --json` 输出的是文件路径清单（`files`、`.npmignore`、生命周期脚本都会改写它），它的用途是定边界；敏感扫描扫的是边界内文件的实际内容，那份 JSON 只是路径清单，grep 它没有意义。dry-run 也会执行 `prepack`/`postpack`，不是完全无副作用的命令。宽网扫描，漏检不等于干净，命中停下报告用户：

```bash
grep -riEn "(api[_-]?key|token|secret|password|passphrase|private[_-]?key)[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_./+=-]{16,}|AKIA[0-9A-Z]{16}|npm_s?_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" <边界内的文件>
```

（把 dry-run 输出里 files 的 path 列表作为 grep 的输入）

**可见性有三个概念别混：** `private: true` 是禁止发布，报 EPRIVATE 发不出去，先把 package.json 里的这个字段清掉（经用户确认）再谈发布；`--access=public/restricted` 是 scoped 包的发布可见性；「把代码推到 GitHub 公开仓」是第三件不相干的事。npm 官方文档对 scoped 默认值的说法存在冲突，公开 scoped 包统一显式 `--access=public`，不赌默认值。

**裸名会撞 typosquat 防护：** 与已有包过近直接被拒（示例：pi-toolkit 因与 es-toolkit 相似被拒），报错信息会建议 scoped 名；改不改名是用户决策。

**版本核对：** `npm view <包名>@<版本> version`，查询报 E404 才能发，查到这个版本已存在就停，版本号用户定。全新包名报 E404 属预期。版本相关的两种拦截按消息文本识别，npm 抛的是普通 Error、没有 E403 码：消息含 `You cannot publish over the previously published versions` 是版本已发布；消息含 `Cannot implicitly apply the "latest" tag` 是已有更高版本且用默认 dist-tag，要求显式 `--tag`。

**结果不明先查后重试：** 超时、断网、窗口被关时，上传可能已经在服务端成功，直接重发会撞「版本已存在」；先对 registry 查这个版本，查到就算成功，查不到再重发。

**发布后的验证：** 普通公开发布，用同一 registry 的 `npm view <包名>@<版本>` 确认上架。全新包首次发布成功后查询报 E404（机理未定）：等几分钟再验，超半小时让用户去 npmjs.com → 头像 → Staged Packages 看包在不在暂存列表，审批完成后用 view 复验。任何 E404 先排查 registry 对不对、身份权限够不够，再考虑 Staged 暂存：权限不足的 E404 和暂存中长得一模一样。

**别走网页上传：** `npmjs.com/publish/<包名>` 已 404，发布一律走 CLI。

## dist-tag 与回滚

dist-tag 变更、deprecate、unpublish 同属对外写操作，影响下游使用者。对策：错误内容用新版本修复并视情况 deprecate 旧版；错误 dist-tag 指回已知良好版本；unpublish 受平台政策约束且不可撤销，只在用户明确要求时做。

## 日志

完整日志在 `<cache>/_logs/`（取最新用 `ls -t`），`npm config get cache` 查缓存根，Windows 默认 `%LocalAppData%\npm-cache\_logs\`。两个会让日志「消失」的配置：`logs-dir` 改位置、`logs-max=0` 关日志，拿不到日志先查这两项。`_logs` 的脱敏口径见总则：要拿登录链接只有 stdout 重定向可靠。

## 错误速查

| 错误信号 | 原因 | 对策 |
|---------|------------|---------|
| ENEEDAUTH | 未登录 | whoami 确认；login 走「终端与 2FA」；用 `--registry` 指向目标重试 |
| EOTP、E401 + one-time pass 或 classic OTP 提示 | 2FA 挑战 | 弹终端窗口重跑；按实际消息分流 |
| E403 | 权限、包策略或服务器拒绝 | 先看消息再归因，别自动当 2FA；权限类报告用户不重试 |
| EPRIVATE | `private: true` 禁止发布 | 清掉该字段（经用户确认）再发 |
| 消息含 `name too similar` | 裸名撞 typosquat 防护 | 报告用户定夺；改 scoped 名后带 `--access=public` |
| 消息含 `You cannot publish over` | 版本已发布（不是 E403） | 版本号用户定 |
| 消息含 `Cannot implicitly apply the "latest" tag` | 已有更高版本，默认 dist-tag 受阻 | 用户指定 `--tag` |
| 发布成功后查询 E404 | 可能 Staged 暂存未完成（机理未定） | 等几分钟重验；仅在有成功信号后这样归因；先排 registry/权限；超半小时用户查网页 Staged Packages |
| EPERM（Windows） | 目录被占用或权限不足：终端窗口、编辑器、杀毒、权限 | 关窗口、逐项排查 |
