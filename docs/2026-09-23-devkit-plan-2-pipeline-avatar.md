# MyTwin Avatar DevKit — Plan 2 : le pipeline avatar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un étudiant génère l'avatar de son propre corps depuis une photo, et ce corps devient le troisième sujet de tous les ateliers.

**Architecture:** Le backend Python ne bouge pas. Le navigateur orchestre, comme aujourd'hui : il lance la génération du corps (Meshy, proxifié), capture le visage en local (MediaPipe), construit un `face.glb` au format exact attendu par le pipeline, demande la greffe, et range le résultat dans IndexedDB. La logique du wizard est portée de `frontend/templates/index.html` — elle est éprouvée, on ne la réinvente pas.

**Tech Stack:** Vite · React 19 · TypeScript 5 strict · three 0.184.0 · @mediapipe/tasks-vision 0.10.14

**Spec:** `docs/2026-09-23-devkit-avatar-design.md`

**Prérequis :** le plan 1 (`docs/2026-09-23-devkit-plan-1-socle-et-ateliers.md`) doit être terminé. Ce plan consomme `createFaceLandmarker()` (plan 1, tâche 2), `listSubjects()` (tâche 4), `loadSubject()` (tâche 5) et `RenderStage` (tâche 7).

## Global Constraints

Celles du plan 1 s'appliquent intégralement. S'y ajoutent :

- **Le format du `face.glb` n'est pas négociable** : 478 sommets en ordre canonique MediaPipe, 898 triangles, UV = projection du maillage frontalisé, une seule texture. `backend/pipeline/texture_swap.py` attend exactement ça ; s'en écarter casse la greffe côté serveur, pas côté client.
- **`FACE_TEX_MAX = 1024`** — la webcam capture jusqu'en 4K mais le rastériseur backend décode la texture en numpy brut. Une texture 4K fait sauter le conteneur Scaleway en OOM. Cette constante est une protection serveur, pas un réglage de qualité.
- **`FACE_EDGE_ERODE = 0.07`** — rentrée des UV du contour, pour que les triangles de bordure échantillonnent la peau et jamais l'arrière-plan.
- **Un seul sujet personnel**, jamais deux. « Refaire » écrase après confirmation.
- **Aucune image ni aucun GLB ne quitte l'appareil** en dehors des appels au backend de greffe. Rien n'est stocké côté serveur : le backend est sans état.

## Review Focus

1. **Caméra refusée ou absente** — le wizard doit le dire et proposer le mode test, pas rester sur « Activation de la caméra… ». → tâche 5.
2. **Cold start du backend** (scale-to-zero, greffe synchrone ~1 min, timeout 300 s) — l'attente doit rester lisible et bornée, jamais une interface figée sans explication. → tâche 6.
3. **`/graft` répond une erreur JSON** — afficher le message du backend, pas un « échec » générique : c'est lui qui dit *pourquoi*. → tâche 1.
4. **La page est quittée en pleine greffe** — aucun sujet personnel à moitié écrit ne doit subsister dans IndexedDB. → tâche 2.
5. **`QuotaExceededError` à l'écriture** (~60 Mo, navigateur en navigation privée ou disque plein) — message actionnable, et l'ancien sujet ne doit pas avoir été détruit pour rien. → tâche 2.

---

## Task 1 : Le client backend

**Files:**
- Create: `src/kit/avatar/api.ts`
- Test: `src/kit/avatar/api.test.ts`
- Source: `frontend/templates/index.html:455-510`

**Interfaces:**
- Consumes: rien.
- Produces: `startBody(photo: File, options): Promise<string>` (renvoie le `task_id`), `getBodyStatus(taskId): Promise<{ status: string; progress: number }>`, `graft(taskId, faceGlb: Blob, options): Promise<Blob>`, et `BackendError`.

- [ ] **Step 1 : Écrire le test qui échoue** *(couvre le point 3 de Review Focus)*

