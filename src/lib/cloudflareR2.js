import { supabase } from '../supabaseClient'

export const uploadToR2 = async (file, path) => {
  const fileBase64 = await fileToBase64(file)
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('Sesión no válida o no autenticada para subir archivos.')
  }
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-r2`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'upload', path, contentType: file.type, fileBase64 }),
    }
  )

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fallo al subir a R2 a través de Edge Function: ${response.status} ${errText}`)
  }

  const { url } = await response.json()
  return url
}

export const deleteFromR2 = async (path) => {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('Sesión no válida para borrar archivos.')
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-r2`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'delete', path }),
    }
  )

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fallo al borrar de R2 a través de Edge Function: ${response.status} ${errText}`)
  }
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result.split(',')[1])
  reader.onerror = reject
  reader.readAsDataURL(file)
})
