import { useEffect, useRef, useState, useCallback } from "react";
import { Chart, BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { api, Client, Project, Doc, Txn, Report } from "./api";

Chart.register(BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend);
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Tab = "dashboard" | "projects" | "documents" | "money" | "proposal";

function Charts({ r }: { r: Report }) {
  const bar = useRef<HTMLCanvasElement>(null), pie = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!bar.current || !pie.current) return;
    let a: Chart | undefined, b: Chart | undefined;
    try {
      a = new Chart(bar.current, { type: "bar", data: { labels: r.monthly.map((m) => m.month), datasets: [
        { label: "Income", data: r.monthly.map((m) => m.income), backgroundColor: "#16a34a" }, { label: "Expenses", data: r.monthly.map((m) => m.expense), backgroundColor: "#dc2626" }] },
        options: { responsive: true, maintainAspectRatio: false } });
      b = new Chart(pie.current, { type: "doughnut", data: { labels: Object.keys(r.expenses_by_category), datasets: [{ data: Object.values(r.expenses_by_category), backgroundColor: ["#2563eb", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444"] }] },
        options: { responsive: true, maintainAspectRatio: false } });
    } catch { /* canvas unavailable (tests) */ }
    return () => { a?.destroy(); b?.destroy(); };
  }, [r]);
  return (<div className="charts"><div className="card"><h3>Income vs expenses by month</h3><div className="cv"><canvas ref={bar} /></div></div>
    <div className="card"><h3>Expenses by category</h3><div className="cv"><canvas ref={pie} /></div></div></div>);
}

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [clients, setClients] = useState<Client[]>([]); const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]); const [txns, setTxns] = useState<Txn[]>([]); const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setErr(""); const [c, p, d, t, r] = await Promise.all([api.clients(), api.projects(), api.documents(), api.txns(), api.report()]); setClients(c); setProjects(p); setDocs(d); setTxns(t); setRep(r); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const [pName, setPName] = useState(""); const [pRate, setPRate] = useState("40"); const [pClient, setPClient] = useState(0);
  const [cName, setCName] = useState(""); const [hours, setHours] = useState<Record<number, string>>({});
  const [qDesc, setQDesc] = useState(""); const [qPrice, setQPrice] = useState("500"); const [qClient, setQClient] = useState(0);
  const [tKind, setTKind] = useState("expense"); const [tCat, setTCat] = useState("software"); const [tAmt, setTAmt] = useState("");
  const [pr, setPr] = useState({ client: "Nile Coffee (demo)", project: "Ordering app", scope: "Menu browsing; Cart and checkout; Order history", budget: "1800" });
  const [prOut, setPrOut] = useState<{ mode: string; text: string } | null>(null);

  const openPdf = async (id: number) => { try { window.open(await api.pdf(id), "_blank"); } catch (e) { setErr((e as Error).message); } };
  const cid = (v: number) => v || clients[0]?.id || 0;

  return (
    <div className="app">
      <header>
        <h1>Freelance Business Manager</h1>
        <span className="badge">DEMO: synthetic data, private to this browser</span>
        <button disabled={busy} onClick={() => act(async () => { await api.reset(); })}>Reset demo data</button>
      </header>
      <nav>{(["dashboard", "projects", "documents", "money", "proposal"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {err && <div className="err" role="alert">{err}</div>}

      {tab === "dashboard" && rep && (<section>
        <div className="kpis">
          <div className="card"><small>Income</small><b>{money(rep.income)}</b></div><div className="card"><small>Expenses</small><b>{money(rep.expenses)}</b></div>
          <div className="card"><small>Net</small><b>{money(rep.net)}</b></div><div className="card"><small>Outstanding invoices</small><b>{money(rep.outstanding)}</b></div>
        </div>
        <Charts r={rep} />
        <div className="card"><h3>Hours by project</h3>{Object.entries(rep.hours_by_project).map(([k, v]) => <div key={k}>{k}: <b>{v}h</b></div>)}</div>
      </section>)}

      {tab === "projects" && (<section>
        <div className="card"><h3>Clients</h3>{clients.map((c) => <div key={c.id}>{c.name} <small>{c.email}</small></div>)}
          <form onSubmit={(e) => { e.preventDefault(); act(() => api.addClient({ name: cName, email: "" })); setCName(""); }}>
            <input placeholder="New client name" value={cName} onChange={(e) => setCName(e.target.value)} required /><button>Add client</button></form></div>
        <div className="card"><h3>Projects and hours</h3>
          <table><thead><tr><th>Project</th><th>Client</th><th>Rate</th><th>Hours</th><th>Unbilled</th><th>Log hours</th><th /></tr></thead><tbody>
            {projects.map((p) => (<tr key={p.id}><td>{p.name}</td><td>{p.client}</td><td>{money(p.hourly_rate)}</td><td>{p.hours}</td><td>{p.unbilled_hours}h = {money(p.unbilled_amount)}</td>
              <td><input className="s" type="number" step="0.5" min="0.5" placeholder="h" value={hours[p.id] ?? ""} onChange={(e) => setHours({ ...hours, [p.id]: e.target.value })} />
                <button disabled={!hours[p.id]} onClick={() => act(async () => { await api.logTime({ project_id: p.id, hours: Number(hours[p.id]), note: "Logged" }); setHours({ ...hours, [p.id]: "" }); })}>Log</button></td>
              <td><button disabled={p.unbilled_hours === 0} onClick={() => act(() => api.billHours(p.id))}>Create invoice from hours</button></td></tr>))}</tbody></table>
          <form onSubmit={(e) => { e.preventDefault(); act(() => api.addProject({ client_id: pClient || clients[0]?.id, name: pName, hourly_rate: Number(pRate) })); setPName(""); }}>
            <input placeholder="New project" value={pName} onChange={(e) => setPName(e.target.value)} required />
            <select value={pClient} onChange={(e) => setPClient(Number(e.target.value))}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input className="s" type="number" value={pRate} onChange={(e) => setPRate(e.target.value)} /><button>Add project</button></form></div>
      </section>)}

      {tab === "documents" && (<section>
        <div className="card"><h3>Quotes and invoices</h3>
          <table><thead><tr><th>No.</th><th>Client</th><th>Total</th><th>Status</th><th>Due</th><th /></tr></thead><tbody>
            {docs.map((d) => (<tr key={d.id}><td>{d.number}</td><td>{d.client}</td><td>{money(d.total)}</td><td><span className={`st ${d.status}`}>{d.status}</span></td><td>{d.due ?? ""}</td>
              <td><button onClick={() => openPdf(d.id)}>PDF</button>
                {d.kind === "quote" && d.status === "draft" && <button onClick={() => act(() => api.acceptQuote(d.id))}>Accept, make invoice</button>}
                {d.kind === "invoice" && d.status === "draft" && <button onClick={() => act(() => api.send(d.id))}>Mark sent</button>}
                {d.kind === "invoice" && d.status !== "paid" && <button onClick={() => act(() => api.pay(d.id))}>Mark paid</button>}</td></tr>))}</tbody></table></div>
        <div className="card"><h3>New quote</h3>
          <form onSubmit={(e) => { e.preventDefault(); act(() => api.addQuote({ client_id: cid(qClient), items: [{ description: qDesc, qty: 1, unit_price: Number(qPrice) }] })); setQDesc(""); }}>
            <select value={qClient} onChange={(e) => setQClient(Number(e.target.value))}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input placeholder="Description" value={qDesc} onChange={(e) => setQDesc(e.target.value)} required />
            <input className="s" type="number" min="0" value={qPrice} onChange={(e) => setQPrice(e.target.value)} /><button>Create quote</button></form></div>
        <small>Nothing is emailed. "Mark sent" only changes the status.</small>
      </section>)}

      {tab === "money" && (<section>
        <div className="card"><h3>Income and expenses</h3>
          <form onSubmit={(e) => { e.preventDefault(); act(() => api.addTxn({ kind: tKind, category: tCat, amount: Number(tAmt), note: "" })); setTAmt(""); }}>
            <select value={tKind} onChange={(e) => setTKind(e.target.value)}><option>expense</option><option>income</option></select>
            <input placeholder="Category" value={tCat} onChange={(e) => setTCat(e.target.value)} />
            <input className="s" type="number" step="0.01" min="0.01" placeholder="Amount" value={tAmt} onChange={(e) => setTAmt(e.target.value)} required /><button>Add</button></form>
          <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>
            {txns.map((t) => <tr key={t.id}><td>{t.day}</td><td>{t.kind}</td><td>{t.category}</td><td className={t.kind}>{money(t.amount)}</td><td>{t.note}</td></tr>)}</tbody></table></div>
      </section>)}

      {tab === "proposal" && (<section><div className="card"><h3>Proposal drafter</h3>
        <form onSubmit={(e) => { e.preventDefault(); act(async () => setPrOut(await api.proposal({ client: pr.client, project: pr.project, scope: pr.scope, budget: pr.budget ? Number(pr.budget) : undefined }))); }}>
          <input value={pr.client} onChange={(e) => setPr({ ...pr, client: e.target.value })} required /><input value={pr.project} onChange={(e) => setPr({ ...pr, project: e.target.value })} required />
          <textarea rows={3} value={pr.scope} onChange={(e) => setPr({ ...pr, scope: e.target.value })} required />
          <input type="number" placeholder="Budget" value={pr.budget} onChange={(e) => setPr({ ...pr, budget: e.target.value })} /><button>Draft proposal</button></form>
        {prOut && <><p><span className="badge">Generated by: {prOut.mode}</span></p><pre>{prOut.text}</pre></>}</div></section>)}
    </div>
  );
}
