// Lightweight Piped proxy endpoint - separate from the main stream resolver
// This avoids importing heavy dependencies that may crash the function

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi',
  'https://pipedapi.adminforge.de',
  'https://watchapi.whatever.social',
  'https://pipedapi.colby.host'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://inv.tux.pizza',
  'https://iv.ggtyler.dev',
  'https://invidious.protokoll-11.de',
  'https://vid.puffyan.us'
];

async function fetchPiped(baseUrl, id, signal) {
  const res = await fetch(`${baseUrl}/streams/${id}`, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const stream = (data.audioStreams || [])
    .filter(s => s.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (stream?.url) return stream.url;
  throw new Error('No audioStreams');
}

async function fetchInvidious(baseUrl, id, signal) {
  const res = await fetch(`${baseUrl}/api/v1/videos/${id}`, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const audio = (data.adaptiveFormats || [])
    .filter(f => f.type?.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (audio?.url) return audio.url;
  throw new Error('No audio formats');
}

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  // Create all fetch promises with individual timeouts
  const allPromises = [];

  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    allPromises.push(
      fetchPiped(instance, id, controller.signal)
        .then(url => { clearTimeout(timeoutId); return url; })
        .catch(err => { clearTimeout(timeoutId); throw err; })
    );
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    allPromises.push(
      fetchInvidious(instance, id, controller.signal)
        .then(url => { clearTimeout(timeoutId); return url; })
        .catch(err => { clearTimeout(timeoutId); throw err; })
    );
  }

  try {
    const url = await Promise.any(allPromises);
    return res.json({ url, source: 'piped-proxy' });
  } catch (err) {
    return res.status(503).json({
      error: 'All instances failed',
      details: err.errors ? err.errors.map(e => e.message) : [err.message]
    });
  }
}

export const config = {
  maxDuration: 15
};
