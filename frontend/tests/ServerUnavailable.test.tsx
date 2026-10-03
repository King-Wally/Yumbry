import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ServerUnavailable from '../src/components/ServerUnavailable';
import {
  getServerStatus,
  onServerRecovered,
  reportServerSuspect,
  resetServerStatus,
} from '../src/lib/server-status';

async function goDown() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await act(async () => {
    reportServerSuspect();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ServerUnavailable', () => {
  beforeEach(() => resetServerStatus());
  afterEach(() => vi.unstubAllGlobals());

  it('makes the app root inert while down and restores it after recovery', async () => {
    const root = document.body.appendChild(document.createElement('div'));
    root.id = 'root';
    try {
      render(<ServerUnavailable />);
      await goDown();
      expect(root).toHaveAttribute('inert');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(root).not.toHaveAttribute('inert'));
    } finally {
      root.remove();
    }
  });

  it('renders nothing while the server is up', () => {
    render(<ServerUnavailable />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('covers the app when down and lifts after a successful retry', async () => {
    const recovered = vi.fn();
    onServerRecovered(recovered);
    render(<ServerUnavailable />);
    await goDown();
    expect(screen.getByRole('heading', { name: 'Temporarily offline' })).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(getServerStatus()).toBe('up');
    expect(recovered).toHaveBeenCalledOnce();
  });

  it('stays up on screen when the retry still fails', async () => {
    render(<ServerUnavailable />);
    await goDown();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
