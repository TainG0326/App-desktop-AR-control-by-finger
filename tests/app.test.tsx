import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '@renderer/App.js';

describe('App shell', () => {
  it('renders the spatial OS brand', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText(/AirVision Desktop/i).length).toBeGreaterThan(0);
    });
  });

  it('renders the footer with telemetry-free badge', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Không đám mây/i)).toBeInTheDocument();
    });
  });

  it('renders the dock with all app entries', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Mở Ghi chú/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mở YouTube/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mở Vẽ/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mở Cài đặt/i)).toBeInTheDocument();
    });
  });
});