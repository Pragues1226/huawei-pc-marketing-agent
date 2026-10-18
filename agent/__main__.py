import argparse
import json
import sys
from pathlib import Path

from .demo import development_fixture
from .preflight import prepare_task, review_structure


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description="开发前置工具，不生成或认证最终营销软文")
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare", help="校验任务，输出补充问题和平台规则")
    prepare.add_argument("--task", required=True)
    review = sub.add_parser("review", help="检查数据结构和引用关系，保留语义复核待办")
    review.add_argument("--task", required=True)
    review.add_argument("--evidence", required=True)
    review.add_argument("--article", required=True)
    sub.add_parser("demo", help="使用纯虚构数据演示前置检查，非真实运行成果")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        if args.command == "prepare":
            result = prepare_task(read_json(args.task))
        elif args.command == "review":
            result = review_structure(read_json(args.task), read_json(args.evidence), read_json(args.article))
        else:
            task, evidence, article = development_fixture()
            result = {"mode": "development_only", "notice": "未调用 ima 或大模型；纯虚构输入，不可作为参赛运行结果。", "preparation": prepare_task(task), "review": review_structure(task, evidence, article)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if result.get("status") in {"invalid", "blocked"} else 0
    except (OSError, ValueError):
        print(json.dumps({"status": "error", "message": "无法读取输入文件或 JSON 格式不正确，请检查路径及内容。"}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
