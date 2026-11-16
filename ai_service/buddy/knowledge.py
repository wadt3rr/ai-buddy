import json
import re
from dataclasses import dataclass
from pathlib import Path

from .models import Claim


@dataclass(frozen=True)
class Document:
    id: str
    service: str
    title: str
    body: str
    roles: tuple[str, ...]
    kind: str
    revision: str
    updated_at: str
    owner: str
    origin: str


class Knowledge:
    def __init__(self, root: Path):
        self.root = root
        self.services = json.loads((root / "catalog.json").read_text())
        records = json.loads((root / "documents.json").read_text())
        self.documents = []
        for record in records:
            path = (root / record.pop("path")).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError("document path outside knowledge directory")
            self.documents.append(Document(body=path.read_text(), **record))

    def allowed(self, service: str, role: str) -> list[Document]:
        # Filter BEFORE ranking, LLM calls, citations, or ticket payloads.
        return [d for d in self.documents if d.service == service and role in d.roles]

    def service_from(self, messages) -> str | None:
        # A new explicit service replaces the earlier service in this single-chat UI.
        for message in reversed(messages):
            if message.role != "user":
                continue
            found = [s for s in self.services if s in message.content.lower()]
            if found:
                return found[0] if len(found) == 1 else None
        return None


def chunks(document: Document) -> list[str]:
    paragraphs = re.split(r"\n\s*\n", document.body)
    return [p[i:i + 1200] for p in paragraphs for i in range(0, len(p), 1200) if p.strip()]


def retrieve(documents: list[Document], question: str) -> list[dict]:
    """Rank paragraphs while preserving evidence from every authorized source."""
    terms = set(re.findall(r"[\w.-]{3,}", question.lower()))
    selected = []
    for doc in documents:
        ranked = sorted(chunks(doc), key=lambda p: sum(t in p.lower() for t in terms), reverse=True)
        selected.append({"id": doc.id, "text": "\n\n".join(ranked[:3])[:3600]})
    return selected


def rule_claims(documents: list[Document]) -> list[Claim]:
    """Explicit offline baseline for the limited supported fact schema.

    Works from Markdown/config bytes, not from pre-labelled conflict answers.
    It does not understand arbitrary instructions or general semantic conflicts.
    """
    patterns = {
        "python_version": [r"Python\s*[:=]?\s*(\d+\.\d+)", r'requires-python\s*=\s*"==(\d+\.\d+)\.\*"'],
        "postgres_version": [r"PostgreSQL\s*[:=]?\s*(\d+)"],
        "launch_command": [r"Команда запуска:\s*`([^`\n]+)`"],
        "access_procedure": [r"Получение доступа:\s*([^\n]+)"],
    }
    result = []
    for doc in documents:
        for key, expressions in patterns.items():
            for expression in expressions:
                for match in re.finditer(expression, doc.body, flags=re.IGNORECASE):
                    result.append(Claim(doc_id=doc.id, key=key, value=match[1], quote=match[0]))
    return result


def validate_claims(claims: list[Claim], sources: list[dict]) -> list[Claim]:
    source_map = {d["id"]: d["text"] for d in sources}
    valid = []
    seen = set()
    for claim in claims:
        # Reject invented source IDs, invented evidence and unsupported normalized values.
        if claim.quote not in source_map.get(claim.doc_id, "") or claim.value not in claim.quote:
            raise ValueError("ungrounded model claim")
        pattern = {"python_version": r"\d+\.\d+", "postgres_version": r"\d+"}.get(claim.key)
        if pattern and not re.fullmatch(pattern, claim.value):
            raise ValueError("invalid version format")
        identity = (claim.doc_id, claim.key, claim.value)
        if identity not in seen:
            valid.append(claim)
            seen.add(identity)
    return valid
