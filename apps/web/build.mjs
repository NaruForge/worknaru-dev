import { build } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { brand } from "@worknaru/branding";
import { renderBrand } from "./branding.mjs";

const directory = fileURLToPath(new URL("./", import.meta.url));
await build({
  configFile: false,
  root: path.join(directory, "src"),
  base: "./",
  plugins: [
    react(),
    {
      name: "worknaru-brand",
      transformIndexHtml: (html) => renderBrand(html, brand),
    },
  ],
  build: {
    outDir: path.join(directory, "dist"),
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        entryFileNames: "app.js",
        assetFileNames: "styles.css",
        codeSplitting: false,
      },
    },
  },
});
const cssPath = path.join(directory, "dist/styles.css");
await writeFile(
  cssPath,
  `:root { --brand-color: ${brand.accentColor}; --brand-on-color: ${brand.onAccentColor}; }\n${await readFile(cssPath, "utf8")}`,
);
const brandDirectory = path.dirname(
  fileURLToPath(import.meta.resolve("@worknaru/branding")),
);
for (const asset of [brand.logo, brand.favicon].filter(Boolean))
  await copyFile(
    path.join(brandDirectory, asset),
    path.join(directory, "dist", asset),
  );
