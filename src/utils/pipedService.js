/**
 * PIPED SERVICE
 * 
 * Auto-healing client for fetching from public Piped API instances.
 * If one instance fails or is blocked by CORS, it automatically tries fallback instances
 * until it finds a working one, which it then caches for subsequent calls.
 */

const FALLBACK_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.ox7.ch',
  'https://pipedapi.col.st',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.kavin.rocks'
];

let workingInstance = null;
let instanceList = [];
let isFetchingInstances = false;

// Fetch latest active instances from status page
async function getInstances() {
  if (instanceList.length > 0) return instanceList;
  
  if (isFetchingInstances) {
    // Wait slightly or return fallbacks immediately to avoid concurrent fetch blocks
    return FALLBACK_INSTANCES;
  }

  isFetchingInstances = true;
  try {
    // Use a short timeout of 3 seconds for the status API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch('https://piped-instances.kavin.rocks/', { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      // Filter healthy instances and sort by uptime
      const healthy = data
        .filter(inst => inst.api_url && (inst.uptime_24h > 90 || inst.uptime_7d > 90))
        .map(inst => inst.api_url.replace(/\/$/, '')); // remove trailing slash
      
      if (healthy.length > 0) {
        // Shuffle or keep order, we prefer they are in healthy list
        instanceList = Array.from(new Set([...healthy, ...FALLBACK_INSTANCES]));
        return instanceList;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch dynamic Piped instances, using fallback list:", e);
  } finally {
    isFetchingInstances = false;
  }
  
  instanceList = [...FALLBACK_INSTANCES];
  return instanceList;
}

/**
 * Perform a fetch request to Piped, trying multiple instances if one fails or blocks CORS.
 * @param {string} path - E.g. "/search?q=..." or "/streams/..."
 * @returns {Promise<any>}
 */
export async function fetchFromPiped(path) {
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // 1. Try currently working instance first
  if (workingInstance) {
    try {
      const url = `${workingInstance}${cleanPath}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        return await res.json();
      }
      // If it fails (e.g. 500, 429), reset workingInstance and search other instances
      workingInstance = null;
    } catch (err) {
      console.warn(`Working instance ${workingInstance} failed, will retry other instances`, err);
      workingInstance = null;
    }
  }

  // 2. Fetch list of instances
  const urls = await getInstances();
  
  // 3. Try each instance in sequence
  for (const baseUrl of urls) {
    try {
      const url = `${baseUrl}${cleanPath}`;
      console.log(`Trying Piped instance: ${baseUrl}${cleanPath}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout so we don't hang
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        // Double check if data is valid (e.g. search endpoint should return items/audioStreams)
        if (data && (data.items || data.audioStreams || data.streams)) {
          workingInstance = baseUrl; // remember this working instance
          console.log(`Successfully connected to Piped instance: ${baseUrl}`);
          return data;
        }
      }
    } catch (err) {
      console.warn(`Piped instance ${baseUrl} failed for path ${cleanPath}:`, err);
    }
  }

  // If all failed, throw a readable error
  throw new Error("All Piped API instances failed or blocked by CORS. Please try again later.");
}

/**
 * Helper to get the stream URL directly using the current working instance (or fallback).
 * Used when we need to generate an absolute URL to pass to player.
 * @param {string} songId - YouTube Video ID
 * @returns {string} - Absolute URL to stream endpoint
 */
export function getStreamUrlEndpoint(songId) {
  const base = workingInstance || FALLBACK_INSTANCES[0];
  return `${base}/streams/${songId}`;
}
