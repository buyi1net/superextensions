#!/usr/bin/env bash
# 人机交互复现循环（Human-in-the-loop reproduction loop）。
# 复制这个文件，编辑下面的步骤，然后运行它。
# 代理（AI）执行脚本，用户在终端里按提示操作。
#
# 用法：
#   bash hitl-loop.template.sh
#
# 两个内置辅助函数：
#   step "<说明>"          → 显示说明，等待用户按回车继续
#   capture VAR "<问题>"   → 显示问题，把用户的输入存到变量 VAR 里
#
# 最后会把所有捕获到的值打印成 KEY=VALUE 的格式，方便代理解析。
#
# `capture` 会把用户输入回显到终端，代理能看到。
# 所以用 capture 来记录观察结果，把"登录"这类操作留给 step 让用户自己完成。

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [按回车继续] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

# --- 编辑从这里开始 ---------------------------------------------------------

step "打开浏览器访问 http://localhost:3000 并登录。"

capture ERRORED "点击'导出'按钮。有没有报错？(y/n)"

capture ERROR_MSG "把错误信息粘贴过来（没有就填 'none'）："

# --- 编辑到这里结束 ---------------------------------------------------------

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
printf 'ERROR_MSG=%s\n' "$ERROR_MSG"
