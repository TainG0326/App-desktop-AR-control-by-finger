/**
 * Parse a YouTube URL into a video id + optional start seconds.
 *
 * Accepted forms:
 *   https://www.youtube.com/watch?v=ID
 *   https://www.youtube.com/watch?v=ID&t=42s
 *   https://www.youtube.com/watch?v=ID&t=42
 *   https://youtu.be/ID
 *   https://youtu.be/ID?t=42s
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/live/ID
 *   ID (11-char video id)
 */
export interface ParsedYouTube {
  videoId: string;
  startSeconds?: number;
}

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeUrl(input: string): ParsedYouTube | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Bare video id.
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return { videoId: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  let videoId: string | null = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.replace(/^\//, '').split('/')[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    const path = url.pathname;
    if (path === '/watch') {
      videoId = url.searchParams.get('v');
    } else if (path.startsWith('/embed/')) {
      videoId = path.split('/')[2] ?? null;
    } else if (path.startsWith('/shorts/') || path.startsWith('/live/')) {
      videoId = path.split('/')[2] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) return null;

  const out: ParsedYouTube = { videoId };
  const t = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (t) {
    const seconds = parseTimeParam(t);
    if (seconds !== undefined) out.startSeconds = seconds;
  }
  return out;
}

function parseTimeParam(t: string): number | undefined {
  // Accept plain seconds, "42s", "1m30s", "1h2m3s".
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const re = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
  const m = re.exec(t);
  if (!m) return undefined;
  const h = parseInt(m[1] ?? '0', 10);
  const mn = parseInt(m[2] ?? '0', 10);
  const s = parseInt(m[3] ?? '0', 10);
  if (!h && !mn && !s) return undefined;
  return h * 3600 + mn * 60 + s;
}

export function buildEmbedUrl(parsed: ParsedYouTube): string {
  const params = new URLSearchParams();
  params.set('rel', '0');
  params.set('modestbranding', '1');
  if (parsed.startSeconds && parsed.startSeconds > 0) {
    params.set('start', String(Math.floor(parsed.startSeconds)));
  }
  return `https://www.youtube-nocookie.com/embed/${parsed.videoId}?${params.toString()}`;
}