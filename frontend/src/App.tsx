import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chart, BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { api, type Client, type Doc, type Item, type Project, type Report, type Txn } from "./api";
import { Badge, Bar, Empty, Modal, Shell, Skeleton, Stat, Tabs, ToastProvider, useToast } from "./ui";

Chart.register(BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend);
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Page = "dashboard" | "clients" | "invoices" | "money" | "proposal";
const stKind = (s: string) => (s === "paid" || s === "accepted" ? "ok" : s === "sent" ? "info" : s === "draft" ? "" : "warn") as "ok" | "info" | "" | "warn";
const csv = (name: string, rows: (string | number)[][]) => {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name; a.click();
};

type D = { clients: Client[]; projects: Project[]; docs: Doc[]; txns: Txn[]; rep: Report | null; loading: boolean; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; go: (p: Page) => void };

function Charts({ r }: { r: Report }) {
  const bar = useRef<HTMLCanvasElement>(null), pie = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!bar.current || !pie.current) return;
    let a: Chart | undefined, b: Chart | undefined;
    try {
      a = new Chart(bar.current, { type: "bar", data: { labels: r.monthly.map((m) => m.month), datasets: [{ label: "Income", data: r.monthly.map((m) => m.income), backgroundColor: "#22c55e", borderRadius: 6 }, { label: "Expenses", data: r.monthly.map((m) => m.expense), backgroundColor: "#f87171", borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false } });
      b = new Chart(pie.current, { type: "doughnut", data: { labels: Object.keys(r.expenses_by_category), datasets: [{ data: Object.values(r.expenses_by_category), backgroundColor: ["#6366f1", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444", "#0ea5e9"] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "62%" } });
    } catch { /* canvas unavailable in tests */ }
    return () => { a?.destroy(); b?.destroy(); };
  }, [r]);
  return (<div className="grid g-main"><div className="card"><h3>Income vs expenses by month</h3><div className="cv"><canvas ref={bar} /></div></div>
    <div className="card"><h3>Expenses by category</h3><div className="cv"><canvas ref={pie} /></div></div></div>);
}

export function App() { return <ToastProvider><Main /></ToastProvider>; }

function Main() {
  const toast = useToast();
  const [page, setPage] = useState<Page>("dashboard");
  const [clients, setClients] = useState<Client[]>([]); const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]); const [txns, setTxns] = useState<Txn[]>([]); const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { setErr(""); const [c, p, d, t, r] = await Promise.all([api.clients(), api.projects(), api.documents(), api.txns(), api.report()]); setClients(c); setProjects(p); setDocs(d); setTxns(t); setRep(r); }
    catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); await load(); if (ok) toast(ok); } catch (e) { toast((e as Error).message, "bad"); } };
  const d: D = { clients, projects, docs, txns, rep, loading, act, go: setPage };
  const open = docs.filter((x) => x.kind === "invoice" && x.status !== "paid").length;
  return (
    <Shell brand="Freelance HQ" tagline="Business manager" page={page} onNav={(p) => setPage(p as Page)}
      nav={[{ id: "dashboard", label: "Dashboard", icon: "◎" }, { id: "clients", label: "Clients & projects", icon: "☺", badge: projects.length || undefined }, { id: "invoices", label: "Quotes & invoices", icon: "☰", badge: open || undefined }, { id: "money", label: "Income & expenses", icon: "$" }, { id: "proposal", label: "Proposal drafter", icon: "✎" }]}
      actions={<button className="btn" onClick={() => act(() => api.reset(), "Demo data reset")}>Reset demo data</button>}
      footer={<div className="muted small">DEMO: synthetic data, private to this browser. Nothing is emailed.</div>}>
      {err && <div className="card" role="alert" style={{ borderColor: "#ef4444", marginBottom: 12 }}>{err}</div>}
      {page === "dashboard" && <Dashboard {...d} />}
      {page === "clients" && <Clients {...d} />}
      {page === "invoices" && <Invoices {...d} />}
      {page === "money" && <Money {...d} />}
      {page === "proposal" && <Proposal {...d} />}
    </Shell>
  );
}

const total = (items: Item[]) => items.reduce((s, i) => s + i.qty * i.unit_price, 0);

