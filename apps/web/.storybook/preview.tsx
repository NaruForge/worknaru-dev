import type { Preview } from "@storybook/react-vite";
import { brand } from "@worknaru/branding";
import "../src/styles.css";
document.documentElement.lang = "ko";
document.documentElement.style.setProperty("--brand-color", brand.accentColor);
document.documentElement.style.setProperty(
  "--brand-on-color",
  brand.onAccentColor,
);
const preview: Preview = { parameters: { layout: "fullscreen" } };
export default preview;
