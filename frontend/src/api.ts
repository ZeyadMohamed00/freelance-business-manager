import { authHeaders, getToken, logout } from "./auth";
export const API_BASE: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "");

export function clientId(): string {
  let id = localStorage.getItem("fb_client_id");
  if (!id) {
    id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^a-zA-Z0-9-]/g, "");
    localStorage.setItem("fb_client_id", id);
  }
  return id;
}

async function raw(path: string, method = "GET", body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { "X-Client-Id": clientId() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  Object.assign(headers, authHeaders());
  const res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    if (res.status === 401 && getToken()) logout();
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* keep */ }
    throw new Error(msg);
  }
  return res;
}
async function req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await raw(path, method, body);
  return r.status === 204 ? (undefined as T) : r.json();
}

export type Client = { id: number; name: string; email: string };
export type Project = { id: number; client_id: number; client: string; name: string; hourly_rate: number; hours: number; unbilled_hours: number; unbilled_amount: number };
export type Item = { description: string; qty: number; unit_price: number };
export type Doc = { id: number; kind: string; number: string; client: string; client_id: number; items: Item[]; total: number; status: string; issued: string; due: string | null };
export type Txn = { id: number; kind: string; category: string; amount: number; day: string; note: string };
export type Report = { income: number; expenses: number; net: number; outstanding: number; overdue: number; monthly: { month: string; income: number; expense: number }[]; expenses_by_category: Record<string, number>; hours_by_project: Record<string, number> };

export const api = {
  clients: () => req<Client[]>("/clients"),
  addClient: (b: { name: string; email: string }) => req<Client>("/clients", "POST", b),
  projects: () => req<Project[]>("/projects"),
  addProject: (b: { client_id: number; name: string; hourly_rate: number }) => req<{ id: number }>("/projects", "POST", b),
  logTime: (b: { project_id: number; hours: number; note: string }) => req<{ id: number }>("/time", "POST", b),
  billHours: (id: number) => req<Doc>(`/projects/${id}/invoice`, "POST", {}),
  documents: () => req<Doc[]>("/documents"),
  addQuote: (b: { client_id: number; items: Item[] }) => req<Doc>("/quotes", "POST", b),
  acceptQuote: (id: number) => req<Doc>(`/quotes/${id}/accept`, "POST", {}),
  send: (id: number) => req<Doc>(`/invoices/${id}/send`, "POST", {}),
  pay: (id: number) => req<Doc>(`/invoices/${id}/pay`, "POST", {}),
  pdf: async (id: number) => URL.createObjectURL(await (await raw(`/documents/${id}/pdf`)).blob()),
  txns: () => req<Txn[]>("/txns"),
  addTxn: (b: { kind: string; category: string; amount: number; note: string }) => req<{ id: number }>("/txns", "POST", b),
  report: () => req<Report>("/report"),
  proposal: (b: { client: string; project: string; scope: string; budget?: number; hourly_rate?: number }) => req<{ mode: string; text: string }>("/proposals", "POST", b),
  reset: () => req<void>("/demo/reset", "POST", {}),
};
