import os
from datetime import date, timedelta

from sqlalchemy import JSON, Date, Float, ForeignKey, Integer, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine(
    os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres@localhost/fb"), pool_pre_ping=True
)
Session = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Client(Base):
    __tablename__ = "fb_clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), default="")


class Project(Base):
    __tablename__ = "fb_projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("fb_clients.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    hourly_rate: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(12), default="active")


class TimeEntry(Base):
    __tablename__ = "fb_time"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("fb_projects.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    hours: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")
    invoice_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # set once billed


class Document(Base):
    """Quote or invoice. items = [{description, qty, unit_price}]"""

    __tablename__ = "fb_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # quote | invoice
    number: Mapped[str] = mapped_column(String(20))
    client_id: Mapped[int] = mapped_column(ForeignKey("fb_clients.id", ondelete="CASCADE"))
    items: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(
        String(10), default="draft"
    )  # quote: draft|accepted ; invoice: draft|sent|paid
    issued: Mapped[date] = mapped_column(Date)
    due: Mapped[date | None] = mapped_column(Date, nullable=True)


class Txn(Base):
    __tablename__ = "fb_txns"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(7))  # income | expense
    category: Mapped[str] = mapped_column(String(40), default="")
    amount: Mapped[float] = mapped_column(Float)
    day: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String(200), default="")
    document_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


def init():
    Base.metadata.create_all(engine)


def ensure_seed(db, owner):
    if owner.startswith("user:"):
        return  # real accounts start empty; only anonymous guests get demo data
    # The UI fires several GETs at once on first load; serialise per owner so the demo data is seeded exactly once.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:o))"), {"o": owner})
    if db.query(Client).filter_by(owner=owner).first():
        return
    t = date.today()
    c1, c2 = (
        Client(owner=owner, name="Acme Studio (demo)", email="billing@acme.example"),
        Client(owner=owner, name="Nile Coffee (demo)", email="hello@nilecoffee.example"),
    )
    db.add_all([c1, c2])
    db.flush()
    p1, p2 = (
        Project(owner=owner, client_id=c1.id, name="Website redesign", hourly_rate=40),
        Project(owner=owner, client_id=c2.id, name="Ordering app", hourly_rate=35),
    )
    db.add_all([p1, p2])
    db.flush()
    for i, (p, h, n) in enumerate(
        [
            (p1, 3.5, "Wireframes"),
            (p1, 4, "Homepage build"),
            (p1, 2, "Revisions"),
            (p2, 5, "API design"),
            (p2, 3, "Menu screens"),
        ]
    ):
        db.add(
            TimeEntry(owner=owner, project_id=p.id, day=t - timedelta(days=i + 1), hours=h, note=n)
        )
    inv = Document(
        owner=owner,
        kind="invoice",
        number="INV-001",
        client_id=c1.id,
        items=[{"description": "Logo design", "qty": 1, "unit_price": 450.0}],
        status="paid",
        issued=t - timedelta(days=50),
        due=t - timedelta(days=20),
    )
    db.add(inv)
    db.flush()
    db.add(
        Txn(
            owner=owner,
            kind="income",
            category="invoice",
            amount=450.0,
            day=t - timedelta(days=35),
            note="INV-001",
            document_id=inv.id,
        )
    )
    for k, (cat, amt, d) in enumerate(
        [
            ("software", 29.0, 12),
            ("software", 29.0, 42),
            ("equipment", 180.0, 25),
            ("transport", 22.5, 8),
            ("software", 29.0, 72),
        ]
    ):
        db.add(
            Txn(
                owner=owner,
                kind="expense",
                category=cat,
                amount=amt,
                day=t - timedelta(days=d),
                note=f"demo {cat}",
            )
        )
    db.add(
        Document(
            owner=owner,
            kind="quote",
            number="Q-001",
            client_id=c2.id,
            items=[{"description": "Ordering app MVP", "qty": 1, "unit_price": 1800.0}],
            status="draft",
            issued=t,
        )
    )
    db.commit()
