#!/usr/bin/env python3
"""Verify against an existing TEST_DATABASE_URL using a temporary isolated schema.

From repo root:
  TEST_DATABASE_URL=postgres://... GO_BIN=go \
    uv run --project ai_service --group dev --group integration python scripts/verify_stack.py

Requires a PostgreSQL user allowed to CREATE SCHEMA, a Go 1.27+ toolchain,
Python AI dependencies, and unused local ports 8001 and 8080.
Never drops existing tables: only a newly created random schema is removed.
Runs the indexed AI path; model ingestion is a separate command.
"""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
GO = os.getenv("GO_BIN", "go")


def command(args, cwd, env):
    subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)


def wait_port(port, process):
    for _ in range(200):
        if process.poll() is not None:
            raise RuntimeError(f"service exited with {process.returncode}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=.2):
                return
        except OSError:
            time.sleep(.1)
    raise RuntimeError(f"service did not bind port {port}")


def merge_profiles(paths, output):
    blocks = {}
    for path in paths:
        for line in path.read_text().splitlines()[1:]:
            key, statements, count = line.rsplit(" ", 2)
            old = blocks.get(key, (int(statements), 0))
            blocks[key] = (int(statements), max(int(count), old[1]))
    output.write_text("mode: atomic\n" + "".join(f"{k} {s} {c}\n" for k, (s, c) in sorted(blocks.items())))


def main():
    dsn = os.environ["TEST_DATABASE_URL"]
    schema = "buddy_test_" + uuid4().hex
    parts = urlsplit(dsn)
    if parts.scheme not in ("postgres", "postgresql"):
        raise ValueError("TEST_DATABASE_URL must use a PostgreSQL URL")
    query = dict(parse_qsl(parts.query))
    query["search_path"] = schema
    scoped_dsn = urlunsplit(parts._replace(query=urlencode(query)))
    report = ROOT / "backend/coverage"
    report.mkdir(exist_ok=True)
    for port in (8001, 8080):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))
    processes = []
    with psycopg.connect(dsn, autocommit=True) as database, tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        (work / "cov").mkdir()
        database.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            database.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            for migration in sorted((ROOT / "backend/migrations").glob("*.sql")):
                database.execute(migration.read_text().split("-- +goose Down")[0])
            env = dict(os.environ, DATABASE_URL=scoped_dsn, TEST_DATABASE_URL=scoped_dsn,
                       AI_SERVICE_URL="http://127.0.0.1:8001", AI_SERVICE_TOKEN="local-verification-token",
                       AI_MODE="indexed", TRACKER_DB=str(work / "tracker.sqlite"),
                       JWT_SECRET="local-verification-secret-at-least-32-bytes",
                       SEED_EMAIL="intern@example.com", SEED_PASSWORD="DemoPassword123!", SEED_TEAM_ROLE="intern",
                       GOCOVERDIR=str(work / "cov"))
            ai = subprocess.Popen([sys.executable, "-m", "uvicorn", "buddy.api:create_app", "--factory",
                                   "--host", "127.0.0.1", "--port", "8001"], cwd=ROOT / "ai_service", env=env)
            processes.append(ai)
            wait_port(8001, ai)
            command([GO, "test", "-count=1", "-coverpkg=./...", "-covermode=atomic",
                     "-coverprofile=coverage/unit.out", "./..."], ROOT / "backend", env)
            for target in ("api", "seed"):
                command([GO, "build", "-cover", "-coverpkg=./...", "-covermode=atomic", "-o", work / target,
                         "./cmd/" + target], ROOT / "backend", env)
            command([work / "seed"], ROOT / "backend", env)
            command([work / "seed"], ROOT / "backend", env)
            backend = subprocess.Popen([str(work / "api")], cwd=ROOT / "backend", env=env)
            processes.append(backend)
            wait_port(8080, backend)
            with (ROOT / "docs/E2E.json").open("w") as output:
                subprocess.run([sys.executable, "scripts/smoke.py", "http://127.0.0.1:8080"],
                               cwd=ROOT, env=env, stdout=output, check=True)
        finally:
            for process in reversed(processes):
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            database.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        command([GO, "tool", "covdata", "textfmt", "-i=" + str(work / "cov"), "-o=" + str(report / "e2e.out")], ROOT, env)
        merge_profiles([report / "unit.out", report / "e2e.out"], report / "combined.out")
        command([GO, "tool", "cover", "-html=coverage/combined.out", "-o=coverage/index.html"], ROOT / "backend", env)
        command([GO, "tool", "cover", "-func=coverage/combined.out"], ROOT / "backend", env)
        with (report / "cobertura.xml").open("w") as output, (report / "combined.out").open() as source:
            subprocess.run([GO, "run", "github.com/boumenot/gocover-cobertura@v1.5.0"],
                           cwd=ROOT / "backend", env=env, stdin=source, stdout=output, check=True)
        command([sys.executable, "scripts/coverage_report.py"], ROOT, env)


if __name__ == "__main__":
    main()
