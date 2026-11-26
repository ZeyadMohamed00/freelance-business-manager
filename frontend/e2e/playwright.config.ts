import { defineConfig } from "@playwright/test";

// Real stack: FastAPI on :8000 (throwaway SQLite DB) plus the production build of the SPA on :4173.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173", channel: process.env.PW_CHANNEL || undefined, screenshot: "only-on-failure" },
  webServer: [
    {
      command: "rm -f e2e.db && DATABASE_URL=sqlite:///./e2e.db python -m uvicorn fb.main:app --port 8000",
      cwd: "../..",
      url: "http://localhost:8000/health",
      timeout: 60_000,
    },
    {
      command: "VITE_API_URL=http://localhost:8000 npm run build && npx vite preview --port 4173 --strictPort",
      cwd: "..",
      url: "http://localhost:4173",
      timeout: 90_000,
    },
  ],
});
