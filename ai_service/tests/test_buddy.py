import json
from dataclasses import replace
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from buddy.api import create_app
from buddy.engine import Engine
from buddy.knowledge import Knowledge, chunks, retrieve, rule_claims, validate_claims
from buddy.llm import LLM
from buddy.index import EvidenceIndex, fingerprint, save_index
from buddy.models import Claim, GenerateRequest
from buddy.tracker import Tracker


ROOT = Path(__file__).parents[1] / "data"


@pytest.fixture
def engine(tmp_path):
    return Engine(Knowledge(ROOT), Tracker(tmp_path / "tickets.sqlite"))


def request(text="Не запускается listing-search: ошибка версии Python", **kwargs):
    data = dict(request_id=uuid4(), user_id=uuid4(), team_role="intern",
                messages=[{"role": "user", "content": text}])
    data.update(kwargs)
    return GenerateRequest(**data)


def test_version_conflict_is_resolved_by_current_manifest(engine):
    result = engine.generate(request())
    assert result["status"] == "Решено"
    assert "3.12" in result["content"]
    assert "v2.0" in result["content"]
    assert result["conflicts"][0]["key"] == "python_version"
    assert result["tickets"][0]["kind"] == "documentation"
    assert "синтет" not in result["content"].lower()


def test_no_access_no_document_or_model_leak(engine):
    engine.index = Mock()
    req = request("Не скачивается notifications-service")
    result = engine.generate(req)
    assert result["status"] == "Передано наставнику"
    assert result["sources"] == []
    assert result["mode"] == "rules"
    assert "INTERNAL_CANARY" not in json.dumps(result)
    assert "INTERNAL_CANARY" not in json.dumps(engine.tracker.list_for(str(req.user_id)))
    engine.index.resolve.assert_not_called()


def test_unresolvable_conflict_and_ambiguous_request(engine):
    result = engine.generate(request("Не запускается billing-service"))
    assert result["status"] == "Передано наставнику"
    assert len(result["tickets"]) == 2
    for text in ("Не работает", "listing-search и billing-service не работают"):
        assert engine.generate(request(text))["status"] == "Уточняю"


def test_majority_and_date_do_not_establish_truth(engine):
    engine.knowledge.documents = [d for d in engine.knowledge.documents if d.kind != "manifest"]
    result = engine.generate(request())
    assert result["status"] == "Передано наставнику"
    assert "подтверждения" in result["content"]


def test_wrong_revision_manifest_does_not_resolve(engine):
    engine.knowledge.services["listing-search"]["revision"] = "some-other-branch"
    assert engine.generate(request())["status"] == "Передано наставнику"


def test_followup_uses_latest_named_service_and_human_request(engine):
    req = request("не помогло", messages=[
        {"role": "user", "content": "Не запускается listing-search"},
        {"role": "assistant", "content": "Инструкция"},
        {"role": "user", "content": "не помогло"}])
    assert engine.generate(req)["status"] == "Передано наставнику"
    req.messages.append(request("Не скачивается notifications-service").messages[0])
    assert engine.generate(req)["sources"] == []


def test_no_docs_no_launch_and_off_topic(engine):
    engine.knowledge.documents = []
    assert "не нашёл документацию" in engine.generate(request())["content"]
    doc = Knowledge(ROOT).documents[0]
    engine.knowledge.documents = [replace(doc, body="Python: 3.12")]
    assert "команды запуска" in engine.generate(request())["content"]
    engine.knowledge = Knowledge(ROOT)
    assert engine.generate(request("Какой отпуск у listing-search?"))["status"] == "Передано наставнику"


def test_request_ends_with_user(engine):
    req = request(messages=[{"role": "assistant", "content": "hello"}])
    with pytest.raises(ValueError):
        engine.generate(req)


def test_tracker_idempotence_and_user_isolation(engine, tmp_path):
    req = request()
    first = engine.generate(req)
    assert engine.generate(req)["tickets"] == first["tickets"]
    # Survives reopening the database.
    assert len(Tracker(tmp_path / "tickets.sqlite").list_for(str(req.user_id))) == 1
    assert engine.tracker.list_for(str(uuid4())) == []


def test_documentation_deduplication_ignores_quote_format(engine):
    req = request()
    first = engine.generate(req)["tickets"][0]["id"]
    engine.index = EvidenceIndex(ROOT / "facts.json")
    second = engine.generate(request(user_id=req.user_id))["tickets"][0]["id"]
    assert first == second


