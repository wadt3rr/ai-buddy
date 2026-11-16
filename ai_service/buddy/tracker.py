import json
import logging
import os
from pathlib import Path
import sqlite3
import tempfile
import threading

logger = logging.getLogger("buddy.tracker")


class Tracker:
    """Durable request registry with a recoverable JSONL audit snapshot."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.audit_path = path.with_name("tickets.jsonl")
        self.lock = threading.Lock()
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, dedupe TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT NOT NULL DEFAULT '')""")
            columns = {row[1] for row in db.execute("PRAGMA table_info(tickets)")}
            if "created_at" not in columns:
                db.execute("ALTER TABLE tickets ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
        self._write_audit()

    def connect(self):
        return sqlite3.connect(self.path, timeout=5)

    @staticmethod
    def _record(row):
        return {"id": "BUDDY-" + str(row[0]), "user_id": row[1], "kind": row[2],
                "payload": json.loads(row[3]), "status": row[4], "created_at": row[5] or None}

    def _write_audit(self):
        # SQLite is authoritative. A damaged/missing export is rebuilt on startup.
        temporary = None
        try:
            with self.connect() as db:
                rows = db.execute("SELECT id,user_id,kind,payload,status,created_at FROM tickets ORDER BY id").fetchall()
            with tempfile.NamedTemporaryFile(mode="w", dir=self.path.parent, delete=False) as output:
                temporary = output.name
                for row in rows:
                    output.write(json.dumps(self._record(row), ensure_ascii=False) + "\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.audit_path)
        except OSError as exc:
            logger.error("audit_export_failed type=%s", type(exc).__name__)
        finally:
            if temporary and Path(temporary).exists():
                Path(temporary).unlink()

    def create(self, user_id: str, dedupe: str, kind: str, payload: dict) -> dict:
        with self.lock:
            with self.connect() as db:
                cursor = db.execute("""INSERT OR IGNORE INTO tickets(user_id,dedupe,kind,payload,created_at)
                    VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                    (user_id, user_id + ":" + dedupe, kind, json.dumps(payload, ensure_ascii=False)))
                row = db.execute("SELECT id,status,created_at FROM tickets WHERE dedupe=?", (user_id + ":" + dedupe,)).fetchone()
                created = cursor.rowcount == 1
            if created:
                self._write_audit()
                logger.info("ticket_created id=BUDDY-%s kind=%s", row[0], kind)
        return {"id": "BUDDY-" + str(row[0]), "status": row[1], "kind": kind, "created_at": row[2] or None}

    def list_for(self, user_id: str) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT id,user_id,kind,payload,status,created_at FROM tickets WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()
        return [self._record(row) for row in rows]
