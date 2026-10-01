import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": process.env.BACKEND_URL || "http://localhost:8000" } },
  test: { environment: "jsdom", setupFiles: "./src/setupTests.js", globals: true },
});