function Dashboard({ rep, docs, projects, loading, go }: D) {
  if (loading || !rep) return <Skeleton lines={5} />;
  const unbilled = projects.reduce((s, p) => s + p.unbilled_amount, 0);
  const overdueDocs = docs.filter((x) => x.kind === "invoice" && x.status === "sent" && x.due && new Date(x.due) < new Date());
  const hours = Object.entries(rep.hours_by_project); const maxH = Math.max(1, ...hours.map(([, v]) => v));
  return (
    <>
      <div className="page-h"><div><h1>Dashboard</h1><p>Where your freelance business stands today.</p></div><div className="sp"><button className="btn primary" onClick={() => go("invoices")}>New quote</button></div></div>
      <div className="grid g4">
        <Stat label="Income" value={money(rep.income)} /><Stat label="Expenses" value={money(rep.expenses)} /><Stat label="Net" value={money(rep.net)} hint={rep.income ? `${Math.round((rep.net / rep.income) * 100)}% margin` : undefined} />
        <Stat label="Outstanding" value={money(rep.outstanding)} hint={overdueDocs.length ? `${overdueDocs.length} overdue` : "none overdue"} />
      </div>
      <div style={{ marginTop: 16 }}><Charts r={rep} /></div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h3>Hours by project</h3>{hours.length === 0 && <p className="muted">No hours logged.</p>}{hours.map(([k, v]) => <div key={k} style={{ marginBottom: 8 }}><div className="row" style={{ justifyContent: "space-between" }}><span>{k}</span><b>{v}h</b></div><Bar pct={(v / maxH) * 100} /></div>)}</div>
        <div className="card col"><h3 style={{ margin: 0 }}>Needs attention</h3>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Unbilled work</span><b>{money(unbilled)}</b></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Overdue invoices</span><b>{money(rep.overdue)}</b></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Draft invoices</span><b>{docs.filter((x) => x.kind === "invoice" && x.status === "draft").length}</b></div>
          <div className="row"><button className="btn" onClick={() => go("clients")}>Bill hours</button><button className="btn" onClick={() => go("invoices")}>Review invoices</button></div></div>
      </div>
    </>
  );
}

