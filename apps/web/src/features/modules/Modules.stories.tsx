import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ModuleError } from '@worknaru/core';
import { App } from '../../shell/App.js';
import { createFixture } from '../../testing/fixture.js';
import { moduleFixture, sampleRun } from '../../testing/moduleFixture.js';

function Modules({
  mode = 'ready',
}: {
  mode?: 'ready' | 'empty' | 'loading' | 'error' | 'lost' | 'failed' | 'uncertain' | 'running';
}) {
  const [core] = useState(() => {
    const fixture = createFixture();
    const run =
      mode === 'failed' || mode === 'uncertain' || mode === 'running'
        ? { ...sampleRun, status: mode, result: null }
        : sampleRun;
    const core = {
      ...fixture.core,
      modules: moduleFixture(fixture.core.workspace, mode === 'empty' ? [] : [run]),
    };
    if (mode === 'loading') core.modules.list = () => new Promise(() => {});
    if (mode === 'error')
      core.modules.list = async () => {
        throw new ModuleError('connection_failed', '실행 환경에 연결할 수 없습니다.');
      };
    if (mode === 'lost') {
      const execute = core.modules.execute;
      let first = true;
      core.modules.execute = async (request) => {
        const run = await execute(request);
        if (first) {
          first = false;
          throw new ModuleError('timeout', '실행 응답을 확인하지 못했습니다.');
        }
        return run;
      };
    }
    return core;
  });
  return <App core={core} />;
}
const meta = { title: 'Product/Modules', component: Modules } satisfies Meta<typeof Modules>;
export default meta;
type Story = StoryObj<typeof meta>;
const open: NonNullable<Story['play']> = async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('button', { name: 'Module' }));
};
const selected: NonNullable<Story['play']> = async (context) => {
  await open(context);
  await context.userEvent.click(
    await context.canvas.findByRole('button', { name: new RegExp(sampleRun.id) }),
  );
};
export const Ready: Story = { play: open };
export const Result: Story = { play: selected };
export const Empty: Story = { args: { mode: 'empty' }, play: open };
export const Loading: Story = { args: { mode: 'loading' }, play: open };
export const Error: Story = { args: { mode: 'error' }, play: open };
export const LostResponse: Story = { args: { mode: 'lost' }, play: open };
export const Failed: Story = { args: { mode: 'failed' }, play: selected };
export const Uncertain: Story = { args: { mode: 'uncertain' }, play: selected };
export const Running: Story = { args: { mode: 'running' }, play: selected };
