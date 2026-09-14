import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App.js';
import { createFixture } from '../testing/fixture.js';
function Shell() {
  const [fixture] = useState(() => createFixture('continuity'));
  return <App core={fixture.core} />;
}
const meta = { title: 'Product/Shell', component: Shell } satisfies Meta<typeof Shell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Settings: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '설정' }));
  },
};
export const UnsavedSettings: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '설정' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Agent 동작' }));
    await userEvent.selectOptions(await canvas.findByLabelText('기본 전송 방식'), 'steer');
  },
};
