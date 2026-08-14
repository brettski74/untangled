import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const auth_origin =
  process.env.UNTANGLED_AUTH_ORIGIN ?? "http://127.0.0.1:3001";

export default defineConfig({
  // Keep prior scrollback (e.g. pytest/ruff from `make test`); Vite defaults to clearing.
  clearScreen: false,
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/api/v2/auth": {
        target: auth_origin,
      },
    },
  },
});
