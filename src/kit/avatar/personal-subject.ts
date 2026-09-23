import { SUBJECT_STORE, withStore } from "../db";

/** Clé unique du sujet personnel. Elle sert aussi de valeur d'URL (`?s=`) :
 *  la changer périmerait tous les liens déjà partagés. */
export const PERSONAL_SUBJECT_ID = "personnel";

/** Un avatar greffé pèse ~60 Mo. Le navigateur peut refuser de l'écrire, et
 *  refuse plus vite en navigation privée. */
export class QuotaError extends Error {
  public constructor(cause: unknown) {
    super(
      "Pas assez d'espace pour ranger l'avatar (~60 Mo). Libérez de l'espace disque, " +
        "ou quittez la navigation privée — elle limite fortement le stockage.",
    );
    this.name = "QuotaError";
    this.cause = cause;
  }
}

export interface PersonalSubject {
  glb: Blob;
  /** Décoratif : son absence n'empêche jamais de ranger l'avatar. */
  poster: Blob | null;
  createdAt: number;
}

export async function getPersonalSubject(): Promise<PersonalSubject | null> {
  const stored = await withStore<PersonalSubject | undefined>(
    SUBJECT_STORE,
    "readonly",
    (store) => store.get(PERSONAL_SUBJECT_ID),
  );

  return stored ?? null;
}

/**
 * Remplace le sujet personnel. Une seule transaction : soit le nouveau prend la
 * place de l'ancien, soit rien ne change. Une greffe interrompue ou un quota
 * dépassé ne laisse donc jamais d'enregistrement à moitié écrit.
 */
export async function savePersonalSubject(glb: Blob, poster: Blob | null): Promise<void> {
  // Sans stockage persistant, le navigateur peut évincer l'avatar tout seul
  // lors d'un nettoyage. Ce n'est qu'une demande : elle peut être refusée.
  await navigator.storage?.persist?.().catch(() => false);

  const subject: PersonalSubject = { glb, poster, createdAt: Date.now() };

  try {
    await withStore(SUBJECT_STORE, "readwrite", (store) =>
      store.put(subject, PERSONAL_SUBJECT_ID),
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "QuotaExceededError") {
      throw new QuotaError(cause);
    }
    throw cause;
  }
}

export async function deletePersonalSubject(): Promise<void> {
  await withStore(SUBJECT_STORE, "readwrite", (store) => store.delete(PERSONAL_SUBJECT_ID));
}
