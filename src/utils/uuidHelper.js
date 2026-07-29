/**
 * Generador determinista de UUIDs v4 a partir de un string (ej: ID de YouTube 'yt_dGw30gL_i8')
 * Garantiza que cualquier ID de YouTube o fuente externa se convierta en un UUID válido de PostgreSQL
 * permitiendo insertar canciones en Supabase sin errores HTTP 400.
 */

export function isUuid(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function stringToUuid(str) {
  if (!str) return '00000000-0000-4000-8000-000000000000';
  const cleanStr = String(str).trim();
  if (isUuid(cleanStr)) return cleanStr;

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < cleanStr.length; i++) {
    const code = cleanStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x811c9dc5);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  const hex4 = Math.abs(h1 + h2).toString(16).padStart(8, '0');

  const combined = (hex1 + hex2 + hex3 + hex4).substring(0, 32);

  const part1 = combined.substring(0, 8);
  const part2 = combined.substring(8, 12);
  const part3 = '4' + combined.substring(13, 16);
  const part4 = '8' + combined.substring(17, 20);
  const part5 = combined.substring(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
