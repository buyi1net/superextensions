# init-env.ps1 — 在 VM 内初始化/重建驱动运行环境（幂等，可反复跑；快照/还原点回滚后一键重建）。
# 步骤：1) 建 <WorkDir>；2) 校验 driver.ps1 已在（没有就报错，先用 vm.py put 上传全套脚本）；
#       3) 给了 -TargetExe 和 -TargetProcess 就写 target.txt（launch/kill 的目标，每次覆盖）；
#       4) 调同目录的 register-task.ps1 注册并启动驱动。
# 用法：.\init-env.ps1 [-WorkDir C:\temp] [-TaskName vm-gui-driver] `
#         [-TargetExe <exe路径，空格用__占位>] [-TargetProcess <进程名，不带.exe>]
# 前提：driver.ps1、register-task.ps1 已上传到 <WorkDir>（register-task.ps1 须与 init-env.ps1 同目录）。
param(
  [string]$WorkDir = 'C:\temp',
  [string]$TaskName = 'vm-gui-driver',
  [string]$TargetExe = '',
  [string]$TargetProcess = ''
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$driver = Join-Path $WorkDir 'driver.ps1'
if (-not (Test-Path $driver)) {
  throw "driver.ps1 not found in $WorkDir - upload scripts first, e.g. vm.py ... put driver.ps1 $WorkDir/driver.ps1"
}
if (($TargetExe -ne '') -ne ($TargetProcess -ne '')) {
  throw '-TargetExe and -TargetProcess must be given together'
}
if ($TargetExe -ne '') {
  $target = Join-Path $WorkDir 'target.txt'
  [System.IO.File]::WriteAllLines($target, @($TargetExe, $TargetProcess), [System.Text.Encoding]::Default)
  'target: ' + $target
}
$register = Join-Path $PSScriptRoot 'register-task.ps1'
if (-not (Test-Path $register)) {
  throw "register-task.ps1 not found next to init-env.ps1 ($PSScriptRoot) - upload it too"
}
& $register -TaskName $TaskName -WorkDir $WorkDir