def test_grounding_rejects_fabrication_and_bad_version(engine):
    sources = retrieve(engine.knowledge.documents, "Python")
    good = Claim(doc_id="listing-readme", key="python_version", value="3.12", quote="Python 3.12")
    assert validate_claims([good, good], sources) == [good]
    for c in [good.model_copy(update={"doc_id": "private"}),
              good.model_copy(update={"quote": "Python 9.99"}),
              good.model_copy(update={"value": "16"}),
              good.model_copy(update={"value": "Python"})]:
        with pytest.raises(ValueError):
            validate_claims([c], sources)


def test_indexed_answer_is_grounded_and_never_calls_a_model(engine, tmp_path):
    doc = engine.knowledge.documents[0]
    claim = Claim(doc_id=doc.id, key="python_version", value="3.12", quote="Python 3.12")
    path = tmp_path / "facts.json"
    save_index({"format_version": 1, "documents": {doc.id: {"fingerprint": fingerprint(doc), "claims": [claim.model_dump()]}}}, path)
    engine.index = EvidenceIndex(path)
    with patch("httpx.Client", side_effect=AssertionError("interactive inference forbidden")):
        result = engine.generate(request())
    assert result["mode"] == "indexed" and result["conflicts"]
    assert result["indexed_documents"] == 1


def test_llm_wire_protocol():
    llm = LLM("http://localhost:11434/v1/", "demo-model", "secret")
    body = {"choices": [{"message": {"content": '{"claims":[]}'}}], "usage": {"total_tokens": 5}}
    fake = httpx.Response(200, json=body, request=httpx.Request("POST", "http://localhost"))
    with patch("buddy.llm.httpx.Client") as client:
        client.return_value.__enter__.return_value.post.return_value = fake
        claims, usage = llm.extract([], "q")
        assert claims == [] and usage["total_tokens"] == 5
        call = client.return_value.__enter__.return_value.post.call_args
        assert call.args[0] == "http://localhost:11434/v1/chat/completions"
        assert call.kwargs["json"]["response_format"] == {"type": "json_object"}
    with pytest.raises(ValueError):
        LLM("bad", "", "")


def test_changed_document_rejects_stale_index(engine, tmp_path):
    doc = engine.knowledge.documents[0]
    wrong = Claim(doc_id=doc.id, key="python_version", value="9.99", quote="Python 9.99")
    path = tmp_path / "facts.json"
    save_index({"format_version": 1, "documents": {doc.id: {"fingerprint": "outdated", "claims": [wrong.model_dump()]}}}, path)
    engine.index = EvidenceIndex(path)
    result = engine.generate(request())
    assert result["mode"] == "rules" and "9.99" not in result["content"]


def test_internal_api_auth_validation_sources_and_tickets(engine):
    app = TestClient(create_app(engine, "test-secret"))
    headers = {"Authorization": "Bearer test-secret"}
    assert app.get("/health").json()["status"] == "ok"
    assert app.post("/generate", json={}).status_code == 401
    assert app.post("/generate", json={}, headers=headers).status_code == 422
    req = request()
    result = app.post("/generate", json=req.model_dump(mode="json"), headers=headers)
    assert result.status_code == 200
    assert app.get(f"/tickets/{req.user_id}", headers=headers).json()["tickets"]
    assert app.get("/sources/listing-readme?team_role=intern", headers=headers).status_code == 200
    assert app.get("/sources/notifications-private?team_role=intern", headers=headers).status_code == 404
    assert app.get("/sources/notifications-private?team_role=mentor", headers=headers).status_code == 200
    req.messages[-1].role = "assistant"
    assert app.post("/generate", json=req.model_dump(mode="json"), headers=headers).status_code == 422


def test_app_from_environment_and_bad_configuration(tmp_path, monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_DIR", str(ROOT))
    monkeypatch.setenv("TRACKER_DB", str(tmp_path / "db.sqlite"))
    monkeypatch.setenv("AI_MODE", "offline")
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    with pytest.raises(ValueError):
        create_app()
    monkeypatch.setenv("AI_SERVICE_TOKEN", "token")
    assert TestClient(create_app()).get("/health").json()["mode"] == "rules"
    monkeypatch.setenv("AI_MODE", "llm")
    assert TestClient(create_app()).get("/health").json()["mode"] == "llm"
    monkeypatch.setenv("AI_MODE", "typo")
    with pytest.raises(ValueError):
        create_app()


def test_manifest_path_escape_and_chunking(tmp_path):
    (tmp_path / "catalog.json").write_text("{}")
    (tmp_path / "documents.json").write_text('[{"path":"../outside"}]')
    with pytest.raises(ValueError):
        Knowledge(tmp_path)
    doc = replace(Knowledge(ROOT).documents[0], body="a" * 2500 + "\n\nb")
    assert len(chunks(doc)) == 4
