import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from '../shell/App.js';

const meta = {
  title: 'Verification/Connection',
  component: App,
  parameters: {
    docs: {
      description: {
        story:
          'Playwright supplies connection.json and WebSocket frames. Without that fixture this shows the ordinary connection preparation screen.',
      },
    },
  },
} satisfies Meta<typeof App>;
export default meta;

// No injected Core: compile and exercise the production bootstrap and pinned SDK.
export const Identity: StoryObj<typeof meta> = { render: () => <App /> };
