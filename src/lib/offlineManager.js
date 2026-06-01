import { Filesystem, Directory } from '@capacitor/filesystem'
import { Network } from '@capacitor/network'
import { supabase } from '../supabaseClient'

const DOWNLOAD_DIR = Directory.Data
const DOWNLOAD_FOLDER = 'musicfy_offline'

export const OfflineManager = {
  
  async isOnline() {
    try {
      const status = await Network.getStatus()
      return status.connected
    } catch {
      return navigator.onLine
    }
  },
  
  async downloadSong(song, onProgress) {
    try {
      // Crear carpeta si no existe
      await Filesystem.mkdir({ path: DOWNLOAD_FOLDER, directory: DOWNLOAD_DIR, recursive: true })
        .catch(() => {}) // Ignorar error si ya existe
      
      // Descargar el archivo de audio
      const audioPath = `${DOWNLOAD_FOLDER}/${song.id}.mp3`
      onProgress?.({ step: 'audio', percent: 0 })
      
      // Descargar en chunks para poder mostrar progreso
      const response = await fetch(song.url)
      if (!response.ok) throw new Error('Fallo al descargar el archivo de música remota')
      const reader = response.body.getReader()
      const chunks = []
      let loaded = 0
      const total = parseInt(response.headers.get('Content-Length') || '0')
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        if (total > 0) onProgress?.({ step: 'audio', percent: Math.round((loaded / total) * 80) })
      }
      
      // Convertir a base64 para Capacitor Filesystem
      const audioBlob = new Blob(chunks, { type: 'audio/mpeg' })
      const base64 = await blobToBase64(audioBlob)
      
      await Filesystem.writeFile({
        path: audioPath,
        data: base64,
        directory: DOWNLOAD_DIR,
      })
      
      // Descargar portada
      onProgress?.({ step: 'cover', percent: 85 })
      let coverLocalPath = null
      if (song.cover_url && !song.cover_url.startsWith('data:') && !song.cover_url.startsWith('blob:')) {
        try {
          const coverPath = `${DOWNLOAD_FOLDER}/${song.id}_cover.jpg`
          const coverResponse = await fetch(song.cover_url)
          if (coverResponse.ok) {
            const coverBlob = await coverResponse.blob()
            const coverBase64 = await blobToBase64(coverBlob)
            await Filesystem.writeFile({ path: coverPath, data: coverBase64, directory: DOWNLOAD_DIR })
            coverLocalPath = coverPath
          }
        } catch (e) {
          console.warn('[Offline] Error descargando portada:', e)
        }
      }
      
      // Registrar en Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('downloads').upsert({
          user_id: user.id,
          song_id: song.id,
          file_size_bytes: audioBlob.size,
          local_path: audioPath,
          quality: 'high'
        })
      }
      
      // Guardar metadatos localmente para acceso offline
      const offlineData = JSON.parse(localStorage.getItem('musicfy_offline_songs') || '[]')
      const existing = offlineData.findIndex(s => s.id === song.id)
      const offlineSong = { 
        ...song, 
        local_path: audioPath, 
        cover_local_path: coverLocalPath,
        is_offline: true,
        source: 'local'
      }
      if (existing >= 0) offlineData[existing] = offlineSong
      else offlineData.push(offlineSong)
      localStorage.setItem('musicfy_offline_songs', JSON.stringify(offlineData))
      
      onProgress?.({ step: 'done', percent: 100 })
      return { success: true, localPath: audioPath }
      
    } catch (err) {
      console.error('[Offline] Error al descargar:', err)
      return { success: false, error: err.message }
    }
  },
  
  async getOfflineUrl(songId) {
    try {
      const audioPath = `${DOWNLOAD_FOLDER}/${songId}.mp3`
      const result = await Filesystem.readFile({ path: audioPath, directory: DOWNLOAD_DIR })
      return `data:audio/mpeg;base64,${result.data}`
    } catch {
      return null
    }
  },
  
  async isDownloaded(songId) {
    const offlineData = JSON.parse(localStorage.getItem('musicfy_offline_songs') || '[]')
    return offlineData.some(s => s.id === songId)
  },
  
  async deleteDownload(songId) {
    try {
      await Filesystem.deleteFile({ path: `${DOWNLOAD_FOLDER}/${songId}.mp3`, directory: DOWNLOAD_DIR })
      await Filesystem.deleteFile({ path: `${DOWNLOAD_FOLDER}/${songId}_cover.jpg`, directory: DOWNLOAD_DIR }).catch(() => {})
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('downloads').delete().eq('user_id', user.id).eq('song_id', songId)
      
      const offlineData = JSON.parse(localStorage.getItem('musicfy_offline_songs') || '[]')
      localStorage.setItem('musicfy_offline_songs', JSON.stringify(offlineData.filter(s => s.id !== songId)))
      
      return true
    } catch (err) {
      console.error('[Offline] Error al borrar:', err)
      return false
    }
  },
  
  getOfflineSongs() {
    return JSON.parse(localStorage.getItem('musicfy_offline_songs') || '[]')
  }
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result.split(',')[1])
  reader.onerror = reject
  reader.readAsDataURL(blob)
})
