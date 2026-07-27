import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageDocument = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageDocument.version),
  },
  plugins: [react()],
});
