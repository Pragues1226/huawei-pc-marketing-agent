import argparse
import os
from pathlib import Path

from ima.client import load_local_env
from .server import WorkbenchServer


def main():
    load_local_env(Path(__file__).resolve().parents[1] / ".env")
    parser = argparse.ArgumentParser(description="华为 PC 内容工作台")
    parser.add_argument("--host", default=os.environ.get("WORKBENCH_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=os.environ.get("WORKBENCH_PORT", "8765"))
    args = parser.parse_args()
    with WorkbenchServer(args.port, host=args.host,
                         public_origin=os.environ.get("WORKBENCH_PUBLIC_ORIGIN")) as server:
        print(f"PC 内容工作台监听 {args.host}:{server.server_port}", flush=True)
        if server.public_origin:
            print(f"公开访问地址：{server.public_origin}", flush=True)
        else:
            print(f"本机访问：http://127.0.0.1:{server.server_port}", flush=True)
        print("按 Ctrl+C 停止。", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