```ts
import { vi } from "vitest";
import { BackendError, graft, startBody } from "./api";

test("startBody renvoie le task_id du backend", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ task_id: "abc123" }),
  }));

  await expect(startBody(new File([], "photo.jpg"), {})).resolves.toBe("abc123");
});

test("une erreur du backend remonte SON message, pas un message générique", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Aucun visage détecté sur la photo" }),
  }));

  await expect(graft("abc", new Blob(), {})).rejects.toThrow("Aucun visage détecté sur la photo");
});

test("une erreur sans corps JSON exploitable reste lisible", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("pas du JSON");
    },
  }));

  await expect(graft("abc", new Blob(), {})).rejects.toThrow(BackendError);
  await expect(graft("abc", new Blob(), {})).rejects.toThrow(/502/);
});

test("les modes test sont transmis en clair au backend", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "x" }) });
  vi.stubGlobal("fetch", fetchMock);

  await startBody(new File([], "photo.jpg"), { localBody: true });

  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get("local_body")).toBe("1");
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- avatar/api`
Expected: FAIL — `Failed to resolve import "./api"`.

- [ ] **Step 3 : Écrire `src/kit/avatar/api.ts`**

Les routes sont relatives : en dev, le proxy Vite (plan 1, tâche 1) les redirige vers le backend Scaleway, donc le navigateur ne voit qu'une origine et il n'y a pas de CORS.

```ts
export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

async function failure(response: Response): Promise<BackendError> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return new BackendError(body.error);
  } catch {
    // le backend n'a pas répondu de JSON — on retombe sur le statut
  }
  return new BackendError(`Le backend a répondu ${response.status}.`);
}

export interface BodyOptions {
  localBody?: boolean;
}

export async function startBody(photo: File, { localBody }: BodyOptions): Promise<string> {
  const form = new FormData();
  form.append("image", photo);
  form.append("local_body", localBody ? "1" : "0");

  const response = await fetch("/body", { method: "POST", body: form });
  if (!response.ok) throw await failure(response);

  const { task_id } = (await response.json()) as { task_id: string };
  return task_id;
}

export async function getBodyStatus(
  taskId: string,
): Promise<{ status: string; progress: number }> {
  const response = await fetch(`/body/status?task_id=${encodeURIComponent(taskId)}`);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as { status: string; progress: number };
}

export interface GraftOptions {
  localFace?: boolean;
}

export async function graft(
  taskId: string,
  faceGlb: Blob,
  { localFace }: GraftOptions,
): Promise<Blob> {
  const form = new FormData();
  form.append("task_id", taskId);
  form.append("face", faceGlb, "face.glb");
  form.append("local_face", localFace ? "1" : "0");

  const response = await fetch("/graft", { method: "POST", body: form });
  if (!response.ok) throw await failure(response);

  return response.blob();
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- avatar/api`
Expected: PASS

- [ ] **Step 5 : Vérification manuelle**

Run: `npm run dev`, puis dans la console du navigateur : `await fetch("/healthz").then(r => r.json())`.
Attendu : `{ ok: true, … }`. Si la réponse est une erreur de proxy, `VITE_API_BASE` est mal renseigné dans `.env`.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Le devkit parle au backend de greffe et relaie ses messages d'erreur"
```

---

## Task 2 : L'emplacement personnel

**Files:**
- Create: `src/kit/avatar/personal-subject.ts`
- Modify: `src/kit/subjects.ts` (étendre `listSubjects`)
- Test: `src/kit/avatar/personal-subject.test.ts`, `src/kit/subjects.test.ts`

**Interfaces:**
- Consumes: `SubjectDescriptor` (plan 1, tâche 4).
- Produces: `savePersonalSubject(glb: Blob, poster: Blob | null): Promise<void>`, `getPersonalSubject(): Promise<{ glb: Blob; poster: Blob | null; createdAt: number } | null>`, `deletePersonalSubject(): Promise<void>`, `PERSONAL_SUBJECT_ID = "personnel"`.

- [ ] **Step 1 : Écrire le test qui échoue** *(couvre les points 4 et 5 de Review Focus)*

```ts
import {
  deletePersonalSubject,
  getPersonalSubject,
  savePersonalSubject,
  QuotaError,
} from "./personal-subject";