function Clients({ clients, projects, docs, act, loading }: D) {
  const [logFor, setLogFor] = useState<Project | null>(null);
  const [h, setH] = useState(""); const [note, setNote] = useState("");
  const [cName, setCName] = useState(""); const [cEmail, setCEmail] = useState("");
  const [pName, setPName] = useState(""); const [pRate, setPRate] = useState("40"); const [pClient, setPClient] = useState(0);
  const revenue = (c: Client) => docs.filter((x) => x.client_id === c.id && x.kind === "invoice" && x.status === "paid").reduce((s, x) => s + x.total, 0);
  return (
    <>
      <div className="page-h"><div><h1>Clients & projects</h1><p>Log hours, then turn unbilled hours into an invoice. Hours are billed once.</p></div></div>
      {loading ? <Skeleton lines={4} /> : (
        <>
          <div className="grid g3">{clients.map((c) => <div key={c.id} className="card row"><span className="avatar" style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 99, background: "var(--accent)", color: "#fff", fontWeight: 600 }}>{c.name[0]}</span><div><strong>{c.name}</strong><div className="muted small">{c.email || "no email"}</div><div className="small">Paid: <b>{money(revenue(c))}</b></div></div></div>)}</div>
          <div className="card" style={{ marginTop: 16, overflowX: "auto" }}><h3>Projects</h3>
            {projects.length === 0 ? <Empty title="No projects yet" hint="Add one below." /> : <table className="t"><thead><tr><th>Project</th><th>Client</th><th>Rate</th><th>Hours</th><th>Unbilled</th><th /></tr></thead><tbody>
              {projects.map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.client}</td><td>{money(p.hourly_rate)}/h</td><td>{p.hours}h</td><td>{p.unbilled_hours > 0 ? <Badge kind="warn">{p.unbilled_hours}h = {money(p.unbilled_amount)}</Badge> : <span className="muted">all billed</span>}</td>
                <td><div className="row"><button className="btn" onClick={() => { setLogFor(p); setH(""); setNote(""); }}>Log hours</button><button className="btn primary" disabled={p.unbilled_hours === 0} onClick={() => act(() => api.billHours(p.id), "Invoice created from hours")}>Create invoice from hours</button></div></td></tr>)}</tbody></table>}</div>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <form className="card col" onSubmit={(e) => { e.preventDefault(); act(() => api.addClient({ name: cName, email: cEmail }), "Client added"); setCName(""); setCEmail(""); }}><h3 style={{ margin: 0 }}>Add client</h3>
              <input placeholder="New client name" value={cName} onChange={(e) => setCName(e.target.value)} required /><input placeholder="Email (optional)" value={cEmail} onChange={(e) => setCEmail(e.target.value)} /><button className="btn primary">Add client</button></form>
            <form className="card col" onSubmit={(e) => { e.preventDefault(); act(() => api.addProject({ client_id: pClient || clients[0]?.id, name: pName, hourly_rate: Number(pRate) }), "Project added"); setPName(""); }}><h3 style={{ margin: 0 }}>Add project</h3>
              <input placeholder="New project" value={pName} onChange={(e) => setPName(e.target.value)} required />
              <div className="row"><select value={pClient} onChange={(e) => setPClient(Number(e.target.value))}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="number" min="1" style={{ width: 100 }} value={pRate} onChange={(e) => setPRate(e.target.value)} /><span className="muted small">per hour</span></div><button className="btn primary">Add project</button></form>
          </div>
        </>
      )}
      {logFor && <Modal title={`Log hours: ${logFor.name}`} onClose={() => setLogFor(null)}><form className="col" onSubmit={(e) => { e.preventDefault(); act(() => api.logTime({ project_id: logFor.id, hours: Number(h), note: note || "Logged" }), "Hours logged"); setLogFor(null); }}>
        <label className="f">Hours<input aria-label="Hours" type="number" step="0.5" min="0.5" value={h} onChange={(e) => setH(e.target.value)} required /></label>
        <label className="f">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" /></label>
        <div className="muted small">Adds {money(Number(h || 0) * logFor.hourly_rate)} of unbilled work.</div><button className="btn primary">Save</button></form></Modal>}
    </>
  );
}

