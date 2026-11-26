from collections import defaultdict
from datetime import date, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db as D
from .pdf import render, total
from .proposal import draft


def get_db():
    with D.Session() as s:
        yield s


def owner(x_client_id: str = Header(default="")):
    if not (8 <= len(x_client_id) <= 64) or not x_client_id.replace("-", "").isalnum():
        raise HTTPException(400, "Missing or invalid X-Client-Id header")
    return x_client_id


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(default="", max_length=200)


class ProjectIn(BaseModel):
    client_id: int
    name: str = Field(min_length=1, max_length=120)
    hourly_rate: float = Field(ge=0, le=10000)


class TimeIn(BaseModel):
    project_id: int
    hours: float = Field(gt=0, le=24)
    note: str = Field(default="", max_length=200)
    day: date | None = None


class Item(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    qty: float = Field(gt=0, le=100000)
    unit_price: float = Field(ge=0, le=1_000_000)


class DocIn(BaseModel):
    client_id: int
    items: list[Item] = Field(min_length=1, max_length=50)


class TxnIn(BaseModel):
    kind: str = Field(pattern="^(income|expense)$")
    category: str = Field(default="", max_length=40)
    amount: float = Field(gt=0, le=10_000_000)
    note: str = Field(default="", max_length=200)
    day: date | None = None


class ProposalIn(BaseModel):
    client: str = Field(min_length=1, max_length=120)
    project: str = Field(min_length=1, max_length=120)
    scope: str = Field(min_length=1, max_length=2000)
    budget: float | None = Field(default=None, gt=0)
    hourly_rate: float | None = Field(default=None, gt=0)


def create_app():
    D.init()
    app = FastAPI(title="Freelance Business Manager", version="1.0.0")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    def get_own(db, model, o, id_):
        r = db.get(model, id_)
        if not r or r.owner != o:
            raise HTTPException(404, "Not found")
        return r

    def doc_out(d, names):
        return {
            "id": d.id,
            "kind": d.kind,
            "number": d.number,
            "client_id": d.client_id,
            "client": names.get(d.client_id, ""),
            "items": d.items,
            "total": total(d.items),
            "status": d.status,
            "issued": d.issued.isoformat(),
            "due": d.due.isoformat() if d.due else None,
        }

    def names(db, o):
        return {c.id: c.name for c in db.query(D.Client).filter_by(owner=o)}

    def next_number(db, o, kind):
        n = db.query(D.Document).filter_by(owner=o, kind=kind).count() + 1
        return f"{'INV' if kind == 'invoice' else 'Q'}-{n:03d}"

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/clients")
    def clients(o: str = Depends(owner), db=Depends(get_db)):
        D.ensure_seed(db, o)
        return [
            {"id": c.id, "name": c.name, "email": c.email}
            for c in db.query(D.Client).filter_by(owner=o).order_by(D.Client.id)
        ]

    @app.post("/clients", status_code=201)
    def add_client(b: ClientIn, o: str = Depends(owner), db=Depends(get_db)):
        c = D.Client(owner=o, **b.model_dump())
        db.add(c)
        db.commit()
        return {"id": c.id, "name": c.name, "email": c.email}

    @app.get("/projects")
    def projects(o: str = Depends(owner), db=Depends(get_db)):
        D.ensure_seed(db, o)
        nm = names(db, o)
        out = []
        for p in db.query(D.Project).filter_by(owner=o).order_by(D.Project.id):
            ts = db.query(D.TimeEntry).filter_by(owner=o, project_id=p.id).all()
            un = sum(t.hours for t in ts if t.invoice_id is None)
            out.append(
                {
                    "id": p.id,
                    "client_id": p.client_id,
                    "client": nm.get(p.client_id, ""),
                    "name": p.name,
                    "hourly_rate": p.hourly_rate,
                    "hours": sum(t.hours for t in ts),
                    "unbilled_hours": un,
                    "unbilled_amount": round(un * p.hourly_rate, 2),
                }
            )
        return out

    @app.post("/projects", status_code=201)
    def add_project(b: ProjectIn, o: str = Depends(owner), db=Depends(get_db)):
        get_own(db, D.Client, o, b.client_id)
        p = D.Project(owner=o, **b.model_dump())
        db.add(p)
        db.commit()
        return {"id": p.id}

    @app.post("/time", status_code=201)
    def add_time(b: TimeIn, o: str = Depends(owner), db=Depends(get_db)):
        get_own(db, D.Project, o, b.project_id)
        t = D.TimeEntry(
            owner=o, project_id=b.project_id, hours=b.hours, note=b.note, day=b.day or date.today()
        )
        db.add(t)
        db.commit()
        return {"id": t.id}

    @app.get("/documents")
    def documents(o: str = Depends(owner), db=Depends(get_db)):
        D.ensure_seed(db, o)
        nm = names(db, o)
        return [
            doc_out(d, nm)
            for d in db.query(D.Document).filter_by(owner=o).order_by(D.Document.id.desc())
        ]

    @app.post("/quotes", status_code=201)
    def add_quote(b: DocIn, o: str = Depends(owner), db=Depends(get_db)):
        get_own(db, D.Client, o, b.client_id)
        d = D.Document(
            owner=o,
            kind="quote",
            number=next_number(db, o, "quote"),
            client_id=b.client_id,
            items=[i.model_dump() for i in b.items],
            issued=date.today(),
        )
        db.add(d)
        db.commit()
        return doc_out(d, names(db, o))

    @app.post("/quotes/{did}/accept")
    def accept_quote(did: int, o: str = Depends(owner), db=Depends(get_db)):
        q = get_own(db, D.Document, o, did)
        if q.kind != "quote":
            raise HTTPException(422, "Not a quote")
        q.status = "accepted"
        inv = D.Document(
            owner=o,
            kind="invoice",
            number=next_number(db, o, "invoice"),
            client_id=q.client_id,
            items=q.items,
            issued=date.today(),
            due=date.today() + timedelta(days=14),
        )
        db.add(inv)
        db.commit()
        return doc_out(inv, names(db, o))

    @app.post("/invoices", status_code=201)
    def add_invoice(b: DocIn, o: str = Depends(owner), db=Depends(get_db)):
        get_own(db, D.Client, o, b.client_id)
        d = D.Document(
            owner=o,
            kind="invoice",
            number=next_number(db, o, "invoice"),
            client_id=b.client_id,
            items=[i.model_dump() for i in b.items],
            issued=date.today(),
            due=date.today() + timedelta(days=14),
        )
        db.add(d)
        db.commit()
        return doc_out(d, names(db, o))

    @app.post("/projects/{pid}/invoice", status_code=201)
    def invoice_from_hours(pid: int, o: str = Depends(owner), db=Depends(get_db)):
        p = get_own(db, D.Project, o, pid)
        ts = db.query(D.TimeEntry).filter_by(owner=o, project_id=pid, invoice_id=None).all()
        if not ts:
            raise HTTPException(409, "No unbilled hours")
        d = D.Document(
            owner=o,
            kind="invoice",
            number=next_number(db, o, "invoice"),
            client_id=p.client_id,
            issued=date.today(),
            due=date.today() + timedelta(days=14),
            items=[
                {
                    "description": f"{p.name}: {t.note or 'work'} ({t.day})",
                    "qty": t.hours,
                    "unit_price": p.hourly_rate,
                }
                for t in ts
            ],
        )
        db.add(d)
        db.flush()
        for t in ts:
            t.invoice_id = d.id  # an hour can be billed only once
        db.commit()
        return doc_out(d, names(db, o))

    @app.post("/invoices/{did}/send")
    def send_invoice(did: int, o: str = Depends(owner), db=Depends(get_db)):
        d = get_own(db, D.Document, o, did)
        if d.kind != "invoice" or d.status != "draft":
            raise HTTPException(
                409, "Only draft invoices can be marked sent (this demo sends nothing)"
            )
        d.status = "sent"
        db.commit()
        return doc_out(d, names(db, o))

    @app.post("/invoices/{did}/pay")
    def pay_invoice(did: int, o: str = Depends(owner), db=Depends(get_db)):
        d = get_own(db, D.Document, o, did)
        if d.kind != "invoice" or d.status == "paid":
            raise HTTPException(409, "Not an unpaid invoice")
        d.status = "paid"
        db.add(
            D.Txn(
                owner=o,
                kind="income",
                category="invoice",
                amount=total(d.items),
                day=date.today(),
                note=d.number,
                document_id=d.id,
            )
        )
        db.commit()
        return doc_out(d, names(db, o))

    @app.get("/documents/{did}/pdf")
    def pdf(did: int, o: str = Depends(owner), db=Depends(get_db)):
        d = get_own(db, D.Document, o, did)
        return Response(
            render(d, names(db, o).get(d.client_id, "")),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{d.number}.pdf"'},
        )

    @app.get("/txns")
    def txns(o: str = Depends(owner), db=Depends(get_db)):
        D.ensure_seed(db, o)
        return [
            {
                "id": t.id,
                "kind": t.kind,
                "category": t.category,
                "amount": t.amount,
                "day": t.day.isoformat(),
                "note": t.note,
            }
            for t in db.query(D.Txn).filter_by(owner=o).order_by(D.Txn.day.desc(), D.Txn.id.desc())
        ]

    @app.post("/txns", status_code=201)
    def add_txn(b: TxnIn, o: str = Depends(owner), db=Depends(get_db)):
        t = D.Txn(
            owner=o,
            kind=b.kind,
            category=b.category,
            amount=b.amount,
            note=b.note,
            day=b.day or date.today(),
        )
        db.add(t)
        db.commit()
        return {"id": t.id}

    @app.get("/report")
    def report(o: str = Depends(owner), db=Depends(get_db)):
        D.ensure_seed(db, o)
        monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        cats = defaultdict(float)
        for t in db.query(D.Txn).filter_by(owner=o):
            monthly[t.day.strftime("%Y-%m")][t.kind] += t.amount
            if t.kind == "expense":
                cats[t.category or "other"] += t.amount
        inc = sum(m["income"] for m in monthly.values())
        exp = sum(m["expense"] for m in monthly.values())
        docs = db.query(D.Document).filter_by(owner=o, kind="invoice").all()
        outstanding = sum(total(d.items) for d in docs if d.status in ("draft", "sent"))
        overdue = sum(
            total(d.items) for d in docs if d.status in ("sent",) and d.due and d.due < date.today()
        )
        hours = defaultdict(float)
        pn = {p.id: p.name for p in db.query(D.Project).filter_by(owner=o)}
        for t in db.query(D.TimeEntry).filter_by(owner=o):
            hours[pn.get(t.project_id, "?")] += t.hours
        return {
            "income": round(inc, 2),
            "expenses": round(exp, 2),
            "net": round(inc - exp, 2),
            "outstanding": round(outstanding, 2),
            "overdue": round(overdue, 2),
            "monthly": [
                {"month": k, **{a: round(b, 2) for a, b in v.items()}}
                for k, v in sorted(monthly.items())
            ],
            "expenses_by_category": {k: round(v, 2) for k, v in cats.items()},
            "hours_by_project": {k: round(v, 2) for k, v in hours.items()},
        }

    @app.post("/proposals")
    def proposal(b: ProposalIn, o: str = Depends(owner)):
        return draft(b.client, b.project, b.scope, b.budget, b.hourly_rate)

    @app.post("/demo/reset", status_code=204)
    def reset(o: str = Depends(owner), db=Depends(get_db)):
        for M in (D.Txn, D.Document, D.TimeEntry, D.Project, D.Client):
            db.query(M).filter_by(owner=o).delete()
        db.commit()

    return app


app = create_app()