test("il n'y a jamais qu'un seul sujet personnel", async () => {
  await savePersonalSubject(new Blob(["premier"]), null);
  await savePersonalSubject(new Blob(["second"]), null);

  const stored = await getPersonalSubject();
  expect(await stored!.glb.text()).toBe("second");
});

test("aucun sujet personnel tant que rien n'a été généré", async () => {
  await deletePersonalSubject();
  expect(await getPersonalSubject()).toBeNull();
});

test("une écriture qui dépasse le quota ne détruit pas l'existant", async () => {
  await savePersonalSubject(new Blob(["ancien"]), null);
  // Simule un QuotaExceededError sur la transaction d'écriture.
  const failing = new Blob(["trop gros"]);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });

  await expect(savePersonalSubject(failing, null)).rejects.toThrow(QuotaError);
  expect(await (await getPersonalSubject())!.glb.text()).toBe("ancien");
});

test("le message de quota dit quoi faire, pas seulement que ça a raté", async () => {
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });

  await expect(savePersonalSubject(new Blob(), null)).rejects.toThrow(/navigation privée|espace/i);
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- personal-subject`
Expected: FAIL — `Failed to resolve import "./personal-subject"`.

- [ ] **Step 3 : Écrire `personal-subject.ts`**

Même base IndexedDB `devkit` que les vignettes (plan 1, tâche 15), store `subject`, **une seule clé** : `PERSONAL_SUBJECT_ID`. L'écriture se fait en une transaction : soit le nouveau sujet remplace l'ancien, soit rien ne change — c'est ce qui garantit qu'une greffe interrompue ou un quota dépassé ne laisse pas d'enregistrement à moitié écrit.

`QuotaError` porte un message actionnable : *« Pas assez d'espace pour ranger l'avatar (~60 Mo). Videz de l'espace disque, ou quittez la navigation privée — elle limite fortement le stockage. »*

Demander `navigator.storage.persist()` au premier enregistrement : sans ça le navigateur peut évincer l'avatar tout seul lors d'un nettoyage.

- [ ] **Step 4 : Étendre `listSubjects`**

```ts
export async function listSubjects(): Promise<SubjectDescriptor[]> {
  const personal = await getPersonalSubject();
  if (!personal) return SHIPPED;

  return [
    ...SHIPPED,
    {
      id: PERSONAL_SUBJECT_ID,
      label: "Le vôtre",
      url: URL.createObjectURL(personal.glb),
      origin: "personnel",
      locked: false,
    },
  ];
}
```

Ajouter au test de `subjects.test.ts` :

```ts
test("le sujet personnel apparaît une fois généré, déverrouillé", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  const subjects = await listSubjects();

  expect(subjects).toHaveLength(3);
  expect(subjects.at(-1)).toMatchObject({ id: "personnel", locked: false });
});

test("les deux sujets livrés restent verrouillés quoi qu'il arrive", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  const shipped = (await listSubjects()).filter((subject) => subject.origin === "livré");

  expect(shipped.every((subject) => subject.locked)).toBe(true);
});
```

- [ ] **Step 5 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- subjects personal-subject`
Expected: PASS

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Un troisième sujet, celui du contributeur, peut vivre sur son appareil"
```

---

## Task 3 : L'aperçu GLB maison

Remplace `model-viewer`, aujourd'hui chargé par CDN — la contrainte globale du plan 1 l'interdit, et le kit contient déjà tout le nécessaire.

**Files:**
- Create: `src/kit/avatar/subject-preview.tsx`, `src/kit/avatar/poster.ts`
- Test: `src/kit/avatar/poster.test.ts`

**Interfaces:**
- Consumes: `loadSubject`, `frameCamera` (plan 1, tâches 5).
- Produces: `<SubjectPreview src={} />` (aperçu tournant d'un GLB) et `capturePoster(glb: Blob): Promise<Blob>`.

- [ ] **Step 1 : Écrire `subject-preview.tsx`**

Un canvas, une scène three.js minimale (`MeshStandardMaterial` d'origine du GLB, une lumière ambiante et une directionnelle), le cadrage de `frameCamera`, une rotation lente, et le même `dispose` complet que le stage. Sert dans le wizard (aperçu du masque facial, aperçu du résultat) et dans `/sujets`.

- [ ] **Step 2 : Écrire le test du poster qui échoue**

```ts
test("le poster est un JPEG, pas le GLB entier", async () => {
  const poster = await capturePoster(new Blob(["glb"]));
  expect(poster.type).toBe("image/jpeg");
});

