/**
 * Realiza una peticion fetch con timeout configurable y soporte de cancelacion.
 *
 * @param {string} url - URL a la que se hace fetch
 * @param {object} options - Opciones del fetch
 * @param {number} timeoutMs - Tiempo de espera maximo en milisegundos
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        const abortErr = new Error('Peticion cancelada');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      throw new Error(`Timeout de conexion al backend (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal);
    }
  }
}
