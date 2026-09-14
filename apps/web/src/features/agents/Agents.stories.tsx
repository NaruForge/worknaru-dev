import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from '../../shell/App.js';
import { createFixture, type Scenario } from '../../testing/fixture.js';

function Example({ scenario }: { scenario: Scenario }) {
  const [fixture] = useState(() => createFixture(scenario));
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