test("un GLB illisible ne fait pas échouer l'enregistrement de l'avatar", async () => {
  // Le poster est décoratif : son échec ne doit jamais empêcher de ranger le sujet.
  await expect(capturePoster(new Blob(["pas un glb"]))).resolves.toBeNull();
});
```

- [ ] **Step 3 : Écrire `poster.ts`**

Monte le GLB hors écran dans un canvas 256×256, rend une frame, `canvas.toBlob(..., "image/jpeg", 0.8)`, libère tout. **Renvoie `null` en cas d'échec** plutôt que de jeter : dans l'ancien code, `snapshotPoster` est déjà entouré d'un `try/catch` qui l'ignore — le poster est décoratif, l'avatar ne l'est pas.

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- poster`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Les aperçus 3D ne dépendent plus d'un composant chargé depuis un CDN"
```

---

## Task 4 : La construction du `face.glb`

La partie la plus dense du portage, et celle où une erreur ne se voit pas à l'écran mais casse la greffe côté serveur.

**Files:**
- Create: `src/kit/avatar/face-triangulation.ts`, `src/kit/avatar/build-face-glb.ts`
- Test: `src/kit/avatar/build-face-glb.test.ts`
- Source: `frontend/templates/index.html:366` (la triangulation) et `664-805` (la construction)

**Interfaces:**
- Consumes: rien.
- Produces: `buildFaceGlb(landmarks: NormalizedLandmark[], texture: HTMLCanvasElement, matrix: number[] | null): Blob`, `FACE_TEX_MAX`, `FACE_EDGE_ERODE`.

- [ ] **Step 1 : Extraire la triangulation**

`FACE_TRIANGULATION` est la constante de 2694 entiers de la ligne 366. Elle passe telle quelle dans `face-triangulation.ts`, avec son commentaire d'origine : *triangulation MediaPipe canonique (898 triangles) extraite des `visage.glb` de référence ARCore — garantit la compatibilité avec le pipeline `texture_swap`.* **Ne pas la reformater ni la retrier.**

- [ ] **Step 2 : Écrire les tests qui échouent**

Ces tests sont le contrat avec le backend. Ils valent mieux qu'une vérification visuelle : un `face.glb` mal formé produit une greffe laide, pas une erreur.

```ts
import { buildFaceGlb, FACE_TEX_MAX } from "./build-face-glb";
import { FACE_TRIANGULATION } from "./face-triangulation";

function fakeLandmarks(count = 478) {
  return Array.from({ length: count }, (_, i) => ({
    x: 0.5 + Math.cos(i) * 0.1,
    y: 0.5 + Math.sin(i) * 0.1,
    z: 0,
  }));
}

function fakeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  return canvas;
}

test("la triangulation compte exactement 898 triangles", () => {
  expect(FACE_TRIANGULATION.length).toBe(898 * 3);
});

test("le blob produit est un glTF binaire", async () => {
  const blob = buildFaceGlb(fakeLandmarks(), fakeTexture(), null);
  const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());

  expect(String.fromCharCode(...magic)).toBe("glTF");
  expect(blob.type).toBe("model/gltf-binary");
});

test("des landmarks incomplets sont refusés avant l'envoi au backend", () => {
  expect(() => buildFaceGlb(fakeLandmarks(300), fakeTexture(), null)).toThrow(/incomplets/);
});

// Relit les positions dans le GLB produit : c'est le seul moyen de vérifier
// la géométrie sans la rendre.
async function readPositions(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binOffset = 20 + jsonLength + 8; // en-tête GLB + chunk JSON + en-tête du chunk BIN
  const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const bufferView = json.bufferViews[accessor.bufferView];

  return new Float32Array(buffer, binOffset + (bufferView.byteOffset ?? 0), accessor.count * 3);
}

