import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: import.meta.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Función para subir archivos a Cloudflare R2
 * @param {File | Blob} file - El archivo a subir
 * @param {string} path - La ruta donde se guardará (ej: 'music/cancion.mp3')
 * @returns {string} - La URL pública del archivo subido
 */
export const uploadToR2 = async (file, path) => {
  try {
    // Convertimos el archivo a Uint8Array para máxima compatibilidad con el navegador
    // Esto soluciona el error "readableStream.getReader is not a function"
    const arrayBuffer = await file.arrayBuffer();
    const fileBody = new Uint8Array(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
      Key: path,
      Body: fileBody,
      ContentType: file.type || 'application/octet-stream',
    });

    await s3Client.send(command);
    
    // Construimos la URL final usando tu dominio público de R2
    const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
    return `${publicUrl}/${path}`;
  } catch (error) {
    console.error("Error subiendo a R2:", error);
    throw error;
  }
};
