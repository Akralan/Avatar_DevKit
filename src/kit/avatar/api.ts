/**
 * Client du backend de génération d'avatar.
 *
 * Les routes sont relatives : en développement, Vite les proxifie vers le
 * conteneur Scaleway (voir `vite.config.ts`), donc le navigateur ne voit qu'une
 * seule origine et la question du CORS ne se pose pas.
 */

/** Le backend renvoie ses erreurs en `{ error: "…" }`. C'est lui qui sait
 *  pourquoi ça a échoué — on relaie son message plutôt que d'en inventer un. */
export class BackendError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

async function echec(response: Response): Promise<BackendError> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return new BackendError(body.error);
  } catch {
    // Le backend n'a pas répondu de JSON : il reste le statut.
  }

  return new BackendError(`Le backend a répondu ${response.status}.`);
}

const drapeau = (actif: boolean | undefined) => (actif ? "1" : "0");

export interface BodyOptions {
  /** Texturer le corps. Le backend part de `0`. */
  texture?: boolean;
  /** Poser le corps en A-pose. Le backend part de `1`. */
  aPose?: boolean;
  /** Mode test : greffer `corps.glb` sans appeler Meshy ni consommer de crédits. */
  localBody?: boolean;
}

/**
 * Lance la génération du corps et renvoie l'identifiant de tâche.
 *
 * Plusieurs photos sont acceptées — le backend les relit avec
 * `getlist("image")` et les plafonne à quatre. Meshy fabrique le corps à partir
 * de ces angles : n'en envoyer qu'un dégrade le résultat.
 */
export async function startBody(photos: File[], options: BodyOptions): Promise<string> {
  const form = new FormData();
  for (const photo of photos) form.append("image", photo);

  form.append("texture", drapeau(options.texture));
  form.append("apose", drapeau(options.aPose ?? true));
  form.append("local_body", drapeau(options.localBody));

  const response = await fetch("/body", { method: "POST", body: form });
  if (!response.ok) throw await echec(response);

  const { task_id } = (await response.json()) as { task_id: string };
  return task_id;
}

export interface BodyStatus {
  status: string;
  progress: number;
}

export async function getBodyStatus(taskId: string): Promise<BodyStatus> {
  const response = await fetch(`/body/status?task_id=${encodeURIComponent(taskId)}`);
  if (!response.ok) throw await echec(response);

  return (await response.json()) as BodyStatus;
}

export interface GraftOptions {
  /** Mode test : greffer `visage.glb` et ignorer le masque envoyé. */
  localFace?: boolean;
}

/** Greffe le masque facial sur le corps généré. Synchrone côté backend,
 *  environ une minute de calcul. */
export async function graft(
  taskId: string,
  faceGlb: Blob,
  options: GraftOptions,
): Promise<Blob> {
  const form = new FormData();
  form.append("task_id", taskId);
  form.append("face", faceGlb, "face.glb");
  form.append("local_face", drapeau(options.localFace));

  const response = await fetch("/graft", { method: "POST", body: form });
  if (!response.ok) throw await echec(response);

  return response.blob();
}