test("le maillage porte exactement 478 sommets", async () => {
  const positions = await readPositions(buildFaceGlb(fakeLandmarks(), fakeTexture(), null));

  expect(positions).toHaveLength(478 * 3);
});

test("le ratio de la photo est compensé, sinon le visage part écrasé", async () => {
  const landmarks = fakeLandmarks();
  const square = document.createElement("canvas");
  square.width = 1024;
  square.height = 1024;

  const wide = await readPositions(buildFaceGlb(landmarks, fakeTexture(), null)); // 1024×768
  const even = await readPositions(buildFaceGlb(landmarks, square, null));

  const spread = (positions: Float32Array) =>
    Math.max(...Array.from({ length: 478 }, (_, i) => Math.abs(positions[i * 3])));

  // p.x est normalisé par la largeur, p.y par la hauteur : sans la correction
  // d'aspect, le visage sortirait écrasé horizontalement.
  expect(spread(wide) / spread(even)).toBeCloseTo(1024 / 768, 2);
});

test("la texture est plafonnée pour ne pas faire sauter le conteneur backend", () => {
  expect(FACE_TEX_MAX).toBe(1024);
});
```

- [ ] **Step 3 : Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- build-face-glb`
Expected: FAIL — `Failed to resolve import "./build-face-glb"`.

- [ ] **Step 4 : Porter `buildFaceGLB`**

Porter les lignes 664-805 en TypeScript, en gardant **tous** les commentaires d'origine — ils documentent des invariants vérifiés contre le backend, pas des intentions :

- 478 sommets, ordre canonique ; `pos[i*3] = (p.x - 0.5) * aspect`, `pos[i*3+1] = -(p.y - 0.5)`, `pos[i*3+2] = -(p.z ?? 0) * aspect` — Y en haut, Z en avant ;
- `frontalizePos(pos, N, matrix)` remet le visage de face quand la matrice de pose est disponible ; identité sinon, donc rétro-compatible ;
- UV = projection orthographique du maillage **frontalisé**, `corr(U,x) = +1`, `corr(V,y) = -1` — schéma exact des `visage.glb` Android ;
- `FACE_EDGE_ERODE = 0.07` rentre les UV du contour vers l'intérieur, pour que les triangles de bordure échantillonnent la peau et jamais le fond ;
- les sommets du contour sont dérivés une fois de la triangulation : ce sont les extrémités des arêtes n'appartenant qu'à un seul triangle.

- [ ] **Step 5 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- build-face-glb`
Expected: PASS

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Le masque facial est reconstruit au format exact attendu par la greffe"
```

---

## Task 5 : L'écran de capture du visage

**Files:**
- Create: `src/studio/wizard/face-step.tsx`, `src/studio/wizard/use-camera.ts`
- Test: `src/studio/wizard/face-step.test.tsx`
- Source: `frontend/templates/index.html:512-663`

**Interfaces:**
- Consumes: `createFaceLandmarker` (plan 1, tâche 2), `buildFaceGlb` (tâche 4), `SubjectPreview` (tâche 3).
- Produces: `<FaceStep onCaptured={(faceGlb: Blob) => void} localFace={boolean} />`.

- [ ] **Step 1 : Écrire les tests qui échouent** *(couvre le point 1 de Review Focus)*

```tsx
test("une caméra refusée est annoncée avec le geste à faire", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
    },
  });

  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/autoris/i);
});

test("l'absence de caméra propose le mode test au lieu d'un cul-de-sac", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException("none", "NotFoundError")),
    },
  });

  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(await screen.findByRole("button", { name: /visage de test/i })).toBeInTheDocument();
});

test("le bouton de capture reste inactif tant qu'aucun visage n'est détecté", () => {
  render(<FaceStep onCaptured={vi.fn()} localFace={false} />);

  expect(screen.getByRole("button", { name: /prendre la photo/i })).toBeDisabled();
});

test("le mode test n'ouvre pas la caméra du tout", () => {
  const getUserMedia = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

  render(<FaceStep onCaptured={vi.fn()} localFace />);

  expect(getUserMedia).not.toHaveBeenCalled();
});
```

- [ ] **Step 2 : Lancer les tests, les voir échouer, écrire `use-camera.ts` et `face-step.tsx`**

