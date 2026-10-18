import argparse
import json
import sys

from .client import ImaClient, ImaError, load_local_env, normalize_base


def main():
    parser = argparse.ArgumentParser(description="ima 配置自检与只读连通性检查")
    parser.add_argument("command", choices=["diagnose", "probe"])
    parser.add_argument("--kb-name", default="任德耀新建华为PC知识库")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        load_local_env()
        client = ImaClient()
        if args.command == "diagnose":
            output = client.diagnose()
        else:
            # Paginate rather than guessing the first result is the designated shared KB.
            cursor, seen, matches = "", set(), []
            for _ in range(5):
                data = client.search_bases(args.kb_name, cursor)
                entries = data.get("info_list")
                if not isinstance(entries, list):
                    raise ImaError("response", "知识库搜索缺少有效列表")
                matches.extend(normalize_base(x) for x in entries)
                if any(x["kb_name"] == args.kb_name for x in matches) or data.get("is_end") is True:
                    break
                next_cursor = data.get("next_cursor")
                if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor or next_cursor in seen:
                    break
                seen.add(cursor)
                cursor = next_cursor
            exact = [x for x in matches if x["kb_name"] == args.kb_name]
            if len(exact) != 1:
                raise ImaError("selection", "未唯一找到指定共享知识库，请核对名称、账号和加入权限")
            directory = client.list_entries(exact[0]["kb_id"])
            entries = directory.get("knowledge_list")
            if not isinstance(entries, list):
                raise ImaError("response", "目录返回缺少有效条目列表")
            output = {"status": "connected", "knowledge_base": exact[0]["kb_name"], "first_page_entry_count": len(entries), "has_more": directory.get("is_end") is False, "note": "已完成知识库查找和首屏目录请求；未检索产品、读取原文或验证图片。"}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except ImaError as error:
        code = error.code if isinstance(error.code, (int, type(None))) else None
        print(json.dumps({"status": "error", "kind": error.kind, "code": code, "message": str(error)}, ensure_ascii=False))
        return 2
    except OSError:
        print(json.dumps({"status": "error", "message": "无法读取本机配置，请检查文件权限。"}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
