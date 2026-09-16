import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from '../../shell/App.js';
import { createFixture, type Scenario } from '../../testing/fixture.js';

function Example({ scenario }: { scenario: Scenario }) {
  const [fixture] = useState(() => createFixture(scenario));
  // Story-only transitions let browser tests exercise incoming server state on
  // the actual App without adding test controls to the product bundle.
  useEffect(() => {
    const permission = () => {
      const agent = fixture.agents[0];
      if (!agent) return;
      agent.permissions.push({
        id: `incoming-${agent.permissions.length}`,
        kind: 'tool',
        title: '새 승인이 필요합니다',
        description: '파일을 확인합니다.',
        input: {},
        actions: [],
      });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const queue = () => {
      const agent = fixture.agents[0];
      if (!agent) return;
      fixture.requests.push({
        id: `incoming-${fixture.requests.length}`,
        agentId: agent.id,
        text: '새 대기 메시지',
        mode: 'queue',
        context: { type: 'standalone', workspaceId: null, projectId: null },
        state: 'queued',
        turnId: null,
        createdAt: '2026-09-14T01:00:00.000Z',
        error: null,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.addEventListener('worknaru:fixture-permission', permission);
    window.addEventListener('worknaru:fixture-queue', queue);
    return () => {
      window.removeEventListener('worknaru:fixture-permission', permission);
      window.removeEventListener('worknaru:fixture-queue', queue);
    };
  }, [fixture]);
  return <App core={fixture.core} />;
}
const meta = { title: 'Product/Agents', component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Conversation: Story = { args: { scenario: 'conversation' } };
export const Empty: Story = { args: { scenario: 'empty' } };
export const Loading: Story = { args: { scenario: 'loading' } };
export const Error: Story = { args: { scenario: 'error' } };
export const Permission: Story = { args: { scenario: 'permission' } };
export const Uncertain: Story = { args: { scenario: 'uncertain' } };
export const Archived: Story = { args: { scenario: 'archived' } };
export const Long: Story = { args: { scenario: 'long' } };
export const Continuity: Story = { args: { scenario: 'continuity' } };
export const Many: Story = { args: { scenario: 'many' } };
export const ListArchive: Story = {
  args: { scenario: 'continuity' },
  parameters: {
    docs: {
      description: {
        story:
          '목록 행의 보관 아이콘으로 선택하지 않은 Agent도 사전 확인 후 보관합니다. 주간 업무 정리에 초안을 쓰고 고객 미팅 준비를 보관하면 현재 대화가 유지됩니다.',
      },
    },
  },
};
