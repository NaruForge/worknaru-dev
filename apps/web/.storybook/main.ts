import type { StorybookConfig } from "@storybook/react-vite";
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../../../packages/ui/src/**/*.stories.tsx",
    "../src/**/*.stories.tsx",
  ],
  core: { disableTelemetry: true },
};
export default config;
