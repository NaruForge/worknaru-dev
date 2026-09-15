import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceDomainError } from '@worknaru/core';
import { App } from '../../shell/App.js';
import { createFixture } from '../../testing/fixture.js';
import { sampleWorkspace, workspaceFixture } from '../../testing/workspaceFixture.js';

function Workspaces({
  mode = 'ready',
}: {
  mode?: 'ready' | 'empty' | 'loading' | 'error' | 'uncertain';
}) {
  const [core] = useState(() => {
    const fixture = createFixture();
    const workspace = workspaceFixture(mode === 'empty');
    if (mode === 'loading') workspace.listWorkspaces = () => new Promise(() => {});
    if (mode === 'error')
      workspace.listWorkspaces = async () => {
        throw new WorkspaceDomainError('connection_failed', '실행 환경에 연결할 수 없습니다.');
      };
    if (mode === 'uncertain')
      workspace.createWorkspace = async () => {
        throw new WorkspaceDomainError('timeout', '생성 요청의 응답을 확인하지 못했습니다.');
      };
    return { ...fixture.core, workspace };
  });
  return <App core={core} />;
}
const meta = { title: 'Product/Workspaces', component: Workspaces } satisfies Meta<
  typeof Workspaces
>;
export default meta;
type Story = StoryObj<typeof meta>;
const open: NonNullable<Story['play']> = async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('button', { name: 'Workspace' }));
};
export const Ready: Story = { play: open };
export const Selected: Story = {
  play: async (context) => {
    await open(context);
    await context.canvas.findByRole('option', { name: new RegExp(sampleWorkspace.name) });
    await context.userEvent.selectOptions(
      context.canvas.getByLabelText('Workspace 선택'),
      sampleWorkspace.id,
    );
  },
};
export const Empty: Story = { args: { mode: 'empty' }, play: open };
export const Loading: Story = { args: { mode: 'loading' }, play: open };
export const Error: Story = { args: { mode: 'error' }, play: open };
export const Uncertain: Story = { args: { mode: 'uncertain' }, play: open };
