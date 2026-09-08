"""vm.py — vm-gui-verify 远程控制器：在本机执行，经 SSH 操作 Windows VM。

动作：
    run  "<命令>"        远端默认 shell（cmd）原样执行，回显 OUT/ERR/EXIT
    runps "<PS 语句>"    远端 PowerShell 执行：先探测 pwsh（PS7）优先、powershell 5.1 兜底，
                         语句经 -EncodedCommand（Base64 UTF-16LE）下发，无引号/转义问题
    put  <本地> <远程>   上传文件
    get  <远程> <本地>   下载文件

连接参数（全部必填，凭据不进命令行、不进代码）：
    --host <地址>          --user <用户名>
    --password-file <文件>  密码文件，首行为密码；用完自行处理，示例一律占位符
    --hostkey <SHA256:xxx>  主机指纹，两条传输分支都强制校验，未确认指纹不得连接。
                            获取方式：VM 控制台执行
                            ssh-keygen -lf C:\\ProgramData\\ssh\\ssh_host_ed25519_key.pub
                            或向用户索取

可选参数：
    --transport auto|plink|paramiko  默认 auto：本机找到 plink/pscp 就用 putty，否则 paramiko
    --putty-dir <目录>     putty 工具目录，默认 D:\\MyProgram\\AiBin\\putty
    --port 22              --timeout 60  单条命令/传输超时秒数，长耗时操作务必调大（如 --timeout 600）

退出码：0 成功；远端命令非零按其退出码返回；2 连接/校验失败；3 超时。
纪律：plink/pscp 一律 -batch 非交互；密码走 --password-file（-pw 明文禁用）。
      见 D:\\MyProgram\\AiBin\\putty\\AGENTS.md。

示例（占位符，实际值向用户或项目索取）：
    python vm.py --host <VM地址> --user <用户> --password-file <密码文件> \\
        --hostkey SHA256:<指纹> run "quser"
    python vm.py ... runps "Get-Process | Select-Object -First 3"
    python vm.py ... put driver.ps1 C:/temp/driver.ps1
    python vm.py ... get C:/temp/stamp.txt ./stamp.txt
"""
import argparse
import base64
import hashlib
import os
import socket
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DEFAULT_PUTTY_DIR = r"D:\MyProgram\AiBin\putty"
DEFAULT_TIMEOUT = 60  # 秒