`use-camera.ts` demande `getUserMedia({ video: { facingMode: "user", width: { ideal: 3840 }, height: { ideal: 2160 } } })` — la résolution idéale très haute fait fournir à la webcam son maximum réel, ce qui donne une texture plus nette ; `buildFaceGlb` s'adapte au ratio. Le hook distingue `NotAllowedError` (autorisation) de `NotFoundError` (pas de caméra) : les deux messages ne disent pas la même chose à l'utilisateur.

`face-step.tsx` porte la boucle de détection : une inférence **par nouvelle frame vidéo** (`cam.currentTime !== lastVideoTime`), l'ovale de cadrage, le tracé des connecteurs, le bouton de capture activé seulement quand un visage est présent, puis la capture — texture plafonnée à `FACE_TEX_MAX`, `buildFaceGlb`, et un aperçu du masque via `<SubjectPreview>` avant validation.

- [ ] **Step 3 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- face-step`
Expected: PASS

- [ ] **Step 4 : Vérification manuelle**

Run: `npm run dev`, ouvrir le wizard, autoriser la caméra.
Attendu : le maillage se dessine sur le visage en temps réel, le bouton s'active quand le visage est détecté, la capture affiche un masque 3D manipulable, « Reprendre » revient à la caméra proprement (pas de flux resté ouvert — vérifier que le voyant de la webcam s'éteint).

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "La capture du visage tourne en React avec son aperçu 3D avant validation"
```

---

## Task 6 : L'orchestration du wizard

**Files:**
- Create: `src/studio/wizard/wizard-page.tsx`, `src/studio/wizard/photo-step.tsx`, `src/studio/wizard/use-body-task.ts`
- Modify: `src/App.tsx` (route `/sujets/nouveau`)
- Test: `src/studio/wizard/use-body-task.test.ts`
- Source: `frontend/templates/index.html:440-510`

**Interfaces:**
- Consumes: tâches 1 à 5.
- Produces: la route `/sujets/nouveau`.

- [ ] **Step 1 : Écrire les tests qui échouent** *(couvre le point 2 de Review Focus)*

```ts
test("la génération du corps commence dès la photo, sans attendre le visage", async () => {
  // C'est le recouvrement qui fait tenir l'attente : les deux étapes ne s'additionnent pas.
  const { result } = renderHook(() => useBodyTask());
  act(() => result.current.start(new File([], "photo.jpg")));

  await waitFor(() => expect(result.current.taskId).toBe("abc123"));
});

test("la progression remontée par le backend est exposée telle quelle", async () => {
  /* … le hook expose { progress: 38 } après un poll … */
});

test("un backend en cold start n'immobilise pas l'interface sans explication", async () => {
  // Au-delà de COLD_START_HINT_MS sans réponse, le hook expose un message
  // expliquant que le conteneur démarre.
  const { result } = renderHook(() => useBodyTask());
  act(() => result.current.start(new File([], "photo.jpg")));

  await waitFor(() => expect(result.current.hint).toMatch(/démarre/i));
});

test("le polling s'arrête au démontage, pas seulement à la fin de la tâche", () => {
  const { unmount } = renderHook(() => useBodyTask());
  unmount();
  // Aucun appel à getBodyStatus après le démontage.
});
```

- [ ] **Step 2 : Lancer les tests, les voir échouer, écrire `use-body-task.ts`**

Le hook lance `startBody`, puis poll `getBodyStatus` à intervalle régulier. Il expose `{ taskId, progress, status, hint, error }`. `COLD_START_HINT_MS` déclenche un message explicite — le conteneur Scaleway scale à zéro, la première requête après inactivité paie le démarrage, et une barre immobile sans explication ressemble à une panne.

- [ ] **Step 3 : Écrire `photo-step.tsx` et `wizard-page.tsx`**

`photo-step.tsx` : zone de dépôt + sélecteur de fichier, comme l'original.

`wizard-page.tsx` assemble les quatre étapes de la maquette validée — **Photo → Visage → Greffe → Sujet** — avec le recouvrement : dès la photo envoyée, le corps se génère *pendant* que l'utilisateur capture son visage, et la greffe part quand les deux sont prêts. La barre de progression du corps reste visible pendant l'étape visage.

