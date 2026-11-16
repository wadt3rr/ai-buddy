#!/usr/bin/env python3
"""Run after starting Compose: python scripts/smoke.py [http://localhost:3000]."""
import json
import os
import sys
import time
import statistics
import urllib.error
import urllib.request


def run(base):
    token = None

    def call(method, path, data=None, expected=200):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(base + path, headers=headers, method=method,
                                         data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(request, timeout=100)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            body = response.read().decode()
            assert response.status == expected, (path, response.status, body)
            return json.loads(body) if "json" in response.headers.get("Content-Type", "") else body

    assert call("GET", "/health") == "OK"
    call("GET", "/api/v1/messages", expected=401)
    call("POST", "/api/v1/auth/login", {"email": "nobody@example.com", "password": "wrong"}, expected=401)
    login = call("POST", "/api/v1/auth/login", {"email": os.getenv("SEED_EMAIL", "intern@example.com"),
                                                 "password": os.getenv("SEED_PASSWORD", "DemoPassword123!")})
    token = login["access_token"]
    assert call("GET", "/api/v1/users/me")["team_role"] == "intern"
    call("POST", "/api/v1/messages", {"content": ""}, expected=400)
    call("POST", "/api/v1/messages", {"content": "hello", "team_role": "mentor"}, expected=400)
    outputs = []
    for question, expected_status in [
        ("Не запускается listing-search: ошибка версии Python", "Решено"),
        ("Не помогло", "Передано наставнику"),
        ("Не скачивается notifications-service", "Передано наставнику"),
        ("Не запускается billing-service", "Передано наставнику"),
    ]:
        started = time.perf_counter()
        result = call("POST", "/api/v1/messages", {"content": question}, expected=201)
        latency_ms = round((time.perf_counter() - started) * 1000, 3)
        answer = result["assistant_message"]["content"]
        assert "Статус: " + expected_status in answer, answer
        assert "INTERNAL_CANARY" not in answer
        outputs.append({"question": question, "answer": answer, "latency_ms": latency_ms})
    history = call("GET", "/api/v1/messages?limit=2")
    assert len(history["messages"]) == 2 and history["next_before"]
    call("GET", "/api/v1/messages?limit=2&before=" + history["next_before"])
    call("GET", "/api/v1/messages?limit=no", expected=400)
    call("GET", "/api/v1/messages?before=wrong", expected=400)
    assert "Python" in call("GET", "/api/v1/ai/sources/listing-readme")
    call("GET", "/api/v1/ai/sources/notifications-private", expected=404)
    tickets = call("GET", "/api/v1/ai/tickets")["tickets"]
    assert tickets and "INTERNAL_CANARY" not in json.dumps(tickets)
    timings = []
    for _ in range(30):
        started = time.perf_counter()
        reply = call("POST", "/api/v1/messages", {"content": "Как поднять listing-search локально?"}, expected=201)
        assert "Статус: Решено" in reply["assistant_message"]["content"]
        timings.append((time.perf_counter() - started) * 1000)
    ordered = sorted(timings)
    return {"result": "passed", "scenarios": outputs, "tickets": tickets,
            "http_latency_ms": {"samples": len(timings), "p50": round(statistics.median(timings), 3),
                                "p95": round(ordered[int(.95 * (len(ordered) - 1))], 3), "max": round(max(timings), 3)}}


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"), ensure_ascii=False, indent=2))
