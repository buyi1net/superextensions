# driver.ps1 — vm-gui-verify 会话内驱动：部署到 VM 后由计划任务（register-task.ps1）拉起，
# 跑在真人控制台会话里（避开 session 0），才有资格看屏幕、点鼠标、收按键。
# 协议：轮询 <WorkDir>\cmd.txt，读到新命令就执行，回执写 <WorkDir>\stamp.txt；每 30 秒心跳写
# <WorkDir>\driver.log（尸检靠它）。命令按内容去重：重发同一命令前必须先改写 cmd.txt。
# 命令集（空格分隔；路径/文本里的空格一律写成 __ 占位符）：
#   launch              启动目标应用（目标由 <WorkDir>\target.txt 配置）
#   run <exe> [args..]  启动任意程序
#   snap <png路径>      虚拟屏全截图存 PNG
#   click <x> <y>       移动鼠标并左键单击
#   keys <文本>         SendKeys 键入（特殊键写法见 SendKeys 语法，如 {ENTER}、^c）
#   fg                  回执前台窗口标题（FG: [...]，发按键前先核对）
#   esc                 发送 Esc 键
#   kill                强杀目标进程（target.txt 第 2 行）
#   die                 回执 BYE 并退出驱动
# target.txt 格式（用 init-env.ps1 -TargetExe/-TargetProcess 生成）：第 1 行 = 启动 exe 路径
# （空格用 __），第 2 行 = 进程名（不带 .exe），第 3 行起可选 = launch 附加参数。
param([string]$WorkDir = 'C:\temp')

$dir = $WorkDir
$stamp = Join-Path $dir 'stamp.txt'
$cmdf = Join-Path $dir 'cmd.txt'
$logf = Join-Path $dir 'driver.log'
"driver started $(Get-Date -Format o)" | Add-Content $logf
$heartbeat = [datetime]::MinValue
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class U {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
function Read-Target {
  # 返回 target.txt 的非空行数组；launch/kill 的目标都从这取
  $tf = Join-Path $dir 'target.txt'
  if (-not (Test-Path $tf)) { throw 'target.txt missing - generate it with init-env.ps1 -TargetExe/-TargetProcess' }
  $lines = @(Get-Content $tf | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
  if ($lines.Count -lt 2) { throw 'target.txt needs 2 lines: exe path (spaces as __) and process name' }
  return $lines
}
$last = ''
while ($true) {
  if (Test-Path $cmdf) {
    $raw = Get-Content $cmdf -Raw -ErrorAction SilentlyContinue
    if ($null -ne $raw -and $raw.Trim() -ne '' -and $raw.Trim() -ne $last) {
      $last = $raw.Trim()
      $out = 'OK'
      try {
        $p = $last -split '\s+'
        switch ($p[0]) {
          'launch' {
            $t = Read-Target
            $exe = $t[0].Replace('__', ' ')
            if ($t.Count -ge 3) {
              Start-Process -FilePath $exe -ArgumentList ($t[2..($t.Count-1)])
            } else {
              Start-Process -FilePath $exe
            }
          }
          'run' {
            # run <exe-path> [args...]：路径里的空格用 __ 占位
            if ($p.Count -ge 3) {
              Start-Process -FilePath ($p[1].Replace('__', ' ')) -ArgumentList ($p[2..($p.Count-1)])
            } else {
              Start-Process -FilePath ($p[1].Replace('__', ' '))
            }
          }
          'snap' {
            $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
            $bmp = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $bmp.Size)
            $bmp.Save($p[1].Replace('__', ' '), [System.Drawing.Imaging.ImageFormat]::Png)
            $g.Dispose(); $bmp.Dispose()
          }
          'click' {
            [U]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null
            Start-Sleep -Milliseconds 250
            [U]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 60
            [U]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
          }
          'keys' {
            [System.Windows.Forms.SendKeys]::SendWait($p[1].Replace('__', ' '))
          }
          'esc' {
            [U]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 40
            [U]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero)
          }
          'fg' {
            $h = [U]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 256
            [void][U]::GetWindowText($h, $sb, 256)
            $out = 'FG: [' + $sb.ToString() + ']'
          }
          'kill' {
            $t = Read-Target
            Stop-Process -Name $t[1] -Force -ErrorAction SilentlyContinue
          }
          'die' {
            'BYE' | Set-Content $stamp
            exit
          }
        }
      } catch {
        $out = 'ERR: ' + ($_ | Out-String)
      }
      $out | Set-Content $stamp
    }
  }
  if ((Get-Date) - $heartbeat -gt [timespan]::FromSeconds(30)) {
    $heartbeat = Get-Date
    "alive $(Get-Date -Format o) last=$last" | Add-Content $logf
  }
  Start-Sleep -Milliseconds 350
}
