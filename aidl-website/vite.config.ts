import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: { format: "es" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // scripts/dev.ts reloads once, after the complete package has been written.
    watch: { ignored: ["**/aidl-parser/dist/**"] },
  },
});
