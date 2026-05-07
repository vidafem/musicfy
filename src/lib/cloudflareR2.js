import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
    const arrayBuffer = await file.arrayBuffer();
    const fileBody = new Uint8Array(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
      Key: path,
      Body: fileBody,
      ContentType: file.type || 'application/octet-stream',
    });

    await s3Client.send(command);
    
    const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
    return `${publicUrl}/${path}`;
  } catch (error) {
    console.error("Error subiendo a R2:", error);
    throw error;
  }
};

/**
 * Función para borrar archivos de Cloudflare R2
 * @param {string} path - La ruta/llave del archivo (ej: 'music/archivo.mp3')
 */
export const deleteFromR2 = async (path) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
      Key: path,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Error borrando de R2:", error);
    throw error;
  }
};
