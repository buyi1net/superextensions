# register-task.ps1 — 在 VM 内注册并启动驱动计划任务（脚本跑在 VM 上，不由本机直调）。
# 四个关键点（缺一不可，都是踩坑换来的）：
#   Interactive LogonType       进交互桌面会话，避开 session 0（SSH/WinRM 会话看不到 GUI）
#   -WindowStyle Hidden         不留可见黑窗口——真人会把黑窗口当垃圾关掉，驱动无提示死掉
#   RunLevel Highest            提权，操作被测应用不因 UAC 掉权限
#   ExecutionTimeLimit Zero     不限时，防系统默认 72h 杀长驻任务
# 用法：.\register-task.ps1 [-TaskName vm-gui-driver] [-WorkDir C:\temp] [-User <控制台用户名>]
# 前提：<WorkDir>\driver.ps1 已部署（用 vm.py put 上传）；-User 默认当前用户，
#       必须是登录了控制台桌面的那个账号（先用 quser 确认）。
param(
  [string]$TaskName = 'vm-gui-driver',
  [string]$WorkDir = 'C:\temp',
  [string]$User = $env:USERNAME
)
$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}\driver.ps1"' -f $WorkDir)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep 2
'task: ' + (Get-ScheduledTask -TaskName $TaskName).State
