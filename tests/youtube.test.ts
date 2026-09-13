import { describe, it, expect } from 'vitest';
import { parseYouTubeUrl, buildEmbedUrl } from '@renderer/apps/YouTube/youtubeUrl.js';

describe('parseYouTubeUrl', () => {
  it('accepts bare video id', () => {
    expect(parseYouTubeUrl('dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
  });

  it('parses youtube.com/watch?v=ID', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ'
    });
  });

  it('parses youtu.be/ID', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ'
    });
  });

  it('parses youtube.com/embed/ID', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ'
    });
  });

  it('parses youtube.com/shorts/ID', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ'
    });
  });

  it('parses start time in seconds', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42s')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 42
    });
  });

  it('parses start time h/m/s form', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 90
    });
  });

  it('rejects empty input', () => {
    expect(parseYouTubeUrl('')).toBeNull();
    expect(parseYouTubeUrl('   ')).toBeNull();
  });

  it('rejects malformed URL', () => {
    expect(parseYouTubeUrl('not a url')).toBeNull();
  });

  it('rejects URL without video id', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/feed/trending')).toBeNull();
  });

  it('rejects ids of wrong length', () => {
    expect(parseYouTubeUrl('dQw4w9WgXc')).toBeNull();
  });
});

describe('buildEmbedUrl', () => {
  it('uses youtube-nocookie domain', () => {
    expect(buildEmbedUrl({ videoId: 'dQw4w9WgXcQ' })).toContain('youtube-nocookie.com');
  });

  it('includes start param when provided', () => {
    const url = buildEmbedUrl({ videoId: 'dQw4w9WgXcQ', startSeconds: 90 });
    expect(url).toContain('start=90');
  });
});