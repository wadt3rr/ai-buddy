"""Prepare document facts with an LLM once; serve questions without inference."""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile

from .knowledge import Knowledge, validate_claims
from .llm import LLM, SYSTEM
from .models import Claim


def fingerprint(document):
    return hashlib.sha256(json.dumps(asdict(document), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class EvidenceIndex:
    def __init__(self, *paths):
        self.snapshots = []
        for path in paths:
            if path is None:
                continue
            try:
                data = json.loads(Path(path).read_text())
                if data.get("format_version") == 1 and isinstance(data.get("documents"), dict):
                    self.snapshots.append(data)
            except (OSError, ValueError, AttributeError):
                continue

    def resolve(self, documents):
        claims, matched = [], 0
        for document in documents:
            for snapshot in self.snapshots:
                entry = snapshot["documents"].get(document.id, {})
                if not isinstance(entry, dict):
                    continue
                if entry.get("fingerprint") != fingerprint(document):
                    continue
                try:
                    parsed = [Claim.model_validate(c) for c in entry["claims"]]
                    valid = validate_claims(parsed, [{"id": document.id, "text": document.body}])
                    if not valid:
                        continue
                except (KeyError, TypeError, ValueError):
                    continue
                claims.extend(valid)
                matched += 1
                break
        return claims, matched


def build_index(knowledge, llm, role="intern"):
    output = {"format_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
              "model": llm.model, "prompt_sha256": hashlib.sha256(SYSTEM.encode()).hexdigest(),
              "documents": {}, "usage": [], "rejected_claims": 0}
    for service, permissions in knowledge.services.items():
        if role not in permissions["access_roles"]:
            continue
        documents = knowledge.allowed(service, role)
        if not documents:
            continue
        # Indexing uses full source text, independent of the wording of a user question.
        sources = [{"id": d.id, "text": d.body} for d in documents]
        error = None
        for _ in range(2):
            try:
                claims, usage = llm.extract(sources, "Извлеки все факты конфигурации и запуска сервиса.")
                valid = []
                for claim in claims:
                    try:
                        valid.extend(validate_claims([claim], sources))
                    except ValueError:
                        output["rejected_claims"] += 1
                if not valid:
                    raise ValueError("model returned no grounded facts")
                output["usage"].append(usage)
                for document in documents:
                    facts = [c.model_dump() for c in valid if c.doc_id == document.id]
                    if facts:
                        output["documents"][document.id] = {"fingerprint": fingerprint(document), "claims": facts}
                error = None
                break
            except Exception as exc:
                error = exc
        if error is not None:
            raise RuntimeError(f"indexing {service} failed: {type(error).__name__}") from error
    if not output["documents"]:
        raise ValueError("no accessible documents were indexed")
    return output


def save_index(data, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        temporary = output.name
    try:
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.getenv("FACTS_INDEX", "/state/facts.json"))
    args = parser.parse_args()
    llm = LLM(os.getenv("LLM_BASE_URL", "http://ollama:11434/v1"),
              os.getenv("LLM_MODEL", "qwen3:4b-instruct-2507-q4_K_M"),
              os.getenv("LLM_API_KEY", "ollama"), timeout=120)
    result = build_index(Knowledge(Path(os.getenv("KNOWLEDGE_DIR", "data"))), llm)
    save_index(result, args.output)
    print(json.dumps({"indexed_documents": len(result["documents"]), "model": result["model"],
                      "rejected_claims": result["rejected_claims"], "usage": result["usage"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
