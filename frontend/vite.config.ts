import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      // So the browser talks to the FastAPI service without CORS in dev.
      //
      // 127.0.0.1 and not "localhost". On Windows, Node resolves localhost
      // to ::1 first and does not fall back, while uvicorn binds 127.0.0.1
      // only - so every /api call answers 502 and the app looks like the
      // backend is down when it is running perfectly well.
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
