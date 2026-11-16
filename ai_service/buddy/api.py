import os
import secrets
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import PlainTextResponse

from .engine import Engine
from .knowledge import Knowledge
from .index import EvidenceIndex
from .llm import LLM
from .models import GenerateRequest
from .tracker import Tracker


def create_app(engine=None, token=None):
    token = token if token is not None else os.getenv("AI_SERVICE_TOKEN", "")
    if not token:
        raise ValueError("AI_SERVICE_TOKEN is required; AI is an internal service")
    if engine is None:
        mode = os.getenv("AI_MODE", "llm")
        if mode not in ("offline", "indexed", "llm"):
            raise ValueError("AI_MODE must be indexed, llm or offline")
        root = Path(os.getenv("KNOWLEDGE_DIR", "data"))
        index = None if mode == "offline" else EvidenceIndex(
            Path(os.getenv("FACTS_INDEX", "/state/facts.json")), root / "facts.json")
        responder = LLM(os.getenv("LLM_BASE_URL", "http://ollama:11434/v1"),
                        os.getenv("LLM_MODEL", "qwen3:4b-instruct-2507-q4_K_M"),
                        os.getenv("LLM_API_KEY", "ollama"), timeout=180) if mode == "llm" else None
        engine = Engine(Knowledge(root), Tracker(Path(os.getenv("TRACKER_DB", "state/tracker.sqlite"))), index, responder)
    app = FastAPI(title="AI Buddy internal API", version="0.1.0")

    def authorize(authorization: str = Header(default="")):
        if not secrets.compare_digest(authorization, "Bearer " + token):
            raise HTTPException(401, "invalid service token")

    @app.get("/health")
    def health():
        accessible = [document for service, permissions in engine.knowledge.services.items()
                      if "intern" in permissions["access_roles"]
                      for document in engine.knowledge.allowed(service, "intern")]
        count = engine.index.resolve(accessible)[1] if engine.index else 0
        return {"status": "ok", "mode": "llm" if engine.responder else "indexed" if count else "rules",
                "indexed_documents": count, "model": engine.responder.model if engine.responder else None,
                "model_status": "checked_on_request" if engine.responder else "disabled"}

    @app.post("/generate", dependencies=[Depends(authorize)])
    def generate(request: GenerateRequest):
        try:
            return engine.generate(request)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/tickets/{user_id}", dependencies=[Depends(authorize)])
    def tickets(user_id: UUID):
        return {"tickets": engine.tracker.list_for(str(user_id))}

    @app.get("/sources/{source_id}", dependencies=[Depends(authorize)], response_class=PlainTextResponse)
    def source(source_id: str, team_role: str):
        # Role comes from authenticated Go backend, never directly from the browser.
        for document in engine.knowledge.documents:
            if (document.id == source_id and team_role in document.roles
                    and team_role in engine.knowledge.services[document.service]["access_roles"]):
                return document.body
        raise HTTPException(404, "source not found")

    return app