function Invoices({ clients, docs, act, loading }: D) {
  const toast = useToast();
  const [f, setF] = useState<"all" | "quote" | "draft" | "sent" | "paid">("all");
  const [q, setQ] = useState(""); const [sel, setSel] = useState<Doc | null>(null); const [nq, setNq] = useState(false);
  const shown = docs.filter((x) => (f === "all" || (f === "quote" ? x.kind === "quote" : x.kind === "invoice" && x.status === f)) && (!q || `${x.number} ${x.client}`.toLowerCase().includes(q.toLowerCase())));
  const [client, setClient] = useState(0); const [lines, setLines] = useState<Item[]>([{ description: "", qty: 1, unit_price: 500 }]);
  const openPdf = async (id: number) => { try { window.open(await api.pdf(id), "_blank"); } catch (e) { toast((e as Error).message, "bad"); } };
  const sum = total(lines);
  return (
    <>
      <div className="page-h"><div><h1>Quotes & invoices</h1><p>Accept a quote to make an invoice. "Mark sent" only changes a status, nothing is emailed.</p></div><div className="sp"><button className="btn primary" onClick={() => setNq(true)}>New quote</button></div></div>
      <div className="row" style={{ marginBottom: 12 }}><Tabs tabs={(["all", "quote", "draft", "sent", "paid"] as const).map((t) => ({ id: t, label: t }))} value={f} onChange={setF} /><input aria-label="Search" placeholder="Search number or client" style={{ marginLeft: "auto" }} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {loading ? <Skeleton lines={4} /> : shown.length === 0 ? <Empty title="No documents" hint="Create a quote or bill hours." /> : (
        <div className="card" style={{ overflowX: "auto" }}><table className="t"><thead><tr><th>No.</th><th>Client</th><th>Total</th><th>Status</th><th>Due</th><th /></tr></thead><tbody>
          {shown.map((x) => <tr key={x.id}><td><button className="btn" style={{ border: 0, padding: 0, background: "none", color: "var(--accent)" }} onClick={() => setSel(x)}>{x.number}</button></td><td>{x.client}</td><td>{money(x.total)}</td><td><Badge kind={stKind(x.status)}>{x.status}</Badge></td><td className="muted">{x.due ?? ""}</td>
            <td><div className="row"><button className="btn" onClick={() => openPdf(x.id)}>PDF</button>
              {x.kind === "quote" && x.status === "draft" && <button className="btn" onClick={() => act(() => api.acceptQuote(x.id), "Quote accepted, invoice created")}>Accept, make invoice</button>}
              {x.kind === "invoice" && x.status === "draft" && <button className="btn" onClick={() => act(() => api.send(x.id), "Marked as sent")}>Mark sent</button>}
              {x.kind === "invoice" && x.status !== "paid" && <button className="btn primary" onClick={() => act(() => api.pay(x.id), "Marked paid")}>Mark paid</button>}</div></td></tr>)}</tbody></table></div>)}
      {sel && <Modal drawer title={`${sel.kind === "quote" ? "Quote" : "Invoice"} ${sel.number}`} onClose={() => setSel(null)}><div className="col">
        <div className="row"><Badge kind={stKind(sel.status)}>{sel.status}</Badge><span className="muted">{sel.client}</span></div>
        <div className="muted small">Issued {sel.issued}{sel.due ? `, due ${sel.due}` : ""}</div>
        <table className="t"><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>{sel.items.map((i, k) => <tr key={k}><td>{i.description}</td><td>{i.qty}</td><td>{money(i.unit_price)}</td></tr>)}</tbody></table>
        <div className="row" style={{ justifyContent: "space-between" }}><strong>Total</strong><strong>{money(sel.total)}</strong></div>
        <button className="btn" onClick={() => openPdf(sel.id)}>Open PDF</button></div></Modal>}
      {nq && <Modal title="New quote" onClose={() => setNq(false)}><form className="col lines" onSubmit={(e) => { e.preventDefault(); act(() => api.addQuote({ client_id: client || clients[0]?.id, items: lines }), "Quote created"); setNq(false); setLines([{ description: "", qty: 1, unit_price: 500 }]); }}>
        <label className="f">Client<select value={client} onChange={(e) => setClient(Number(e.target.value))}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {lines.map((l, i) => <div key={i} className="row"><input placeholder="Description" aria-label={`Description ${i + 1}`} required value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <input type="number" min="1" style={{ maxWidth: 70 }} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
          <input type="number" min="0" style={{ maxWidth: 110 }} value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) } : x)))} />
          {lines.length > 1 && <button type="button" className="btn" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>}</div>)}
        <div className="row"><button type="button" className="btn" onClick={() => setLines([...lines, { description: "", qty: 1, unit_price: 0 }])}>Add line</button><span style={{ marginLeft: "auto" }}>Total <b>{money(sum)}</b></span></div>
        <button className="btn primary">Create quote</button></form></Modal>}
    </>
  );
}

