import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "./App";

const rep = { income: 450, expenses: 289.5, net: 160.5, outstanding: 0, overdue: 0, monthly: [{ month: "2026-10", income: 450, expense: 100 }], expenses_by_category: { software: 87 }, hours_by_project: { Site: 9.5 } };
const data: Record<string, unknown> = {
  "/clients": [{ id: 1, name: "Acme", email: "" }],
  "/projects": [{ id: 1, client_id: 1, client: "Acme", name: "Site", hourly_rate: 40, hours: 9.5, unbilled_hours: 9.5, unbilled_amount: 380 }],
  "/documents": [{ id: 1, kind: "invoice", number: "INV-001", client: "Acme", client_id: 1, items: [], total: 450, status: "draft", issued: "2026-10-01", due: "2026-10-15" }],
  "/txns": [], "/report": rep,
};

test("shows KPIs, lets user bill hours and mark an invoice paid", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (full: string, init?: RequestInit) => {
    const url = full.replace(/^\/api/, "");
    const m = init?.method ?? "GET"; calls.push(`${m} ${url}`);
    return { ok: true, status: 200, json: async () => (m === "GET" ? data[url] : {}) } as Response;
  }));
  render(<App />);
  expect(await screen.findByText("160.50")).toBeInTheDocument();
  expect(screen.getByText(/DEMO: synthetic data/)).toBeInTheDocument();
  await userEvent.click(screen.getByText("projects"));
  await userEvent.click(screen.getByText("Create invoice from hours"));
  await waitFor(() => expect(calls).toContain("POST /projects/1/invoice"));
  await userEvent.click(screen.getByText("documents"));
  await userEvent.click(screen.getByText("Mark paid"));
  await waitFor(() => expect(calls).toContain("POST /invoices/1/pay"));
});

test("shows API errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, statusText: "boom", json: async () => ({ detail: "db down" }) }) as Response));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("db down");
});
