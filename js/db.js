// Almacenamiento de datos.
// - Modo local: IndexedDB del navegador (si no hay Firebase configurado).
// - Modo nube: Firestore (Firebase). Los datos se sincronizan entre celular, tablet y
//   computadora, y también funcionan sin internet (se suben al reconectar).
import { firebaseConfig } from './firebase-config.js';

const DB_NAME = 'reportes-coach';
const DB_VERSION = 2;
export const STORES = ['clients', 'measurements', 'plans', 'templates', 'settings', 'foods'];
const KEY = { clients: 'id', measurements: 'id', plans: 'clientId', templates: 'id', settings: 'key', foods: 'id' };

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const sortMeasurements = list =>
  list.sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));

// ======================= Backend local (IndexedDB) =======================
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) {
        if (d.objectStoreNames.contains(s)) continue;
        const os = d.createObjectStore(s, { keyPath: KEY[s] });
        if (s === 'measurements') os.createIndex('clientId', 'clientId');
      }
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
  return (await openDB()).transaction(store, mode).objectStore(store);
}

export const localBackend = {
  kind: 'local',
  async all(store) { return wrap((await tx(store)).getAll()); },
  async get(store, key) { return wrap((await tx(store)).get(key)); },
  async put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); },
  async del(store, key) { return wrap((await tx(store, 'readwrite')).delete(key)); },
  async byClient(clientId) {
    const s = await tx('measurements');
    return sortMeasurements(await wrap(s.index('clientId').getAll(clientId)));
  },
  async putMany(store, items) {
    const d = await openDB();
    await new Promise((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      for (const it of items) os.put(it);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  },
};

// ======================= Backend nube (Firestore) =======================
let fb = null; // módulo de Firebase (se carga solo si hay configuración)
let fs = null; // instancia de Firestore
let auth = null;
let cloudUid = null;
let unsubs = [];
const cache = {};
let onRemoteChange = () => {};
let onWriteError = () => {};

export const cloudEnabled = !!(firebaseConfig && firebaseConfig.apiKey);

async function loadFirebase() {
  if (fb) return fb;
  fb = await import('../vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  auth = fb.getAuth(app);
  const emulator = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emulador');
  fs = fb.initializeFirestore(app, emulator
    ? { ignoreUndefinedProperties: true }
    : { ignoreUndefinedProperties: true, localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  if (emulator) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }
  return fb;
}

const colRef = store => fb.collection(fs, 'users', cloudUid, store);
const docRef = (store, key) => fb.doc(fs, 'users', cloudUid, store, String(key));
const clone = v => JSON.parse(JSON.stringify(v));

function cloudWrite(promise) {
  // No se espera la confirmación del servidor: Firestore guarda primero en el
  // dispositivo y sube los cambios cuando hay conexión.
  promise.catch(err => { console.error(err); onWriteError(err); });
  return Promise.resolve();
}

export const cloudBackend = {
  kind: 'cloud',
  async all(store) { return [...cache[store].values()].map(clone); },
  async get(store, key) { const v = cache[store].get(String(key)); return v ? clone(v) : undefined; },
  async put(store, value) {
    const v = clone(value);
    cache[store].set(String(v[KEY[store]]), v);
    return cloudWrite(fb.setDoc(docRef(store, v[KEY[store]]), v));
  },
  async del(store, key) {
    cache[store].delete(String(key));
    return cloudWrite(fb.deleteDoc(docRef(store, key)));
  },
  async byClient(clientId) {
    return sortMeasurements([...cache.measurements.values()].filter(m => m.clientId === clientId).map(clone));
  },
  async putMany(store, items) {
    for (let i = 0; i < items.length; i += 400) {
      const batch = fb.writeBatch(fs);
      for (const it of items.slice(i, i + 400)) {
        const v = clone(it);
        cache[store].set(String(v[KEY[store]]), v);
        batch.set(docRef(store, v[KEY[store]]), v);
      }
      cloudWrite(batch.commit());
    }
  },
};

export const cloud = {
  enabled: cloudEnabled,
  async init({ onUser }) {
    await loadFirebase();
    fb.onAuthStateChanged(auth, onUser);
  },
  signIn: (email, pass) => fb.signInWithEmailAndPassword(auth, email, pass),
  signUp: (email, pass) => fb.createUserWithEmailAndPassword(auth, email, pass),
  resetPassword: email => fb.sendPasswordResetEmail(auth, email),
  async signOut() { stopCloud(); await fb.signOut(auth); },
  get user() { return auth && auth.currentUser; },
  onRemoteChange(fn) { onRemoteChange = fn; },
  onWriteError(fn) { onWriteError = fn; },
};

// Escucha cada colección en tiempo real; la primera lectura sale del caché del dispositivo.
async function startCloud(userId) {
  stopCloud();
  cloudUid = userId;
  await Promise.all(STORES.map(store => new Promise(resolve => {
    cache[store] = new Map();
    let first = true;
    unsubs.push(fb.onSnapshot(colRef(store), snap => {
      const remote = !first && !snap.metadata.hasPendingWrites && snap.docChanges().length > 0;
      cache[store] = new Map(snap.docs.map(d => [d.id, d.data()]));
      if (first) { first = false; resolve(); } else if (remote) onRemoteChange(store);
    }, err => { console.error(err); onWriteError(err); if (first) { first = false; resolve(); } }));
  })));
}
function stopCloud() {
  unsubs.forEach(u => u());
  unsubs = [];
}

// ======================= API pública =======================
let backend = localBackend;

export async function useCloud(userId) {
  await startCloud(userId);
  backend = cloudBackend;
}
export function useLocal() { backend = localBackend; }

export const db = {
  get kind() { return backend.kind; },
  all: (s) => backend.all(s),
  get: (s, k) => backend.get(s, k),
  put: (s, v) => backend.put(s, v),
  del: (s, k) => backend.del(s, k),
  byClient: (id) => backend.byClient(id),
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

  async exportAll(from = backend) {
    const out = { app: 'reportes-coach', version: 2, exportedAt: new Date().toISOString() };
    for (const s of STORES) out[s] = await from.all(s);
    return out;
  },
  async importAll(data) {
    if (!data || data.app !== 'reportes-coach') throw new Error('El archivo no es un respaldo válido.');
    for (const s of STORES) if ((data[s] || []).length) await backend.putMany(s, data[s]);
  },
};

// Pide al navegador no borrar los datos automáticamente.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
