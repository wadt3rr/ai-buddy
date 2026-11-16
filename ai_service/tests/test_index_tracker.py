import json
from pathlib import Path
import sqlite3
from unittest.mock import Mock, patch

import pytest

from buddy.index import EvidenceIndex, build_index, fingerprint, main, save_index
from buddy.knowledge import Knowledge, rule_claims
from buddy.models import Claim
from buddy.tracker import Tracker

ROOT = Path(__file__).parents[1] / "data"


def model():
    llm = Mock(model="test-model")
    llm.model = "test-model"
    llm.extract.side_effect = lambda sources, _: ([
        Claim(doc_id=s['id'], key="python_version", value="3.12", quote="Python 3.12")
        for s in sources if "Python 3.12" in s['text']
    ], {"total_tokens": 20})
    return llm


def test_index_builder_and_cli(tmp_path, monkeypatch, capsys):
    knowledge = Knowledge(ROOT)
    llm = Mock(model="test")
    llm.model = "test"
    def extract(sources, _):
        ids = {s['id'] for s in sources}
        return [c for c in rule_claims(knowledge.documents) if c.doc_id in ids], {"total_tokens": 10}
    llm.extract.side_effect = extract
    result = build_index(knowledge, llm)
    assert len(result['documents']) == 6
    assert 'notifications-private' not in result['documents']
    p = tmp_path / 'facts.json'
    save_index(result, p)
    facts, count = EvidenceIndex(p).resolve(knowledge.allowed('listing-search', 'intern'))
    assert count == 4 and facts
    monkeypatch.setenv('KNOWLEDGE_DIR', str(ROOT))
    monkeypatch.setattr('sys.argv', ['index', '--output', str(p)])
    with patch('buddy.index.LLM', return_value=llm):
        main()
    assert json.loads(capsys.readouterr().out)['indexed_documents'] == 6


def test_builder_rejects_ungrounded_retries_and_preserves_existing_index(tmp_path):
    knowledge = Knowledge(ROOT)
    llm = Mock(model='test'); llm.model = 'test'
    bad = Claim(doc_id='listing-readme', key='python_version', value='9.99', quote='Python 9.99')
    llm.extract.return_value = ([bad], {})
    with pytest.raises(RuntimeError):
        build_index(knowledge, llm)
    assert llm.extract.call_count == 2
    llm.extract.side_effect = TimeoutError()
    with pytest.raises(RuntimeError):
        build_index(knowledge, llm)
    knowledge.services = {}
    with pytest.raises(ValueError):
        build_index(knowledge, llm)


def test_partial_invalid_facts_are_discarded(tmp_path):
    knowledge = Knowledge(ROOT)
    llm = Mock(model='test'); llm.model = 'test'
    def extract(sources, _):
        docs = [d for d in knowledge.documents if d.id in {s['id'] for s in sources}]
        return rule_claims(docs) + [Claim(doc_id='invented', key='python_version', value='9.99', quote='Python 9.99')], {}
    llm.extract.side_effect = extract
    result = build_index(knowledge, llm)
    assert result['rejected_claims'] == 2
    assert 'invented' not in result['documents']


def test_corrupt_stale_empty_and_fabricated_index_entries(tmp_path):
    knowledge = Knowledge(ROOT); doc = knowledge.documents[0]
    assert EvidenceIndex(tmp_path/'missing', None).resolve([doc]) == ([], 0)
    p = tmp_path/'facts.json'
    for text in ['bad', '[]', '{}', '{"format_version":2,"documents":{}}']:
        p.write_text(text)
        assert EvidenceIndex(p).resolve([doc]) == ([], 0)
    for facts in [[], [{'doc_id':doc.id,'key':'python_version','value':'9.99','quote':'Python 9.99'}], [42]]:
        save_index({'format_version':1,'documents':{doc.id:{'fingerprint':fingerprint(doc),'claims':facts}}},p)
        assert EvidenceIndex(p).resolve([doc]) == ([], 0)
    save_index({'format_version':1,'documents':{doc.id:42}},p)
    assert EvidenceIndex(p).resolve([doc]) == ([], 0)


def test_tracker_migrates_old_database_and_recovers_audit(tmp_path):
    path = tmp_path/'registry.sqlite'
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE tickets(id INTEGER PRIMARY KEY,user_id TEXT,dedupe TEXT UNIQUE,kind TEXT,payload TEXT,status TEXT)")
        db.execute("INSERT INTO tickets VALUES(1,'user','old','mentor','{}','open')")
    tracker = Tracker(path)
    assert tracker.list_for('user')[0]['created_at'] is None
    tracker.audit_path.unlink()
    tracker = Tracker(path)
    record = tracker.create('user','new','mentor',{'service':'listing-search','question':'help'})
    assert record['id'] == 'BUDDY-2' and record['created_at']
    assert tracker.create('user','new','mentor',{}) == record
    lines = [json.loads(x) for x in tracker.audit_path.read_text().splitlines()]
    assert len(lines) == 2 and lines[-1]['payload']['question'] == 'help'
    assert tracker.list_for('someone-else') == []


def test_audit_export_failure_does_not_lose_committed_ticket(tmp_path):
    tracker = Tracker(tmp_path/'registry.sqlite')
    with patch('buddy.tracker.os.replace', side_effect=OSError('readonly export')):
        record = tracker.create('user','new','mentor',{'question':'help'})
    assert tracker.list_for('user')[0]['id'] == record['id']
