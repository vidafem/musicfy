/**
 * Realiza una petición fetch con un tiempo de espera (timeout) configurable.
 * Útil para evitar bloqueos del cliente cuando el backend (por ejemplo en Render) está en cold start (durmiendo).
 * 
 * @param {string} url - URL a la que se hace fetch
 * @param {object} options - Opciones del fetch (headers, method, etc.)
 * @param {number} timeoutMs - Tiempo de espera máximo en milisegundos (por defecto 10000ms)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Timeout de conexión al backend (${timeoutMs / 1000}s) - El backend podría estar iniciando`);
    }
    throw err;
  }
}
