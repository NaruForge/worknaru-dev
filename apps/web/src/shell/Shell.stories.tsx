import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App.js';
import { createDataFixture } from '../testing/dataFixture.js';
import { createFixture } from '../testing/fixture.js';
function Shell({ dataMode = 'ready' }: { dataMode?: 'ready' | 'loading' | 'error' | 'blocked' }) {
  const [fixture] = useState(() => createFixture('continuity'));
  const [dataClient] = useState(() => createDataFixture(dataMode));
  return <App core={fixture.core} dataClient={dataClient} />;
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

export const DataStorage: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '설정' }));
    await userEvent.click(canvas.getByRole('button', { name: '데이터 관리' }));
  },
};
export const DataReset: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '설정' }));
    await userEvent.click(canvas.getByRole('button', { name: '데이터 관리' }));
    await userEvent.click(await canvas.findByRole('button', { name: '초기화 대상 확인' }));
  },
};

export const DataLoading: Story = { args: { dataMode: 'loading' }, play: DataStorage.play! };
export const DataError: Story = { args: { dataMode: 'error' }, play: DataStorage.play! };
export const DataBlocked: Story = { args: { dataMode: 'blocked' }, play: DataReset.play! };
