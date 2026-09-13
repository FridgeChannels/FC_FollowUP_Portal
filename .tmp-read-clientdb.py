import json
import urllib.request
from pathlib import Path

env = Path("/Users/tzchao/MyProject/FC_FollowUP_Portal/.env").read_text()
key = [line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("NOTION_API_KEY=")][0]
headers = {
    "Authorization": f"Bearer {key}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}


def get(url):
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def post(url, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def summarize(db):
    title = "".join(x.get("plain_text", "") for x in (db.get("title") or []))
    print(f"\n===== {title} =====")
    print("id", db.get("id"))
    print("url", db.get("url"))
    print("archived", db.get("archived"))
    desc = "".join(x.get("plain_text", "") for x in (db.get("description") or []))
    if desc:
        print("description", desc[:300])
    props = db.get("properties") or {}
    print("property_count", len(props))
    for name, prop in props.items():
        t = prop.get("type")
        extra = ""
        if t == "select":
            extra = " options=[" + ", ".join(o.get("name", "") for o in prop.get("select", {}).get("options", [])) + "]"
        elif t == "status":
            groups = prop.get("status", {}).get("groups", [])
            opts = prop.get("status", {}).get("options", [])
            extra = " options=[" + ", ".join(f"{o.get('name')}({o.get('color')})" for o in opts) + "]"
            if groups:
                extra += " groups=[" + ", ".join(f"{g.get('name')}:{len(g.get('option_ids') or [])}" for g in groups) + "]"
        elif t == "multi_select":
            extra = " options=[" + ", ".join(o.get("name", "") for o in prop.get("multi_select", {}).get("options", [])) + "]"
        elif t == "relation":
            rel = prop.get("relation") or {}
            extra = f" -> {rel.get('database_id')} type={rel.get('type')}"
        elif t == "rollup":
            r = prop.get("rollup") or {}
            extra = f" fn={r.get('function')} rel={r.get('relation_property_name')} roll={r.get('rollup_property_name')}"
        elif t == "formula":
            extra = " expr=" + ((prop.get("formula") or {}).get("expression") or "")[:120]
        print(f"  - {name} | {t}{extra}")


client_id = "8b04a997-c66f-40dd-8f23-7234450f3c58"
db = get(f"https://api.notion.com/v1/databases/{client_id}")
summarize(db)
Path("/tmp/followup-clientdb.json").write_text(json.dumps(db, indent=2, ensure_ascii=False))

rows = post(f"https://api.notion.com/v1/databases/{client_id}/query", {"page_size": 20})
print("\n===== ROWS =====")
print("count_returned", len(rows.get("results", [])), "has_more", rows.get("has_more"))


def title_of(p):
    t = p.get("type")
    if t == "title":
        return "".join(x.get("plain_text", "") for x in p.get("title") or [])
    if t == "rich_text":
        return "".join(x.get("plain_text", "") for x in p.get("rich_text") or [])
    if t == "select":
        sel = p.get("select")
        return sel.get("name") if sel else None
    if t == "status":
        st = p.get("status")
        return st.get("name") if st else None
    if t == "people":
        return ",".join(u.get("name") or u.get("id") for u in p.get("people") or [])
    if t == "relation":
        return f"{len(p.get('relation') or [])} rels"
    if t == "rollup":
        r = p.get("rollup") or {}
        return f"{r.get('type')}={r.get('date') or r.get('number') or r.get('array')}"
    if t == "date":
        d = p.get("date") or {}
        return d.get("start")
    if t == "created_time":
        return p.get("created_time")
    if t == "last_edited_time":
        return p.get("last_edited_time")
    return t


for page in rows.get("results", []):
    props = page.get("properties") or {}
    summary = {k: title_of(v) for k, v in props.items()}
    print(page.get("id"), summary)

print("\n===== SEARCH CP =====")
for q in ["CPDictionary", "Follow-up-CP", "CPDictionaryDB"]:
    data = post(
        "https://api.notion.com/v1/search",
        {"query": q, "filter": {"value": "database", "property": "object"}, "page_size": 20},
    )
    print(q, "count", len(data.get("results", [])))
    for r in data.get("results", []):
        title = "".join(x.get("plain_text", "") for x in (r.get("title") or []))
        print("-", title, r.get("id"))
