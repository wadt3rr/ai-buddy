"""Acceptance scenarios and interactive latency, separate from index preparation."""
import argparse
import json
import os
from pathlib import Path
import statistics
import tempfile
import time
from uuid import uuid4

from buddy.engine import Engine
from buddy.index import EvidenceIndex, build_index, save_index
from buddy.knowledge import Knowledge
from buddy.llm import LLM
from buddy.models import GenerateRequest
from buddy.tracker import Tracker


def evaluate(mode):
    root = Path(__file__).parent
    knowledge = Knowledge(root / "data")
    preparation = 0
    cases = json.loads((root / "data/eval_cases.json").read_text())
    results = []
    with tempfile.TemporaryDirectory() as directory:
        index = None
        if mode == "llm":
            llm = LLM(os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
                      os.getenv("LLM_MODEL", "qwen3:4b-instruct-2507-q4_K_M"),
                      os.getenv("LLM_API_KEY", "ollama"), timeout=120)
            started = time.perf_counter()
            output = build_index(knowledge, llm)
            path = Path(directory) / "facts.json"
            save_index(output, path)
            index = EvidenceIndex(path)
            preparation = round(time.perf_counter() - started, 3)
        elif mode == "indexed":
            index = EvidenceIndex(Path(os.getenv("FACTS_INDEX", "/state/facts.json")), root / "data/facts.json")
        engine = Engine(knowledge, Tracker(Path(directory) / "registry.sqlite"), index)
        for case in cases:
            started = time.perf_counter()
            result = engine.generate(GenerateRequest(request_id=uuid4(), user_id=uuid4(), team_role="intern",
                messages=[{"role": "user", "content": case["question"]}]))
            elapsed = round((time.perf_counter() - started) * 1000, 3)
            checks = {
                "status": result["status"] == case["status"],
                "conflict": bool(result["conflicts"]) == case["conflict"],
                "evidence": case.get("must_contain", "") in result["content"],
                "no_leak": not case.get("forbid") or case["forbid"] not in json.dumps(result),
                "indexed_evidence": mode == "offline" or case["status"] != "Решено" or result["indexed_documents"] > 0,
            }
            results.append({"id": case["id"], "passed": all(checks.values()), "checks": checks,
                            "mode": result["mode"], "latency_ms": elapsed, "indexed_documents": result["indexed_documents"]})
    delays = [r["latency_ms"] for r in results]
    return {"mode": mode, "index_preparation_seconds": preparation,
            "passed": sum(r["passed"] for r in results), "total": len(results),
            "latency_ms": {"median": statistics.median(delays), "max": max(delays)}, "cases": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["offline", "indexed", "llm"], default="indexed")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate(args.mode)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.output:
        args.output.write_text(text + "\n")
    raise SystemExit(0 if report["passed"] == report["total"] else 1)
