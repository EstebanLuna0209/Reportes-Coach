// Almacenamiento local con IndexedDB (los datos viven en el dispositivo del coach).
const DB_NAME = 'reportes-coach';
const DB_VERSION = 1;
const STORES = ['clients', 'measurements', 'plans', 'templates', 'settings'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('measurements')) {
        const s = db.createObjectStore('measurements', { keyPath: 'id' });
        s.createIndex('clientId', 'clientId');
      }
      if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', { keyPath: 'clientId' });
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const db = {
  async all(store) { return wrap((await tx(store)).getAll()); },
  async get(store, key) { return wrap((await tx(store)).get(key)); },
  async put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); },
  async del(store, key) { return wrap((await tx(store, 'readwrite')).delete(key)); },
  async byClient(clientId) {
    const s = await tx('measurements');
    const list = await wrap(s.index('clientId').getAll(clientId));
    return list.sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  },
  async deleteClient(clientId) {
    const ms = await this.byClient(clientId);
    for (const m of ms) await this.del('measurements', m.id);
    await this.del('plans', clientId);
    await this.del('clients', clientId);
  },
  async getSetting(key, fallback = null) {
    const r = await this.get('settings', key);
    return r ? r.value : fallback;
  },
  async setSetting(key, value) { return this.put('settings', { key, value }); },

  async exportAll() {
    const out = { app: 'reportes-coach', version: 1, exportedAt: new Date().toISOString() };
    for (const s of STORES) out[s] = await this.all(s);
    return out;
  },
  async importAll(data, { replace = false } = {}) {
    if (!data || data.app !== 'reportes-coach') throw new Error('El archivo no es un respaldo válido.');
    const db_ = await openDB();
    await new Promise((resolve, reject) => {
      const t = db_.transaction(STORES, 'readwrite');
      for (const s of STORES) {
        const os = t.objectStore(s);
        if (replace) os.clear();
        for (const item of data[s] || []) os.put(item);
      }
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  },
};

// Pide al navegador no borrar los datos automáticamente.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
