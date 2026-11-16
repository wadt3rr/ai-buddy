import logging
import hashlib
import json
import time
from collections import defaultdict

from .knowledge import Knowledge, rule_claims
from .models import GenerateRequest
from .tracker import Tracker


LABELS = {"python_version": "Python", "postgres_version": "PostgreSQL",
          "launch_command": "Команда запуска", "access_procedure": "Получение доступа"}
logger = logging.getLogger("buddy")


class Engine:
    def __init__(self, knowledge: Knowledge, tracker: Tracker, index=None):
        self.knowledge, self.tracker, self.index = knowledge, tracker, index

    def generate(self, request: GenerateRequest) -> dict:
        started = time.monotonic()
        latest = request.messages[-1]
        if latest.role != "user":
            raise ValueError("last message must be from user")
        user_id = str(request.user_id)
        mode = "rules"
        tickets, conflicts, sources, usage = [], [], [], {}
        indexed_documents = 0

        def finish(status, text, claims=()):
            elapsed = round((time.monotonic() - started) * 1000)
            # Never log document bodies, user text, credentials or user IDs.
            logger.info("request_id=%s status=%s mode=%s latency_ms=%s usage=%s",
                        request.request_id, status, mode, elapsed, usage)
            links = "\n".join(f"- [{s['title']}](/api/v1/ai/sources/{s['id']}) — {s['updated_at']}" for s in sources)
            ticket_text = "\n".join(f"- Заявка **{t['id']}** · открыта · " +
                                     ("наставнику" if t['kind'] == 'mentor' else "владельцам документации") for t in tickets)
            content = f"**Статус: {status}**\n\n{text}"
            if claims:
                content += "\n\nПроверенные факты:\n" + "\n".join(
                    f"- {LABELS[c.key]}: `{c.value}`." for c in claims)
            if conflicts:
                content += "\n\nОбнаружены расхождения:\n" + "\n".join(
                    f"- {LABELS[c['key']]}: " + "; ".join(f"{x['doc_id']} → {x['value']}" for x in c['claims']) for c in conflicts)
            if links:
                content += "\n\nИсточники:\n" + links
            if ticket_text:
                content += "\n\n" + ticket_text
            if status == "Решено":
                content += "\n\nПопробуй запуск. Если ошибка осталась, напиши «не помогло» — подключу наставника."
            return dict(content=content, status=status, mode=mode, sources=sources,
                        conflicts=conflicts, tickets=tickets, usage=usage, latency_ms=elapsed,
                        indexed_documents=indexed_documents)

        def handoff(reason):
            ticket = self.tracker.create(user_id, "handoff:" + str(request.request_id), "mentor",
                                         {"question": latest.content, "service": service, "reason": reason,
                                          "source_ids": [s["id"] for s in sources], "conflicts": conflicts,
                                          "history": [m.model_dump() for m in request.messages[-6:]]})
            tickets.append(ticket)
            return finish("Передано наставнику", reason + "\nСледующий шаг: дождись ответа наставника по заявке.")

        service = self.knowledge.service_from(request.messages)
        if service is None:
            return finish("Уточняю", "Укажи один сервис: listing-search, notifications-service или billing-service. Что делал и какую ошибку получил?")
        catalog = self.knowledge.services[service]
        if request.team_role not in catalog["access_roles"]:
            return handoff("У тебя пока нет доступа к репозиторию " + service +
                           ". Инструкция по выдаче доступа в доступных источниках не найдена. Закрытые документы не читались.")
        docs = self.knowledge.allowed(service, request.team_role)
        sources.extend({"id": d.id, "title": d.title, "updated_at": d.updated_at} for d in docs)
        if any(word in latest.content.lower() for word in ("не помогло", "наставник", "передай", "всё равно")):
            return handoff("Стажёр запросил помощь человека или сообщил, что инструкция не помогла.")
        if not docs:
            return handoff("В доступных источниках не нашёл документацию этого сервиса.")
        claims = rule_claims(docs)
        if self.index:
            extracted, indexed_documents = self.index.resolve(docs)
            claims += extracted
            if indexed_documents:
                mode = "indexed"
        claims = list({(c.doc_id, c.key, c.value): c for c in claims}.values())
        by_key = defaultdict(list)
        for claim in claims:
            by_key[claim.key].append(claim)
        selected, unresolved = [], []
        docs_by_id = {d.id: d for d in docs}
        for key, group in by_key.items():
            values = {c.value for c in group}
            if len(values) == 1:
                selected.append(group[0])
                continue
            conflicts.append({"key": key, "claims": [c.model_dump() for c in group]})
            # Only machine-readable runtime constraints at the same service revision
            # can resolve version conflicts. Recency and vote count are not authority.
            manifests = [c for c in group if key in ("python_version", "postgres_version")
                         and docs_by_id[c.doc_id].kind == "manifest"
                         and docs_by_id[c.doc_id].revision == catalog["revision"]]
            if len({c.value for c in manifests}) == 1:
                selected.append(manifests[0])
            else:
                unresolved.append(key)
        if conflicts:
            identity = [{"key": c["key"], "claims": sorted(
                {(item["doc_id"], item["value"]) for item in c["claims"]})} for c in conflicts]
            digest = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
            ticket = self.tracker.create(user_id, "docs:" + service + ":" + catalog["revision"] + ":" + digest, "documentation",
                                         {"service": service, "conflicts": conflicts,
                                          "recipients": sorted({d.owner for d in docs} | {"Наставник команды"})})
            tickets.append(ticket)
        if unresolved:
            return handoff("В документации указаны разные версии, а подтверждения для текущей ревизии нет. Нужна проверка наставника.")
        launch = next((c for c in selected if c.key == "launch_command"), None)
        if not launch:
            return handoff("Проверяемой команды запуска в доступных документах не найдено.")
        # Narrow task boundary: never answer arbitrary onboarding questions from unrelated facts.
        topic = latest.content.lower()
        if not any(c.isalpha() for c in topic) or topic.startswith("по инструкции"):
            topic += " " + " ".join(m.content.lower() for m in request.messages[-4:] if m.role == "user")
        if not any(w in topic for w in ("запус", "python", "питон", "верси", "postgres", "ошиб", "установ", "как поднять", "start", "run")):
            return handoff("Нашёл документацию запуска, но она не подтверждает ответ на этот вопрос.")
        reason = "Инструкция найдена. Команда из документации: `" + launch.value + "`."
        if conflicts:
            reason += " Версия подтверждена конфигурацией текущей ревизии " + catalog["revision"] + "; расхождение передано владельцам и наставнику."
        else:
            reason += " Извлечённые факты в доступных источниках согласуются; это не гарантия отсутствия других проблем."
        return finish("Решено", reason, selected)