def dec(b):
    """远端输出按 utf-8 → gbk 顺序解码，都不行再替换坏字节。"""
    for enc in ("utf-8", "gbk"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", "replace")


def read_password(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        pw = f.readline().rstrip("\r\n")
    if not pw:
        raise SystemExit("密码文件为空: " + path)
    return pw


def encoded_ps(ps):
    """-EncodedCommand 需要 Base64(UTF-16LE)。"""
    return base64.b64encode(ps.encode("utf-16-le")).decode("ascii")


def norm_fingerprint(fp):
    fp = fp.strip()
    return fp[7:] if fp.upper().startswith("SHA256:") else fp


class PuttyTransport:
    """plink/pscp 分支：一律 -batch + -hostkey + -pwfile，凭据不落命令行。"""

    def __init__(self, a):
        self.plink = os.path.join(a.putty_dir, "plink.exe")
        self.pscp = os.path.join(a.putty_dir, "pscp.exe")
        self.target = "%s@%s" % (a.user, a.host)
        self.base = ["-batch", "-P", str(a.port), "-hostkey", a.hostkey,
                     "-pwfile", a.password_file]

    def run(self, cmd, timeout):
        argv = [self.plink, "-ssh", self.target] + self.base + [cmd]
        try:
            p = subprocess.run(argv, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise TimeoutError("plink 超过 %ds 未返回: %s" % (timeout, cmd[:80]))
        return dec(p.stdout), dec(p.stderr), p.returncode

    def put(self, local, remote, timeout):
        self._pscp(local, "%s:%s" % (self.target, remote.replace("\\", "/")), timeout)

    def get(self, remote, local, timeout):
        self._pscp("%s:%s" % (self.target, remote.replace("\\", "/")), local, timeout)

    def _pscp(self, src, dst, timeout):
        argv = [self.pscp] + self.base + [src, dst]
        try:
            p = subprocess.run(argv, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise TimeoutError("pscp 超过 %ds 未返回: %s -> %s" % (timeout, src, dst))
        if p.returncode != 0:
            raise SystemExit("pscp 失败(退出码 %d): %s" % (p.returncode, dec(p.stderr).strip()))
        print("transfer ok")

    def close(self):
        pass


class ParamikoTransport:
    """paramiko 分支：显式校验主机指纹（不用 AutoAddPolicy 首连盲信）。"""

    def __init__(self, a, password):
        import paramiko  # 延迟导入：有 putty 的机器不必装 paramiko
        t = paramiko.Transport((a.host, a.port))
        try:
            t.start_client(timeout=a.timeout)
            key = t.get_remote_server_key()
            fp = base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode("ascii").rstrip("=")
            if fp != norm_fingerprint(a.hostkey):
                raise SystemExit("主机指纹不匹配：远端 SHA256:%s != 预期 SHA256:%s（先确认指纹再连，不盲信）"
                                 % (fp, norm_fingerprint(a.hostkey)))
            t.auth_password(a.user, password)
        except SystemExit:
            t.close()
            raise
        except Exception:
            t.close()
            raise
        self.t = t

    def run(self, cmd, timeout):
        ch = self.t.open_session(timeout=timeout)
        ch.settimeout(timeout)
        ch.exec_command(cmd)
        try:
            out = dec(ch.makefile("rb", -1).read())
            err = dec(ch.makefile_stderr("rb", -1).read())
            code = ch.recv_exit_status()
        except (socket.timeout, TimeoutError):
            raise TimeoutError("paramiko 超过 %ds 未返回: %s" % (timeout, cmd[:80]))
        finally:
            ch.close()
        return out, err, code

    def put(self, local, remote, timeout):
        self._sftp().put(local, remote.replace("\\", "/"))
        print("transfer ok")

    def get(self, remote, local, timeout):
        self._sftp().get(remote.replace("\\", "/"), local)
        print("transfer ok")

    def _sftp(self):
        return self.t.open_sftp()

    def close(self):
        self.t.close()


def parse_args():
    ap = argparse.ArgumentParser(
        description="Windows VM SSH 控制器（putty 优先，paramiko 兜底），详见文件头注释")
    ap.add_argument("action", choices=["run", "runps", "put", "get"])
    ap.add_argument("operands", nargs="*", help="run/runps: 1 个命令; put/get: 本地与远程路径")
    ap.add_argument("--host", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--password-file", required=True)
    ap.add_argument("--hostkey", required=True, help="主机指纹，格式 SHA256:xxx，未确认不得连接")
    ap.add_argument("--port", type=int, default=22)
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="秒，默认 %d" % DEFAULT_TIMEOUT)
    ap.add_argument("--transport", choices=["auto", "plink", "paramiko"], default="auto")
    ap.add_argument("--putty-dir", default=DEFAULT_PUTTY_DIR)
    a = ap.parse_args()
    need = 1 if a.action in ("run", "runps") else 2
    if len(a.operands) != need:
        raise SystemExit("%s 需要 %d 个参数，收到 %d 个: %s" % (a.action, need, len(a.operands), a.operands))
    return a


def make_transport(a, password):
    plink = os.path.join(a.putty_dir, "plink.exe")
    pscp = os.path.join(a.putty_dir, "pscp.exe")
    has_putty = os.path.isfile(plink) and os.path.isfile(pscp)
    if a.transport == "plink" or (a.transport == "auto" and has_putty):
        if not has_putty:
            raise SystemExit("--transport plink 但找不到 %s / %s" % (plink, pscp))
        return PuttyTransport(a)
    return ParamikoTransport(a, password)


def main():
    a = parse_args()
    if not os.path.isfile(a.password_file):
        raise SystemExit("密码文件不存在: " + a.password_file)
    try:
        t = make_transport(a, read_password(a.password_file))
    except SystemExit:
        raise
    except Exception as e:
        print("CONNECT FAILED:", type(e).__name__, e, file=sys.stderr)
        sys.exit(2)
    try:
        if a.action == "run":
            out, err, code = t.run(a.operands[0], a.timeout)
        elif a.action == "runps":
            probe_out, _, _ = t.run("where.exe pwsh", a.timeout)
            interp = "pwsh" if "pwsh" in probe_out.lower() else "powershell"
            cmd = "%s -NoProfile -ExecutionPolicy Bypass -EncodedCommand %s" % (
                interp, encoded_ps(a.operands[0]))
            out, err, code = t.run(cmd, a.timeout)
        else:
            out, err, code = "", "", 0
            if a.action == "put":
                t.put(a.operands[0], a.operands[1], a.timeout)
            else:
                t.get(a.operands[0], a.operands[1], a.timeout)
    except TimeoutError as e:
        print("TIMEOUT:", e, file=sys.stderr)
        sys.exit(3)
    finally:
        t.close()
    if out:
        print("OUT:", out)
    if err.strip():
        print("ERR:", err)
    print("EXIT:", code)
    sys.exit(code if code else 0)  # 退出码原样传播，含 Windows 负数大码


if __name__ == "__main__":
    main()
