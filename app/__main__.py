import argparse
import errno
from pathlib import Path
import sys
import threading
import webbrowser

from ima.client import load_local_env
from .server import WorkbenchServer


def is_port_unavailable(error):
    return error.errno in {errno.EADDRINUSE, errno.EACCES, 10048, 10013} or getattr(error, "winerror", None) in {10048, 10013}


def create_server(port, auto_port=False):
    ports = range(port, min(port + 10, 65536)) if auto_port and port else (port,)
    for candidate in ports:
        try:
            return WorkbenchServer(candidate)
        except OSError as error:
            if not auto_port or not is_port_unavailable(error) or candidate == ports[-1]:
                raise


def open_browser(url):
    def open_page():
        try:
            opened = webbrowser.open(url, new=2)
        except (OSError, webbrowser.Error):
            opened = False
        if not opened:
            print(f"浏览器未自动打开，请手动访问：{url}", flush=True)

    threading.Thread(target=open_page, daemon=True).start()


def main(argv=None):
    parser = argparse.ArgumentParser(description="华为 PC 本地内容工作台")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", dest="open_page", help="启动后打开浏览器")
    parser.add_argument("--auto-port", action="store_true", help="端口不可用时尝试后续 9 个端口")
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("端口必须在 0–65535 之间；0 表示由系统分配")
    load_local_env(Path(__file__).resolve().parents[1] / ".env")
    try:
        server = create_server(args.port, args.auto_port)
    except OSError as error:
        if is_port_unavailable(error):
            print(f"端口 {args.port} 被占用或不可用。请关闭旧的启动窗口，或运行 python -m app --open --auto-port。", file=sys.stderr)
        else:
            print(f"本机工作台启动失败：{error}", file=sys.stderr)
        return 1

    with server:
        url = f"http://127.0.0.1:{server.server_port}/"
        if args.port and server.server_port != args.port:
            print(f"端口 {args.port} 不可用，已改用 {server.server_port}。", flush=True)
        print(f"PC 内容工作台：{url}", flush=True)
        print("请保留这个启动窗口。按 Ctrl+C 或关闭窗口可停止服务。", flush=True)
        if args.open_page:
            open_browser(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
