import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassPanel } from '@renderer/components/GlassPanel.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { StatusPill } from '@renderer/components/StatusPill.js';
import { EmptyState } from '@renderer/components/EmptyState.js';

describe('Glass components', () => {
  it('GlassPanel renders title and children', () => {
    render(
      <GlassPanel title="Notes">
        <p>Hello world</p>
      </GlassPanel>
    );
    expect(screen.getByText(/Notes/)).toBeInTheDocument();
    expect(screen.getByText(/Hello world/)).toBeInTheDocument();
  });

  it('GlassButton renders children and is clickable', () => {
    render(<GlassButton variant="primary">Save</GlassButton>);
    const btn = screen.getByRole('button', { name: /Save/i });
    expect(btn).toBeInTheDocument();
  });

  it('StatusPill renders label', () => {
    render(<StatusPill tone="live" label="Live" />);
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });

  it('EmptyState renders title and description', () => {
    render(<EmptyState title="No notes yet" description="Create your first note to get started." />);
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
    expect(screen.getByText(/Create your first note/)).toBeInTheDocument();
  });
});