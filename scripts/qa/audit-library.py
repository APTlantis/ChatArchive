import collections
import hashlib
import json
import os
import pathlib
import sqlite3
import sys


library = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2])
expected = {
    "conversations": 733,
    "visibleMessages": 29861,
    "code": 36835,
    "assets": 5823,
    "documents": 1624,
    "links": 8838,
    "assetKinds": {"local": 5320, "external": 490, "missing": 13},
    "documentAvailability": {"local": 724, "missing": 900},
}

conn = sqlite3.connect(library / "chatarchive.db")
archive_index = json.loads(conn.execute("select value from app_meta where key='archive_index'").fetchone()[0])
artifact_index = json.loads(conn.execute("select value from app_meta where key='artifact_index'").fetchone()[0])
assets = [json.loads(row[0]) for row in conn.execute("select json from asset_artifacts")]
documents = [json.loads(row[0]) for row in conn.execute("select json from document_artifacts")]

actual = {
    "conversations": conn.execute("select count(*) from conversations").fetchone()[0],
    "visibleMessages": archive_index["totals"]["visibleMessages"],
    "code": conn.execute("select count(*) from code_artifacts").fetchone()[0],
    "assets": len(assets),
    "documents": len(documents),
    "links": conn.execute("select count(*) from link_artifacts").fetchone()[0],
    "assetKinds": dict(collections.Counter(item["kind"] for item in assets)),
    "documentAvailability": dict(collections.Counter("local" if (item.get("url") or "").startswith("local-file://") else "missing" for item in documents)),
}
assert actual == expected, f"Live invariant mismatch: {actual!r}"
assert artifact_index["totals"] == {key: expected[key] for key in ("code", "assets", "documents", "links")}

orphans = {}
for table in ("code_artifacts", "asset_artifacts", "document_artifacts", "link_artifacts"):
    orphans[table] = conn.execute(f"select count(*) from {table} a left join messages m on m.id=a.message_id and m.conversation_id=a.conversation_id where m.id is null").fetchone()[0]
assert not any(orphans.values()), f"Orphan artifacts: {orphans}"

def local_path(url):
    return pathlib.Path(url.removeprefix("local-file://"))

missing_local_files = [item["id"] for item in assets + documents if (item.get("url") or "").startswith("local-file://") and not local_path(item["url"]).is_file()]
assert not missing_local_files, f"Missing resolved files: {missing_local_files[:20]}"
assert all(".staging" not in (item.get("url") or "") for item in assets + documents)

fidelity = None
for item in documents:
    if not (item.get("url") or "").startswith("local-file://"):
        continue
    pointer = item.get("original", "").removeprefix("file-service://")
    source_file = source / f"{pointer}.dat"
    if source_file.is_file():
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        fidelity = {"artifactId": item["id"], "sourceSha256": digest(source_file), "archiveSha256": digest(local_path(item["url"])), "bytes": source_file.stat().st_size}
        assert fidelity["sourceSha256"] == fidelity["archiveSha256"]
        break
assert fidelity, "No recoverable document was available for fidelity verification"

result = {"status": "pass", "actual": actual, "orphans": orphans, "fidelity": fidelity, "databaseBytes": (library / "chatarchive.db").stat().st_size}
print(json.dumps(result))
