import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";


function figmaAssetResolver() {
  return {
    name: "figma-asset-resolver",
    resolveId(id) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "");
        return path.resolve(__dirname, "src/assets", filename);
      }
    },
  };
}

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? process.env.API_URL ?? "http://localhost:8000";
const allowedHostsEnv = process.env.VITE_ALLOWED_HOSTS ?? "swiftmemo.balingit.me";
const allowedHosts =
  allowedHostsEnv.trim().toLowerCase() === "true"
    ? true
    : allowedHostsEnv
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 7860,
    allowedHosts,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/health": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 7860,
    allowedHosts,
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
