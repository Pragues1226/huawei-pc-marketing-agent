import argparse
from pathlib import Path

from ima.client import load_local_env
from .server import WorkbenchServer


def main():
    parser = argparse.ArgumentParser(description="华为 PC 本地内容工作台")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    load_local_env(Path(__file__).resolve().parents[1] / ".env")
    with WorkbenchServer(args.port) as server:
        print(f"PC 内容工作台：http://127.0.0.1:{server.server_port}", flush=True)
        print("仅本机访问。按 Ctrl+C 停止。", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