À la réception du blob : `capturePoster` (échec toléré), puis `savePersonalSubject`, puis redirection vers `/sujets`.

Les deux modes test (`local_body`, `local_face`) restent accessibles dans un panneau de réglages, désactivés par défaut, comme aujourd'hui.

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 5 : Vérification manuelle de bout en bout**

Run: `npm run dev`, aller sur `/sujets/nouveau`, activer les deux modes test.
Attendu : le parcours complet aboutit à un avatar rangé dans `/sujets`, sans appeler Meshy. Puis refaire **sans** les modes test, avec une vraie photo et une vraie capture : la greffe prend environ une minute, la progression reste lisible, et le résultat s'affiche.

Si le backend est froid, vérifier que le message de démarrage apparaît au lieu d'une barre figée.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Le wizard mène de la photo à l'avatar sans faire attendre deux fois"
```

---

## Task 7 : Le troisième emplacement dans l'interface

**Files:**
- Modify: `src/studio/subjects-page.tsx`, `src/studio/subject-picker.tsx`
- Test: `src/studio/subjects-page.test.tsx`

**Interfaces:**
- Consumes: tâches 2, 3, 6.
- Produces: `/sujets` complet, et le troisième sujet disponible dans tous les ateliers.

- [ ] **Step 1 : Écrire les tests qui échouent**

```tsx
test("l'emplacement vide invite à générer, il n'est pas juste absent", async () => {
  render(<SubjectsPage />);
  expect(await screen.findByRole("link", { name: /générer/i })).toHaveAttribute(
    "href",
    "/sujets/nouveau",
  );
});

test("les sujets livrés n'offrent ni suppression ni refonte", async () => {
  render(<SubjectsPage />);
  const shipped = await screen.findByRole("group", { name: "male_body" });

  expect(within(shipped).queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument();
  expect(within(shipped).queryByRole("button", { name: /refaire/i })).not.toBeInTheDocument();
});

test("refaire demande confirmation avant d'écraser", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  render(<SubjectsPage />);

  await userEvent.click(await screen.findByRole("button", { name: /refaire/i }));

  // Refaire coûte une minute de calcul et une nouvelle séance photo.
  expect(screen.getByRole("dialog")).toHaveTextContent(/écras/i);
});

test("annuler la confirmation laisse l'avatar en place", async () => {
  await savePersonalSubject(new Blob(["glb"]), null);
  render(<SubjectsPage />);
  await userEvent.click(await screen.findByRole("button", { name: /refaire/i }));

  await userEvent.click(screen.getByRole("button", { name: /annuler/i }));

  expect(await getPersonalSubject()).not.toBeNull();
});
```

- [ ] **Step 2 : Lancer les tests, les voir échouer, compléter les deux écrans**

`subjects-page.tsx` : trois emplacements côte à côte, comme la maquette. Les deux livrés portent un cadenas et n'exposent que « Choisir ». Le troisième est soit vide (« Générer »), soit rempli (« Choisir / Refaire / Supprimer », avec la date et la taille). « Refaire » et « Supprimer » passent par une confirmation.

`subject-picker.tsx` (plan 1, tâche 11) n'a rien à changer : il consomme `listSubjects()`, qui renvoie désormais trois entrées.

- [ ] **Step 3 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 4 : Vérification manuelle**

Run: `npm run dev`.
Attendu : après génération, `/sujets` montre les trois emplacements ; ouvrir `/render/dot-matrix` et choisir « Le vôtre » rend **son propre corps** en matrice de points ; les quatre modules acceptent les trois sujets sans se recadrer de travers.

C'est le moment où le devkit boucle : un corps généré depuis une photo passe dans un shader écrit par un étudiant.

- [ ] **Step 5 : Mettre à jour la documentation**

`README.md` gagne la section « Générer votre propre corps » ; `docs/pipeline-avatar.md` est complété avec ce qui a été appris au portage. Commit séparé.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Le corps du contributeur devient un sujet comme les autres"
```
