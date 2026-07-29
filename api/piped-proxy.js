// Endpoint proxy ligero de Piped e Invidious para Vercel
// Ejecutado Servidor-a-Servidor (sin restricciones de CORS del navegador)

const PIPED_INSTANCES = [
  'https://api.piped.video',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.colby.cloud',
  'https://pipedapi.kavin.rocks'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.riverside.rocks',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space',
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr'
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
  // CORS Headers universales
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
    return res.status(400).json({ error: 'ID de video inválido' });
  }

  const allPromises = [];

  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    allPromises.push(
      fetchPiped(instance, id, controller.signal)
        .then(url => { clearTimeout(timeoutId); return url; })
        .catch(err => { clearTimeout(timeoutId); throw err; })
    );
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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
      error: 'Todas las instancias fallaron',
      details: err.errors ? err.errors.map(e => e.message) : [err.message]
    });
  }
}

export const config = {
  maxDuration: 10
};
