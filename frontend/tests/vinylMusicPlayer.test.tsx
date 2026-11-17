import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VinylMusicPlayer } from '../src/components/audio/VinylMusicPlayer';
import { lofiAudio, TRACKS } from '../src/lib/lofiAudioEngine';

describe('VinylMusicPlayer & Lo-Fi Audio Engine', () => {
  beforeEach(() => {
    lofiAudio.stop();
  });

  it('renders compact floating vinyl dock button with CircleUp 33⅓ label', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<VinylMusicPlayer />);
    });

    const playButton = host.querySelector('button[aria-label*="Play background vinyl music"]');
    expect(playButton).not.toBeNull();
    expect(host.textContent).toContain('33⅓ Vinyl');
    expect(host.textContent).toContain('Play Music');
  });

  it('toggles playback on click and reflects running state', async () => {
    const toggleSpy = vi.spyOn(lofiAudio, 'toggle').mockImplementation(async () => {
      return true;
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<VinylMusicPlayer />);
    });

    const playButton = host.querySelector('button[aria-label*="Play background vinyl music"]') as HTMLButtonElement;
    expect(playButton).not.toBeNull();

    await act(async () => {
      playButton.click();
    });

    expect(toggleSpy).toHaveBeenCalled();
  });

  it('expands into full vintage turntable console with tonearm and track metadata', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<VinylMusicPlayer />);
    });

    const expandButton = host.querySelector('button[aria-label="Open vinyl turntable controls"]') as HTMLButtonElement;
    expect(expandButton).not.toBeNull();

    act(() => {
      expandButton.click();
    });

    // Turntable dialog
    const dialog = host.querySelector('div[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(host.textContent).toContain(TRACKS[0]!.title);
    expect(host.textContent).toContain(TRACKS[0]!.subtitle);
    expect(host.textContent).toContain('Crackle');

    // Volume slider exists
    const volumeSlider = host.querySelector('input[type="range"]');
    expect(volumeSlider).not.toBeNull();

    // Minimize button works
    const minimizeBtn = host.querySelector('button[aria-label="Minimize vinyl player"]') as HTMLButtonElement;
    expect(minimizeBtn).not.toBeNull();

    act(() => {
      minimizeBtn.click();
    });

    expect(host.querySelector('div[role="dialog"]')).toBeNull();
  });

  it('allows cycling mood tracks and adjusting volume', () => {
    const nextTrackSpy = vi.spyOn(lofiAudio, 'nextTrack');
    const setVolumeSpy = vi.spyOn(lofiAudio, 'setVolume');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<VinylMusicPlayer />);
    });

    const expandButton = host.querySelector('button[aria-label="Open vinyl turntable controls"]') as HTMLButtonElement;
    act(() => {
      expandButton.click();
    });

    const nextBtn = host.querySelector('button[aria-label="Next mood track"]') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();
    act(() => {
      nextBtn.click();
    });
    expect(nextTrackSpy).toHaveBeenCalled();

    const volumeSlider = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(volumeSlider).not.toBeNull();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(volumeSlider, '0.8');
      volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
      volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(setVolumeSpy).toHaveBeenCalledWith(0.8);
  });
});
