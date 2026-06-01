// Utilidad nativa de IndexedDB para persistencia de datos pesados (cola de reproducción, estado)

export const dbStore = {
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('musicfy_db', 1);
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
      };
      
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async get(key) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('state', 'readonly');
        const store = transaction.objectStore('state');
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] Error al leer clave:', key, e);
      return null;
    }
  },

  async set(key, value) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        const store = transaction.objectStore('state');
        const request = store.put(value, key);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] Error al escribir clave:', key, e);
      return false;
    }
  }
};