function Money({ txns, act, loading }: D) {
  const [f, setF] = useState<"all" | "income" | "expense">("all");
  const [kind, setKind] = useState("expense"); const [cat, setCat] = useState("software"); const [amt, setAmt] = useState(""); const [note, setNote] = useState("");
  const shown = txns.filter((t) => f === "all" || t.kind === f);
  const inc = txns.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0); const exp = txns.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  const cats = useMemo(() => { const m: Record<string, number> = {}; txns.filter((t) => t.kind === "expense").forEach((t) => { m[t.category] = (m[t.category] ?? 0) + t.amount; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [txns]);
  return (
    <>
      <div className="page-h"><div><h1>Income & expenses</h1><p>Every transaction, with totals and a CSV export.</p></div><div className="sp"><button className="btn" onClick={() => csv("transactions.csv", [["date", "type", "category", "amount", "note"], ...txns.map((t) => [t.day, t.kind, t.category, t.amount, t.note])])}>Export CSV</button></div></div>
      <div className="grid g3"><Stat label="Income" value={money(inc)} /><Stat label="Expenses" value={money(exp)} /><Stat label="Balance" value={money(inc - exp)} /></div>
      <div className="grid g-main" style={{ marginTop: 16 }}>
        <div className="card" style={{ overflowX: "auto" }}><div className="row" style={{ marginBottom: 8 }}><Tabs tabs={(["all", "income", "expense"] as const).map((t) => ({ id: t, label: t }))} value={f} onChange={setF} /></div>
          {loading ? <Skeleton lines={4} /> : shown.length === 0 ? <Empty title="No transactions" /> : <table className="t"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>{shown.map((t) => <tr key={t.id}><td>{t.day}</td><td><Badge kind={t.kind === "income" ? "ok" : "bad"}>{t.kind}</Badge></td><td>{t.category}</td><td className={t.kind === "income" ? "amt-in" : "amt-out"}>{t.kind === "income" ? "+" : "-"}{money(t.amount)}</td><td className="muted">{t.note}</td></tr>)}</tbody></table>}</div>
        <div className="col">
          <form className="card col" onSubmit={(e) => { e.preventDefault(); act(() => api.addTxn({ kind, category: cat, amount: Number(amt), note }), "Transaction added"); setAmt(""); setNote(""); }}><h3 style={{ margin: 0 }}>Add transaction</h3>
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}><option>expense</option><option>income</option></select>
            <input placeholder="Category" value={cat} onChange={(e) => setCat(e.target.value)} /><input type="number" step="0.01" min="0.01" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} required /><input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn primary">Add</button></form>
          <div className="card"><h3>Top expense categories</h3>{cats.slice(0, 5).map(([k, v]) => <div key={k} style={{ marginBottom: 8 }}><div className="row" style={{ justifyContent: "space-between" }}><span>{k}</span><b>{money(v)}</b></div><Bar pct={exp ? (v / exp) * 100 : 0} /></div>)}</div>
        </div>
      </div>
    </>
  );
}

function Proposal({ clients, act, go }: D) {
  const toast = useToast();
  const [pr, setPr] = useState({ client: "Nile Coffee (demo)", project: "Ordering app", scope: "Menu browsing; Cart and checkout; Order history", budget: "1800" });
  const [out, setOut] = useState<{ mode: string; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const gen = async () => { setBusy(true); try { setOut(await api.proposal({ client: pr.client, project: pr.project, scope: pr.scope, budget: pr.budget ? Number(pr.budget) : undefined })); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); } };
  const toQuote = () => act(async () => { await api.addQuote({ client_id: clients[0]?.id, items: [{ description: `${pr.project} (${pr.scope.split(";").length} deliverables)`, qty: 1, unit_price: Number(pr.budget || 0) }] }); go("invoices"); }, "Quote created from proposal");
  return (
    <>
      <div className="page-h"><div><h1>Proposal drafter</h1><p>Turn a short brief into a proposal. Without an LLM key the server uses a deterministic template and says so.</p></div></div>
      <div className="grid g2">
        <form className="card col" onSubmit={(e) => { e.preventDefault(); gen(); }}>
          <label className="f">Client<input value={pr.client} onChange={(e) => setPr({ ...pr, client: e.target.value })} required /></label>
          <label className="f">Project<input value={pr.project} onChange={(e) => setPr({ ...pr, project: e.target.value })} required /></label>
          <label className="f">Scope (separate deliverables with semicolons)<textarea rows={4} value={pr.scope} onChange={(e) => setPr({ ...pr, scope: e.target.value })} required /></label>
          <label className="f">Budget<input type="number" value={pr.budget} onChange={(e) => setPr({ ...pr, budget: e.target.value })} /></label>
          <button className="btn primary" disabled={busy}>{busy ? "Drafting..." : "Draft proposal"}</button></form>
        <div className="card col"><h3 style={{ margin: 0 }}>Result</h3>
          {!out ? <Empty title="No draft yet" hint="Fill in the brief and press Draft proposal." /> : <>
            <Badge kind="info">Generated by: {out.mode}</Badge><pre className="code">{out.text}</pre>
            <div className="row"><button className="btn" onClick={() => { navigator.clipboard?.writeText(out.text); toast("Copied"); }}>Copy</button>
              <button className="btn" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out.text], { type: "text/plain" })); a.download = "proposal.txt"; a.click(); }}>Download .txt</button>
              <button className="btn primary" onClick={toQuote}>Create quote from this</button></div></>}</div>
      </div>
    </>
  );
}
