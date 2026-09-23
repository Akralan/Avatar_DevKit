/**
 * Base locale du devkit. Tout ce qu'elle contient appartient à l'appareil du
 * contributeur et n'en sort jamais : vignettes des rendus, et plus tard le
 * sujet qu'il aura généré depuis sa photo.
 */
const DB_NAME = "devkit";
const DB_VERSION = 1;

export const THUMBNAILS_STORE = "thumbnails";
export const SUBJECT_STORE = "subject";

let connection: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THUMBNAILS_STORE)) {
        db.createObjectStore(THUMBNAILS_STORE);
      }
      if (!db.objectStoreNames.contains(SUBJECT_STORE)) {
        db.createObjectStore(SUBJECT_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return connection;
}

/** Exécute une opération dans une transaction et en renvoie le résultat. */
export async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
