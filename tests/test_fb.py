from datetime import date
from fastapi.testclient import TestClient
from fb.main import app

c = TestClient(app)
H = lambda n="fbclient-00001": {"X-Client-Id": n}


def get(path, n): return c.get(path, headers=H(n)).json()


def test_seeded_report_numbers_are_consistent():
    n = "seed-client-0001"
    r = get("/report", n)
    assert r["income"] == 450.0 and r["expenses"] == 289.5 and r["net"] == 160.5
    assert r["outstanding"] == 0 and r["hours_by_project"]["Website redesign"] == 9.5
    assert sum(m["income"] for m in r["monthly"]) == r["income"] and r["expenses_by_category"]["software"] == 87.0


def test_invoice_from_unbilled_hours_bills_once_and_pays_into_income():
    n = "bill-client-0001"; get("/clients", n)
    p = [x for x in get("/projects", n) if x["name"] == "Website redesign"][0]
    assert p["unbilled_hours"] == 9.5 and p["unbilled_amount"] == 380.0
    inv = c.post(f"/projects/{p['id']}/invoice", headers=H(n)).json()
    assert inv["total"] == 380.0 and inv["status"] == "draft" and len(inv["items"]) == 3
    assert c.post(f"/projects/{p['id']}/invoice", headers=H(n)).status_code == 409  # nothing left to bill
    assert get("/report", n)["outstanding"] == 380.0
    assert c.post(f"/invoices/{inv['id']}/pay", headers=H(n)).json()["status"] == "paid"
    assert c.post(f"/invoices/{inv['id']}/pay", headers=H(n)).status_code == 409
    r = get("/report", n)
    assert r["income"] == 830.0 and r["outstanding"] == 0


def test_quote_accept_creates_invoice_and_numbers_increment():
    n = "quote-client-001"; cl = get("/clients", n)[0]
    q = c.post("/quotes", headers=H(n), json={"client_id": cl["id"], "items": [{"description": "Logo", "qty": 2, "unit_price": 50}]}).json()
    assert q["number"] == "Q-002" and q["total"] == 100.0
    inv = c.post(f"/quotes/{q['id']}/accept", headers=H(n)).json()
    assert inv["kind"] == "invoice" and inv["total"] == 100.0 and inv["number"] == "INV-002" and inv["due"] > inv["issued"]


def test_pdf_is_a_real_pdf():
    n = "pdf-client-00001"; d = get("/documents", n)[0]
    r = c.get(f"/documents/{d['id']}/pdf", headers=H(n))
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:5] == b"%PDF-" and len(r.content) > 1000


def test_expense_and_validation():
    n = "exp-client-00001"
    assert c.post("/txns", headers=H(n), json={"kind": "expense", "category": "tools", "amount": 10}).status_code == 201
    assert c.post("/txns", headers=H(n), json={"kind": "expense", "amount": -5}).status_code == 422
    assert c.post("/txns", headers=H(n), json={"kind": "gift", "amount": 5}).status_code == 422
    assert c.post("/time", headers=H(n), json={"project_id": 999999, "hours": 1}).status_code == 404
    assert c.post("/quotes", headers=H(n), json={"client_id": 1, "items": []}).status_code == 422


def test_isolation():
    a, b = "iso-owner-000001", "iso-owner-000002"
    d = get("/documents", a)[0]
    assert c.get(f"/documents/{d['id']}/pdf", headers=H(b)).status_code == 404
    assert c.post(f"/invoices/{d['id']}/pay", headers=H(b)).status_code == 404
    assert c.get("/clients").status_code == 400


def test_proposal_template_and_fixed_vs_hourly():
    n = "prop-client-0001"
    r = c.post("/proposals", headers=H(n), json={"client": "Acme", "project": "Site", "scope": "Design; Build; Launch", "budget": 1500}).json()
    assert r["mode"].startswith("template") and "1. Design" in r["text"] and "Fixed fee: 1,500.00" in r["text"]
    r = c.post("/proposals", headers=H(n), json={"client": "Acme", "project": "Site", "scope": "x", "hourly_rate": 40}).json()
    assert "Hourly rate: 40.00" in r["text"]


def test_concurrent_first_load_seeds_once():
    from concurrent.futures import ThreadPoolExecutor
    n = "race-client-0001"
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda p: c.get(p, headers=H(n)), ["/clients", "/documents", "/txns", "/report", "/clients", "/documents"]))
    assert len(get("/clients", n)) == 2 and get("/report", n)["income"] == 450.0


def test_projects_endpoint_seeds_on_first_call():
    assert len(get("/projects", "projfirst-000001")) == 2
