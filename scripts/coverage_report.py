#!/usr/bin/env python3
"""Combine covered/total lines; never average independent percentages."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def main():
    go = ET.parse(ROOT / "backend/coverage/cobertura.xml").getroot()
    # Count distinct source lines from Cobertura, merging classes if necessary.
    lines = {}
    for cls in go.findall(".//class"):
        for line in cls.findall("./lines/line"):
            key = (cls.attrib["filename"], line.attrib["number"])
            lines[key] = lines.get(key, False) or int(line.attrib["hits"]) > 0
    py = json.loads((ROOT / "ai_service/coverage/coverage.json").read_text())["totals"]
    js = json.loads((ROOT / "frontend/coverage/coverage-summary.json").read_text())["total"]["lines"]
    counts = {"backend": {"covered": sum(lines.values()), "total": len(lines)},
              "ai_service": {"covered": py["covered_lines"], "total": py["num_statements"]},
              "frontend": {"covered": js["covered"], "total": js["total"]}}
    counts["combined"] = {"covered": sum(c["covered"] for c in counts.values()),
                          "total": sum(c["total"] for c in counts.values())}
    for count in counts.values():
        count["percent"] = round(100 * count["covered"] / count["total"], 2)
    counts["notes"] = ["Go lines are mapped from Go coverage blocks by gocover-cobertura v1.5.0.",
                       "Go native percentage counts statements; it is reported separately.",
                       "Python coverage.py counts executable source lines.",
                       "Combined = sum covered lines / sum executable lines, not mean percentages.",
                       "No tests, dependencies or integration-test scripts are included."]
    text = json.dumps(counts, indent=2, ensure_ascii=False)
    (ROOT / "docs/COVERAGE.json").write_text(text + "\n")
    print(text)
    if any(counts[key]["percent"] <= 80 for key in ("backend", "ai_service", "frontend", "combined")):
        raise SystemExit("coverage must exceed 80%")


if __name__ == "__main__":
    main()
