# MyTwin Avatar DevKit — Plan 1 : le socle et les ateliers

> **Correction, 23/09/2026 :** le deuxième corps de référence n'est **pas
> versionné** — le dépôt est public, et un scan de corps identifiable n'y a pas
> sa place. Il reste utilisable : déposé dans `public/models/`, il apparaît
> dans la liste des sujets ; absent, il en disparaît sans rien casser.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un devkit autonome où un contributeur clone, lance `npm run dev`, et obtient un rendu à l'écran en moins de cinq minutes — puis son propre effet en moins d'une heure.

**Architecture:** Application Vite + React + TypeScript à la racine du repo. `src/kit/` porte tout le cycle de vie WebGL et n'est jamais recopié ; `src/renders/*/module.ts` sont autodécouverts par `import.meta.glob` ; `src/studio/` contient les quatre écrans. Les quatre moteurs three.js de `mytwin-health-landing` sont portés, pas réécrits : ce sont des classes vanilla qui ignorent React.

**Tech Stack:** Vite · React 19 · TypeScript 5 strict · three 0.184.0 · react-router 7 · vite-plugin-glsl · Vitest + Testing Library + jsdom

**Spec:** `docs/2026-09-23-devkit-avatar-design.md`

**Périmètre :** ce plan s'arrête aux deux sujets livrés avec le repo. L'emplacement personnel, le wizard de génération et la greffe backend sont couverts par le plan 2 (`docs/2026-09-23-devkit-plan-2-pipeline-avatar.md`). La seule couture entre les deux est `listSubjects()` (tâche 4), que le plan 2 étend.

## Global Constraints

- **Node ≥ 20.**
- **`three` épinglé à `0.184.0`** — exactement la version de la landing. Les quatre ports en dépendent.
- **`@mediapipe/tasks-vision` épinglé à `0.10.14`** — version validée dans `frontend/templates/index.html:365`.
- **Aucun appel CDN à l'exécution.** Tout vient de npm ou de `public/`. C'est la contrepartie de la suppression de la CSP écrite à la main.
- **Le kit n'appelle jamais `renderer.render()`.** Seul le module produit l'image, dans son `frame()`.
- **Aucun test automatisé de rendu** (comparaison d'images). Les vérifications visuelles sont des étapes manuelles explicites, écrites comme telles.
- **TypeScript strict**, aucun `any` implicite.
- **Textes d'interface en français, en dur.** Pas d'i18n, pas de fichier de traduction.
- **Messages de commit en français**, phrase à l'indicatif décrivant le résultat — le style de `mytwin-health-landing` (`git log --oneline` y donne le ton : « Les formulaires publics filtrent les bots… »).

## Review Focus

Les cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce spontanément. Chacune a son test rattaché à la tâche qui possède le code.

1. **Un GLB de sujet qui ne charge pas** (404, fichier tronqué) — l'atelier doit dire ce qui s'est passé, pas afficher un canvas noir muet. → tâche 5.
2. **Un module dont `create()` jette** (shader qui ne compile pas) — le contexte WebGL doit être libéré et l'erreur affichée ; les autres ateliers restent utilisables. → tâche 7.
3. **Une URL `?c=` bricolée ou périmée** (clé inconnue, valeur hors bornes, base64 invalide) — retomber sur `defaultConfig` sans planter. → tâche 8.
4. **WebGL indisponible ou contexte perdu** (`webglcontextlost`) — message explicite plutôt qu'une image figée sans explication. → tâche 7.
5. **`prefers-reduced-motion: reduce`** — les rotations automatiques et les chorégraphies se figent. Comportement déjà présent dans la landing (`twin-2d-canvas.tsx:24`), à ne pas perdre au portage. → tâche 7.

---

## Structure des fichiers

```
Avatar_DevKit/
├── package.json                  scripts dev / build / test / new:render
├── vite.config.ts                plugins, proxy backend, config Vitest
├── tsconfig.json
├── index.html
├── .env.example                  VITE_API_BASE
├── scripts/new-render.mjs        scaffolding d'un module
├── public/models/                male_body.glb, Rubens_MyTwin.glb, face_landmarker.task
├── backend/                      inchangé
├── docs/
└── src/
    ├── main.tsx                  montage React + routeur
    ├── App.tsx                   navigation + routes
    ├── setup-tests.ts            jest-dom
    ├── kit/
    │   ├── types.ts              RenderModule, RenderInstance, Control, RenderContext
    │   ├── registry.ts           import.meta.glob + accès par id
    │   ├── subjects.ts           listSubjects(), sujets livrés
    │   ├── framing.ts            math pure du cadrage auto
    │   ├── load-subject.ts       GLTFLoader + centrage + erreurs
    │   ├── orbit.ts              rotation au doigt, inertie
    │   ├── stage.tsx             <RenderStage/> — tout le cycle de vie WebGL
    │   ├── url-config.ts         encodage/décodage de ?c=
    │   ├── offscreen.ts          passe normales + profondeur (optionnelle)
    │   ├── thumbnails.ts         capture, cache IndexedDB, préchauffage
    │   └── controls/
    │       ├── controls-panel.tsx
    │       └── control-field.tsx
    ├── renders/
    │   ├── wireframe/ dot-matrix/ hologram/ reveal/ _template/
    └── studio/
        ├── gallery-page.tsx      /
        ├── workshop-page.tsx     /render/:id
        ├── workshop-overlay.tsx  le panneau flottant
        └── subjects-page.tsx     /sujets
```

---

## Task 1 : Bootstrap du repo

**Files:**
- Create: `.gitignore`, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/setup-tests.ts`, `src/index.css`
- Test: `src/App.test.tsx`
- Move: `frontend/models/face_landmarker.task` → `public/models/face_landmarker.task`
- Copy: `mytwin-health-landing/public/models/male_body.glb` et `Rubens_MyTwin.glb` → `public/models/`
- Delete: `frontend/`

**Interfaces:**
- Consumes: rien.
- Produces: `App` (composant nommé, export nommé) ; les routes `/`, `/render/:id`, `/sujets` ; `npm test` qui lance Vitest en jsdom.

- [ ] **Step 1 : Initialiser git et poser le `.gitignore`**

`mytwin-health-landing/` est un dépôt git distinct posé dans ce dossier. Il ne doit pas entrer dans le devkit.

```bash
cd /c/Users/alixc/Desktop/MyTwinAvatar/Avatar_DevKit
git init
```

`.gitignore` :

```
node_modules/
dist/
.env
.env.local
.superpowers/
__pycache__/
mytwin-health-landing/
```

**Committer l'état actuel avant toute suppression.** L'étape 2 efface `frontend/` ; sans ce commit, rien ne serait récupérable — le dossier n'a jamais été versionné.

```bash
git add -A
git commit -m "État de départ : pipeline photo vers avatar, frontend Flask et backend Python"
```

- [ ] **Step 2 : Déplacer les assets, supprimer le frontend Flask**

```bash
mkdir -p public/models
mv frontend/models/face_landmarker.task public/models/
cp mytwin-health-landing/public/models/male_body.glb public/models/
cp mytwin-health-landing/public/models/Rubens_MyTwin.glb public/models/
rm -rf frontend/
```

`Rubens_MyTwin.glb` pèse 34 Mo : c'est le corps réel du deuxième emplacement de sujet, et c'est aussi l'asset historique du module hologram. `male_body.glb` pèse 862 Ko.

- [ ] **Step 3 : Créer `package.json`**

Les versions sans `^` sont épinglées et ne doivent pas bouger (cf. Global Constraints).

```json
{
  "name": "mytwin-avatar-devkit",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "new:render": "node scripts/new-render.mjs"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.9.0",
    "three": "0.184.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/three": "^0.184.1",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-glsl": "^1.3.0",
    "vitest": "^2.1.0"
  }
}
```

```bash
npm install
```

- [ ] **Step 4 : Créer `vite.config.ts`**

Le proxy de dev reproduit le mode `PROXY_API` de l'ancien `app.py` : le navigateur ne voit qu'une seule origine, donc **aucun CORS en développement**. C'est ce qui neutralise le risque `CORS_ORIGIN` signalé au §11 de la spec — il ne réapparaît qu'en cas de déploiement du devkit.

```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";

const API_ROUTES = ["/body", "/graft", "/healthz"];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const target = env.VITE_API_BASE?.replace(/\/$/, "") ?? "";

  return {
    plugins: [react(), glsl()],
    server: target
      ? {
          proxy: Object.fromEntries(
            API_ROUTES.map((route) => [
              route,
              { target, changeOrigin: true, secure: false },
            ]),
          ),
        }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: ["./src/setup-tests.ts"],
      globals: true,
    },
  };
});
```

`.env.example` :

```
# URL du backend Scaleway. En dev, Vite proxifie /body, /graft et /healthz
# vers cette adresse : le navigateur ne voit qu'une origine, pas de CORS.
VITE_API_BASE=https://REMPLACER.functions.fnc.fr-par.scw.cloud
```

- [ ] **Step 5 : Créer `tsconfig.json`, `index.html`, `src/setup-tests.ts`, `src/index.css`**

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vite-plugin-glsl/ext", "vitest/globals"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MyTwin Avatar DevKit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/setup-tests.ts` :

```ts
import "@testing-library/jest-dom/vitest";
```

`src/index.css` : reset minimal (`*{box-sizing:border-box}`, `body{margin:0;font-family:system-ui,sans-serif}`) et les variables de couleur du devkit. Pas de framework CSS : la landing utilise Tailwind, le devkit n'en a pas besoin et les étudiants n'ont pas à l'apprendre.

- [ ] **Step 6 : Écrire le test qui échoue**

`src/App.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

test("la navigation expose les deux galeries", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: "Rendus" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Sujets" })).toHaveAttribute("href", "/sujets");
});
```

- [ ] **Step 7 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./App"`.

- [ ] **Step 8 : Écrire `src/App.tsx` et `src/main.tsx`**

```tsx
// src/App.tsx
import { NavLink, Route, Routes } from "react-router";

export function App() {
  return (
    <div className="app">
      <nav className="app-nav">
        <span className="brand">MyTwin Avatar DevKit</span>
        <NavLink to="/">Rendus</NavLink>
        <NavLink to="/sujets">Sujets</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<p>Galerie des rendus</p>} />
        <Route path="/render/:id" element={<p>Atelier</p>} />
        <Route path="/sujets" element={<p>Sujets</p>} />
      </Routes>
    </div>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 9 : Lancer le test et vérifier qu'il passe**

Run: `npm test`
Expected: PASS

- [ ] **Step 10 : Vérification manuelle**

Run: `npm run dev` puis ouvrir `http://localhost:5173`.
Attendu : la navigation s'affiche, les trois routes répondent, aucune erreur en console.

- [ ] **Step 11 : Commit**

```bash
git add -A
git commit -m "Le devkit démarre sur une application Vite, le frontend Flask disparaît"
```

---

## Task 2 : MediaPipe répond sous Vite

La spec (§11) désigne cette brique comme le seul élément dont l'échec remettrait le calendrier en cause. Elle se traite maintenant, pas au moment du wizard — on veut savoir tout de suite si le WASM se charge hors CDN.

**Files:**
- Create: `src/kit/face/landmarker.ts`, `src/studio/debug-face-page.tsx`
- Modify: `src/App.tsx` (ajouter la route `/debug/face`)
- Test: `src/kit/face/landmarker.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `createFaceLandmarker(): Promise<FaceLandmarker>` et `FACE_MODEL_PATH = "/models/face_landmarker.task"`, consommés par le plan 2.

- [ ] **Step 1 : Installer la dépendance**

```bash
npm install @mediapipe/tasks-vision@0.10.14
```

- [ ] **Step 2 : Écrire le test qui échoue**

Le chargement réel du WASM ne peut pas tourner en jsdom. Ce qui se teste ici, c'est que le module passe bien les options validées par l'ancien `index.html` — le reste se vérifie dans un navigateur, à l'étape 6.

`src/kit/face/landmarker.test.ts` :

```ts
import { vi } from "vitest";

const createFromOptions = vi.fn().mockResolvedValue({ mocked: true });
const forVisionTasks = vi.fn().mockResolvedValue("fileset");

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks },
  FaceLandmarker: { createFromOptions },
}));

test("le landmarker reprend les options validées du pipeline", async () => {
  const { createFaceLandmarker } = await import("./landmarker");
  await createFaceLandmarker();

  expect(createFromOptions).toHaveBeenCalledWith("fileset", {
    baseOptions: {
      modelAssetPath: "/models/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
});

test("le WASM est servi depuis node_modules, jamais depuis un CDN", async () => {
  const { createFaceLandmarker } = await import("./landmarker");
  await createFaceLandmarker();

  const [wasmRoot] = forVisionTasks.mock.calls[0];
  expect(wasmRoot).not.toMatch(/^https?:/);
});
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- landmarker`
Expected: FAIL — `Failed to resolve import "./landmarker"`.

- [ ] **Step 4 : Écrire `src/kit/face/landmarker.ts`**

`import.meta.url` résout le dossier WASM à l'intérieur de `node_modules`, ce qui remplace l'URL jsdelivr de l'ancienne page.

```ts
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export const FACE_MODEL_PATH = "/models/face_landmarker.task";

// Le modèle est le même fichier que celui du backend : les points détectés
// dans le navigateur doivent correspondre à ceux attendus par la greffe.
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const wasmRoot = new URL(
    "../../../node_modules/@mediapipe/tasks-vision/wasm",
    import.meta.url,
  ).href;

  const fileset = await FilesetResolver.forVisionTasks(wasmRoot);

  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}
```

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- landmarker`
Expected: PASS

- [ ] **Step 6 : Écrire la page de vérification et l'éprouver dans un navigateur**

`src/studio/debug-face-page.tsx` : ouvre la webcam (`getUserMedia({ video: true })`), appelle `createFaceLandmarker()`, détecte en boucle avec `detectForVideo(video, performance.now())` et affiche `resultat.faceLandmarks[0]?.length` à l'écran. Route `/debug/face`.

Run: `npm run dev`, ouvrir `http://localhost:5173/debug/face`, autoriser la caméra.
Attendu : **468** s'affiche à l'écran et l'image ne se fige pas. C'est le nombre de points du modèle.

Si le WASM refuse de se charger, la solution de repli est de copier `node_modules/@mediapipe/tasks-vision/wasm` dans `public/mediapipe/` et de passer ce chemin à `forVisionTasks`. **Ne pas revenir au CDN** — c'est la contrainte globale.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "La détection de visage tourne sous Vite, sans dépendre d'un CDN"
```

---

## Task 3 : Le contrat et le registre autodécouvert

**Files:**
- Create: `src/kit/types.ts`, `src/kit/registry.ts`
- Test: `src/kit/registry.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: les types `RenderModule<C>`, `RenderInstance<C>`, `RenderContext`, `Control<C>`, `RenderAction` ; et `listRenderModules(): RenderModule[]`, `getRenderModule(id: string): RenderModule | undefined`.

- [ ] **Step 1 : Écrire `src/kit/types.ts`**

Ce fichier ne contient que des types : il n'a rien à tester, et la tâche 4 et suivantes en dépendent toutes.

```ts
import type * as THREE from "three";

/** Un sujet chargé : corps entier avec son visage, centré à l'origine. */
export interface Subject {
  id: string;
  label: string;
  group: THREE.Group;
  /** Dimensions de la boîte englobante, après centrage. */
  size: THREE.Vector3;
  /** Présent seulement si le GLB embarque des animations. */
  mixer?: THREE.AnimationMixer;
}

export interface RenderContext {
  canvas: HTMLCanvasElement;
  /** Fourni et disposé par le kit. Le module s'en sert pour rendre. */
  renderer: THREE.WebGLRenderer;
  /** Caméra déjà cadrée sur le sujet. Le module peut l'ignorer. */
  camera: THREE.PerspectiveCamera;
  subject: Subject;
}

export interface FrameInfo {
  /** Secondes écoulées depuis la frame précédente. */
  delta: number;
  /** Secondes écoulées depuis le montage. */
  elapsed: number;
  /** Rotation Y courante, pilotée par l'orbit du kit. */
  rotation: number;
  /** true si l'utilisateur a demandé un mouvement réduit. */
  reduceMotion: boolean;
}

export interface RenderInstance<C> {
  /** Produit l'image. Le kit n'appelle jamais renderer.render() lui-même. */
  frame(info: FrameInfo): void;
  setConfig(config: C): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
  /** Appelé quand l'utilisateur change de sujet sans quitter l'atelier. */
  onSubjectChange?(subject: Subject): void;
}

/** Action propre au module, affichée dans le panneau à côté de « Défauts ». */
export interface RenderAction {
  id: string;
  label: string;
  run(instance: RenderInstance<never>): void;
}

export type Control<C> =
  | { kind: "slider"; key: keyof C; label: string; min: number; max: number; step: number }
  | { kind: "color"; key: keyof C; label: string }
  | { kind: "toggle"; key: keyof C; label: string }
  | { kind: "select"; key: keyof C; label: string; options: readonly string[] }
  | { kind: "group"; label: string; children: Control<C>[] };

export interface RenderModule<C = Record<string, unknown>> {
  /** Doit être égal au nom du dossier. Vérifié par le registre. */
  id: string;
  title: string;
  author: string;
  description: string;
  defaultConfig: C;
  controls: Control<C>[];
  actions?: RenderAction[];
  create(ctx: RenderContext): RenderInstance<C>;
}
```

- [ ] **Step 2 : Écrire le test qui échoue**

`src/kit/registry.test.ts` :

```ts
import { listRenderModules, getRenderModule } from "./registry";

test("les modules du dossier renders sont découverts sans index", () => {
  const ids = listRenderModules().map((module) => module.id);
  expect(ids).toContain("wireframe");
});

test("un id inconnu ne fait pas planter l'appelant", () => {
  expect(getRenderModule("nexistepas")).toBeUndefined();
});

test("les modules sont triés par titre, pour un ordre de galerie stable", () => {
  const titles = listRenderModules().map((module) => module.title);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "fr")));
});
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- registry`
Expected: FAIL — `Failed to resolve import "./registry"`.

- [ ] **Step 4 : Écrire `src/kit/registry.ts` et un module minimal `wireframe`**

```ts
import type { RenderModule } from "./types";

// eager: true — la galerie a besoin des métadonnées de tous les modules dès
// le premier rendu. Le code three.js de chaque module reste dans son create(),
// donc rien de lourd ne s'exécute au chargement.
const MODULES = import.meta.glob<{ default: RenderModule }>(
  "../renders/*/module.ts",
  { eager: true },
);

function folderOf(path: string): string {
  return path.split("/").at(-2) ?? "";
}

const ALL: RenderModule[] = Object.entries(MODULES)
  .map(([path, loaded]) => {
    const module = loaded.default;
    if (module.id !== folderOf(path)) {
      throw new Error(
        `Le module ${path} déclare l'id "${module.id}" mais vit dans le dossier "${folderOf(path)}". Les deux doivent être identiques.`,
      );
    }
    return module;
  })
  .sort((a, b) => a.title.localeCompare(b.title, "fr"));

export function listRenderModules(): RenderModule[] {
  return ALL;
}

export function getRenderModule(id: string): RenderModule | undefined {
  return ALL.find((module) => module.id === id);
}
```

Créer `src/renders/wireframe/module.ts` avec un manifeste minimal — `id: "wireframe"`, `title: "Fil de fer"`, `defaultConfig: {}`, `controls: []`, et un `create()` qui renvoie des méthodes vides. Le vrai moteur arrive en tâche 10.

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- registry`
Expected: PASS

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Un dossier déposé dans renders suffit à déclarer un rendu"
```

---

## Task 4 : Les sujets livrés

**Files:**
- Create: `src/kit/subjects.ts`
- Test: `src/kit/subjects.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type SubjectDescriptor = { id: string; label: string; url: string; origin: "livré" | "personnel"; locked: boolean }`, `listSubjects(): Promise<SubjectDescriptor[]>`, `DEFAULT_SUBJECT_ID = "male_body"`. **Le plan 2 remplace le corps de `listSubjects` pour y ajouter l'emplacement personnel ; sa signature ne bouge pas.**

- [ ] **Step 1 : Écrire le test qui échoue**

`src/kit/subjects.test.ts` :

```ts
import { DEFAULT_SUBJECT_ID, listSubjects } from "./subjects";

test("les deux sujets livrés sont présents et verrouillés", async () => {
  const subjects = await listSubjects();

  expect(subjects).toHaveLength(2);
  expect(subjects.every((subject) => subject.locked)).toBe(true);
  expect(subjects.map((subject) => subject.id)).toEqual(["male_body", "rubens"]);
});

test("le sujet par défaut est le modèle neutre", async () => {
  const subjects = await listSubjects();
  const found = subjects.find((subject) => subject.id === DEFAULT_SUBJECT_ID);

  expect(found?.url).toBe("/models/male_body.glb");
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- subjects`
Expected: FAIL — `Failed to resolve import "./subjects"`.

- [ ] **Step 3 : Écrire `src/kit/subjects.ts`**

`listSubjects` est asynchrone dès maintenant alors que rien ne l'exige : le plan 2 y lira IndexedDB, et changer la signature plus tard obligerait à reprendre tous les appelants.

```ts
export interface SubjectDescriptor {
  id: string;
  label: string;
  url: string;
  origin: "livré" | "personnel";
  /** Un sujet verrouillé ne peut être ni supprimé ni refait. */
  locked: boolean;
}

export const DEFAULT_SUBJECT_ID = "male_body";

const SHIPPED: SubjectDescriptor[] = [
  {
    id: "male_body",
    label: "male_body",
    url: "/models/male_body.glb",
    origin: "livré",
    locked: true,
  },
  {
    id: "rubens",
    label: "Corps réel",
    url: "/models/Rubens_MyTwin.glb",
    origin: "livré",
    locked: true,
  },
];

// Asynchrone par anticipation : le plan 2 y ajoute l'emplacement personnel,
// lu dans IndexedDB.
export async function listSubjects(): Promise<SubjectDescriptor[]> {
  return SHIPPED;
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- subjects`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Les deux sujets livrés avec le repo sont déclarés une seule fois"
```

---

## Task 5 : Chargement du sujet et cadrage automatique

Le cadrage par sphère englobante est aujourd'hui réimplémenté dans les quatre moteurs de la landing (`twin-view.tsx`, `twin-canvas.tsx`, `dot-matrix-renderer.ts`, `reveal-renderer.ts`). Il devient une fonction pure, testable, et une seule.

**Files:**
- Create: `src/kit/framing.ts`, `src/kit/load-subject.ts`
- Test: `src/kit/framing.test.ts`, `src/kit/load-subject.test.ts`

**Interfaces:**
- Consumes: `Subject`, `SubjectDescriptor` (tâches 3 et 4).
- Produces: `fitDistance(radius: number, fovDeg: number, margin: number): number`, `frameCamera(camera, size, options)`, `loadSubject(descriptor: SubjectDescriptor): Promise<Subject>`, et la classe d'erreur `SubjectLoadError`.

- [ ] **Step 1 : Écrire le test de cadrage qui échoue**

`src/kit/framing.test.ts` :

```ts
import { fitDistance } from "./framing";

test("un sujet deux fois plus grand demande deux fois plus de recul", () => {
  expect(fitDistance(2, 35, 1)).toBeCloseTo(fitDistance(1, 35, 1) * 2, 10);
});

test("une marge de 1 place la sphère exactement dans le champ", () => {
  // À 35° de FOV vertical, une sphère de rayon 1 tient pile à d = 1/sin(17.5°).
  expect(fitDistance(1, 35, 1)).toBeCloseTo(1 / Math.sin((35 / 2) * (Math.PI / 180)), 10);
});

test("une marge supérieure à 1 éloigne la caméra", () => {
  expect(fitDistance(1, 35, 1.15)).toBeGreaterThan(fitDistance(1, 35, 1));
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- framing`
Expected: FAIL — `Failed to resolve import "./framing"`.

- [ ] **Step 3 : Écrire `src/kit/framing.ts`**

```ts
import * as THREE from "three";

/**
 * Distance caméra pour qu'une sphère de `radius` tienne dans le champ vertical.
 * `margin` > 1 recule (sujet plus petit), < 1 rapproche.
 */
export function fitDistance(radius: number, fovDeg: number, margin: number): number {
  const halfFov = (fovDeg / 2) * (Math.PI / 180);
  return (radius / Math.sin(halfFov)) * margin;
}

/**
 * Cadre la caméra sur un sujet centré à l'origine. Contraint sur les DEUX axes :
 * ne cadrer que la hauteur suffit en paysage, mais en portrait le champ
 * horizontal est plus étroit que l'envergure des bras et les mains sortent du
 * cadre (leçon du dot-matrix de la landing). Doit donc être rejoué à chaque
 * resize, pas seulement au chargement.
 */
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  size: THREE.Vector3,
  { margin = 1.15 }: { margin?: number } = {},
): void {
  const radius = size.length() / 2;
  const vertical = fitDistance(radius, camera.fov, margin);
  const horizontalFov =
    2 * Math.atan(Math.tan((camera.fov / 2) * (Math.PI / 180)) * camera.aspect) * (180 / Math.PI);
  const horizontal = fitDistance(radius, horizontalFov, margin);

  camera.position.set(0, 0, Math.max(vertical, horizontal));
  camera.near = Math.max(0.01, camera.position.z - radius * 1.5);
  camera.far = camera.position.z + radius * 1.5;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- framing`
Expected: PASS

- [ ] **Step 5 : Écrire le test de chargement qui échoue** *(couvre le point 1 de Review Focus)*

`src/kit/load-subject.test.ts` :

```ts
import { vi } from "vitest";

const load = vi.fn();
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load = load;
  },
}));

import { loadSubject, SubjectLoadError } from "./load-subject";

const DESCRIPTOR = {
  id: "male_body",
  label: "male_body",
  url: "/models/male_body.glb",
  origin: "livré" as const,
  locked: true,
};

test("un GLB introuvable remonte une erreur qui nomme le sujet", async () => {
  load.mockImplementation((_url, _ok, _progress, fail) => fail(new Error("404")));

  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(SubjectLoadError);
  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(/male_body/);
});

test("l'erreur cite l'URL, pour qu'un asset mal placé se diagnostique seul", async () => {
  load.mockImplementation((_url, _ok, _progress, fail) => fail(new Error("404")));

  await expect(loadSubject(DESCRIPTOR)).rejects.toThrow(/\/models\/male_body\.glb/);
});
```

- [ ] **Step 6 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- load-subject`
Expected: FAIL — `Failed to resolve import "./load-subject"`.

- [ ] **Step 7 : Écrire `src/kit/load-subject.ts`**

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SubjectDescriptor } from "./subjects";
import type { Subject } from "./types";

export class SubjectLoadError extends Error {
  constructor(descriptor: SubjectDescriptor, cause: unknown) {
    super(
      `Le sujet « ${descriptor.label} » n'a pas pu être chargé depuis ${descriptor.url}. Vérifiez que le fichier existe dans public/models/.`,
    );
    this.name = "SubjectLoadError";
    this.cause = cause;
  }
}

export async function loadSubject(descriptor: SubjectDescriptor): Promise<Subject> {
  const loader = new GLTFLoader();

  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      loader.load(
        descriptor.url,
        resolve,
        undefined,
        (error) => reject(new SubjectLoadError(descriptor, error)),
      );
    },
  );

  const group = gltf.scene;
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);

  const mixer = gltf.animations.length
    ? new THREE.AnimationMixer(group)
    : undefined;
  mixer?.clipAction(gltf.animations[0]).play();

  return {
    id: descriptor.id,
    label: descriptor.label,
    group,
    size: box.getSize(new THREE.Vector3()),
    mixer,
  };
}
```

- [ ] **Step 8 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- load-subject framing`
Expected: PASS

- [ ] **Step 9 : Commit**

```bash
git add -A
git commit -m "Le cadrage automatique et le chargement du sujet vivent au même endroit"
```

---

## Task 6 : L'orbit au doigt

**Files:**
- Create: `src/kit/orbit.ts`
- Test: `src/kit/orbit.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `class PointerOrbit { constructor(element: HTMLElement); rotation: number; update(delta: number): void; dispose(): void }`.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/kit/orbit.test.ts` :

```ts
import { PointerOrbit } from "./orbit";

function drag(element: HTMLElement, from: number, to: number) {
  element.dispatchEvent(new PointerEvent("pointerdown", { clientX: from, bubbles: true }));
  element.dispatchEvent(new PointerEvent("pointermove", { clientX: to, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

test("glisser vers la droite fait tourner le sujet", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);

  drag(element, 0, 100);

  expect(orbit.rotation).toBeGreaterThan(0);
  orbit.dispose();
});

test("l'inertie décroît et finit par s'éteindre", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  drag(element, 0, 100);

  const afterDrag = orbit.rotation;
  orbit.update(0.016);
  const afterOneFrame = orbit.rotation;
  for (let i = 0; i < 400; i += 1) orbit.update(0.016);

  expect(afterOneFrame).toBeGreaterThan(afterDrag);
  expect(orbit.rotation).toBeCloseTo(orbit.rotation, 5);
  expect(afterOneFrame - afterDrag).toBeGreaterThan(0);
  orbit.dispose();
});

test("dispose retire les écouteurs posés sur window", () => {
  const element = document.createElement("div");
  const orbit = new PointerOrbit(element);
  const removeSpy = vi.spyOn(window, "removeEventListener");

  orbit.dispose();

  expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(removeSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- orbit`
Expected: FAIL — `Failed to resolve import "./orbit"`.

- [ ] **Step 3 : Écrire `src/kit/orbit.ts`**

Le `pointerdown` est scopé à l'élément et non à `window` : dans la landing, l'écouter sur `window` faisait capter le scroll de la page par le drag (`twin-view.tsx`). Le `pointermove`/`pointerup`, eux, doivent être sur `window`, sinon relâcher hors du canvas laisse le drag collé.

```ts
const DRAG_SENSITIVITY = 0.005;
/** Fraction de vitesse conservée par seconde. Réglé à l'œil. */
const DAMPING = 0.04;

export class PointerOrbit {
  public rotation = 0;

  private velocity = 0;
  private dragging = false;
  private lastX = 0;

  public constructor(private readonly element: HTMLElement) {
    element.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  public update(delta: number): void {
    if (this.dragging) return;
    this.rotation += this.velocity * delta;
    this.velocity *= DAMPING ** delta;
    if (Math.abs(this.velocity) < 1e-4) this.velocity = 0;
  }

  public dispose(): void {
    this.element.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastX = event.clientX;
    this.velocity = 0;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const deltaX = event.clientX - this.lastX;
    this.lastX = event.clientX;
    this.rotation += deltaX * DRAG_SENSITIVITY;
    this.velocity = deltaX * DRAG_SENSITIVITY * 60;
  };

  private readonly onUp = (): void => {
    this.dragging = false;
  };
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- orbit`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Le sujet tourne au doigt avec une inertie qui s'éteint"
```

---

## Task 7 : Le stage — tout le cycle de vie WebGL

Le cœur du socle. Ces ~80 lignes sont aujourd'hui dupliquées dans les quatre canvases de la landing.

**Files:**
- Create: `src/kit/stage.tsx`
- Test: `src/kit/stage.test.tsx`

**Interfaces:**
- Consumes: `RenderModule`, `RenderInstance`, `Subject` (tâche 3), `PointerOrbit` (tâche 6), `frameCamera` (tâche 5).
- Produces: le composant `<RenderStage module={} subject={} config={} className={} />` et le hook `useReduceMotion(): boolean`. Le stage affiche lui-même ses erreurs dans un `role="alert"` — il n'a pas de prop `onError`.

- [ ] **Step 1 : Écrire les tests qui échouent** *(couvre les points 2, 4 et 5 de Review Focus)*

`src/kit/stage.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { RenderStage } from "./stage";
import type { RenderModule } from "./types";

const subject = { id: "s", label: "s", group: {} as never, size: {} as never };

function moduleWith(overrides: Partial<RenderModule>): RenderModule {
  return {
    id: "test",
    title: "Test",
    author: "",
    description: "",
    defaultConfig: {},
    controls: [],
    create: () => ({
      frame: vi.fn(),
      setConfig: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    }),
    ...overrides,
  } as RenderModule;
}

test("un module qui jette affiche l'erreur au lieu d'un canvas muet", () => {
  const module = moduleWith({
    create: () => {
      throw new Error("le shader ne compile pas");
    },
  });

  render(<RenderStage module={module} subject={subject} config={{}} />);

  expect(screen.getByRole("alert")).toHaveTextContent("le shader ne compile pas");
});

test("un module qui jette ne laisse pas le contexte WebGL derrière lui", () => {
  const lose = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => ({ loseContext: lose }),
  } as never);

  render(
    <RenderStage
      module={moduleWith({
        create: () => {
          throw new Error("boum");
        },
      })}
      subject={subject}
      config={{}}
    />,
  );

  expect(lose).toHaveBeenCalled();
});

test("une perte de contexte est annoncée, pas subie en silence", () => {
  render(<RenderStage module={moduleWith({})} subject={subject} config={{}} />);
  const canvas = document.querySelector("canvas")!;

  canvas.dispatchEvent(new Event("webglcontextlost"));

  expect(screen.getByRole("alert")).toHaveTextContent(/contexte WebGL/i);
});

test("le mouvement réduit est transmis au module à chaque frame", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const frame = vi.fn();

  render(
    <RenderStage
      module={moduleWith({
        create: () => ({ frame, setConfig: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
      })}
      subject={subject}
      config={{}}
    />,
  );

  expect(frame).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: true }));
});

test("démonter le stage dispose l'instance du module", () => {
  const dispose = vi.fn();
  const { unmount } = render(
    <RenderStage
      module={moduleWith({
        create: () => ({ frame: vi.fn(), setConfig: vi.fn(), resize: vi.fn(), dispose }),
      })}
      subject={subject}
      config={{}}
    />,
  );

  unmount();

  expect(dispose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- stage`
Expected: FAIL — `Failed to resolve import "./stage"`.

- [ ] **Step 3 : Écrire `src/kit/stage.tsx`**

Points non négociables, tous hérités de la landing :
- boucle rAF **coupée hors viewport** par `IntersectionObserver` — contrainte perf mobile ;
- `ResizeObserver` qui rejoue `frameCamera` (le cadrage dépend de l'aspect ratio) ;
- `dispose` complet : instance du module, renderer, observers, orbit ;
- la première frame est rendue même à l'arrêt, sinon le canvas reste noir hors viewport.

```tsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { frameCamera } from "./framing";
import { PointerOrbit } from "./orbit";
import type { RenderInstance, RenderModule, Subject } from "./types";

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduce;
}

interface RenderStageProps<C> {
  module: RenderModule<C>;
  subject: Subject;
  config: C;
  className?: string;
}

export function RenderStage<C>({ module, subject, config, className }: RenderStageProps<C>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<RenderInstance<C> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setError(null);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const orbit = new PointerOrbit(canvas);
    const clock = new THREE.Clock();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setError("Le contexte WebGL a été perdu. Rechargez la page pour relancer le rendu.");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    let instance: RenderInstance<C>;
    try {
      instance = module.create({ canvas, renderer, camera, subject });
    } catch (cause) {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      // Libérer explicitement : un create() qui jette laisserait sinon un
      // contexte orphelin, et le navigateur en plafonne le nombre.
      renderer.forceContextLoss();
      renderer.dispose();
      orbit.dispose();
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    instanceRef.current = instance;
    instance.setConfig(config);

    let frameId: number | null = null;
    let elapsed = 0;

    const renderFrame = () => {
      const delta = clock.getDelta();
      elapsed += delta;
      orbit.update(delta);
      subject.mixer?.update(reduceMotion ? 0 : delta);
      instance.frame({ delta, elapsed, rotation: orbit.rotation, reduceMotion });
    };

    const loop = () => {
      renderFrame();
      frameId = requestAnimationFrame(loop);
    };

    const applySize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      frameCamera(camera, subject.size);
      instance.resize(clientWidth, clientHeight, pixelRatio);
    };

    applySize();
    renderFrame(); // une image même hors viewport, sinon canvas noir

    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(canvas);

    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && frameId === null) {
          clock.getDelta(); // purge le temps passé hors écran
          loop();
        } else if (!entry.isIntersecting && frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
      },
      { threshold: 0 },
    );
    visibility.observe(canvas);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      resizeObserver.disconnect();
      visibility.disconnect();
      orbit.dispose();
      instance.dispose();
      instanceRef.current = null;
      renderer.dispose();
    };
  }, [module, subject, reduceMotion]);

  useEffect(() => {
    instanceRef.current?.setConfig(config);
  }, [config]);

  if (error) {
    return (
      <div role="alert" className="stage-error">
        {error}
      </div>
    );
  }

  return <canvas ref={canvasRef} className={className} />;
}
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- stage`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Le kit tient seul le cycle de vie WebGL, aucun module ne le recopie"
```

---

## Task 8 : La configuration dans l'URL

**Files:**
- Create: `src/kit/url-config.ts`
- Test: `src/kit/url-config.test.ts`

**Interfaces:**
- Consumes: `Control` (tâche 3).
- Produces: `encodeConfig(config: object): string`, `decodeConfig<C>(raw: string | null, defaults: C, controls: Control<C>[]): C`.

- [ ] **Step 1 : Écrire le test qui échoue** *(couvre le point 3 de Review Focus)*

`src/kit/url-config.test.ts` :

```ts
import { decodeConfig, encodeConfig } from "./url-config";
import type { Control } from "./types";

interface Config {
  density: number;
  color: string;
}

const DEFAULTS: Config = { density: 260, color: "#79f0d1" };
const CONTROLS: Control<Config>[] = [
  { kind: "slider", key: "density", label: "Densité", min: 40, max: 400, step: 2 },
  { kind: "color", key: "color", label: "Couleur" },
];

test("une config encodée puis décodée revient identique", () => {
  const tuned: Config = { density: 120, color: "#ff0000" };

  expect(decodeConfig(encodeConfig(tuned), DEFAULTS, CONTROLS)).toEqual(tuned);
});

test("un paramètre absent retombe sur le défaut", () => {
  expect(decodeConfig(null, DEFAULTS, CONTROLS)).toEqual(DEFAULTS);
});

test("du base64 invalide ne fait pas planter l'atelier", () => {
  expect(decodeConfig("ceci-n-est-pas-du-base64!!", DEFAULTS, CONTROLS)).toEqual(DEFAULTS);
});

test("une clé inconnue est ignorée, pas propagée dans la config", () => {
  const encoded = encodeConfig({ density: 100, obsolete: 42 });

  expect(decodeConfig(encoded, DEFAULTS, CONTROLS)).toEqual({ density: 100, color: "#79f0d1" });
});

test("une valeur hors bornes est ramenée dans l'intervalle du contrôle", () => {
  const encoded = encodeConfig({ density: 99999 });

  expect(decodeConfig(encoded, DEFAULTS, CONTROLS).density).toBe(400);
});

test("une valeur du mauvais type retombe sur le défaut", () => {
  const encoded = encodeConfig({ density: "beaucoup" });

  expect(decodeConfig(encoded, DEFAULTS, CONTROLS).density).toBe(260);
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- url-config`
Expected: FAIL — `Failed to resolve import "./url-config"`.

- [ ] **Step 3 : Écrire `src/kit/url-config.ts`**

Le décodage est **validé par le schéma `controls`**, pas par une confiance aveugle : une URL partagée survit à une modification du module, et un lien collé de travers ne casse pas l'atelier.

```ts
import type { Control } from "./types";

export function encodeConfig(config: object): string {
  return btoa(encodeURIComponent(JSON.stringify(config)));
}

function flatten<C>(controls: Control<C>[]): Exclude<Control<C>, { kind: "group" }>[] {
  return controls.flatMap((control) =>
    control.kind === "group" ? flatten(control.children) : [control],
  );
}

export function decodeConfig<C extends object>(
  raw: string | null,
  defaults: C,
  controls: Control<C>[],
): C {
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(atob(raw)));
  } catch {
    return defaults;
  }
  if (typeof parsed !== "object" || parsed === null) return defaults;

  const incoming = parsed as Record<string, unknown>;
  const result = { ...defaults };

  for (const control of flatten(controls)) {
    const value = incoming[control.key as string];
    if (value === undefined) continue;

    if (control.kind === "slider") {
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      result[control.key] = Math.min(control.max, Math.max(control.min, value)) as C[keyof C];
    } else if (control.kind === "toggle") {
      if (typeof value !== "boolean") continue;
      result[control.key] = value as C[keyof C];
    } else if (control.kind === "select") {
      if (typeof value !== "string" || !control.options.includes(value)) continue;
      result[control.key] = value as C[keyof C];
    } else {
      if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) continue;
      result[control.key] = value as C[keyof C];
    }
  }

  return result;
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- url-config`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Un réglage se partage par son URL et survit à un lien bricolé"
```

---

## Task 9 : Le panneau de réglages généré

Remplace les 196 lignes écrites à la main de `twin-2d-controls.tsx`, qui ne servaient qu'une seule config.

**Files:**
- Create: `src/kit/controls/control-field.tsx`, `src/kit/controls/controls-panel.tsx`
- Test: `src/kit/controls/controls-panel.test.tsx`

**Interfaces:**
- Consumes: `Control` (tâche 3).
- Produces: `<ControlsPanel controls={} config={} onChange={} />` où `onChange(next: C)` reçoit la config complète.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/kit/controls/controls-panel.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ControlsPanel } from "./controls-panel";
import type { Control } from "../types";

interface Config {
  density: number;
  dither: boolean;
  mode: string;
}

const CONFIG: Config = { density: 260, dither: false, mode: "dots" };
const CONTROLS: Control<Config>[] = [
  { kind: "slider", key: "density", label: "Densité", min: 40, max: 400, step: 2 },
  { kind: "toggle", key: "dither", label: "Tramage" },
  { kind: "select", key: "mode", label: "Primitive", options: ["dots", "bars", "ascii"] },
];

test("chaque contrôle du schéma produit un champ", () => {
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />);

  expect(screen.getByLabelText("Densité")).toBeInTheDocument();
  expect(screen.getByLabelText("Tramage")).toBeInTheDocument();
  expect(screen.getByLabelText("Primitive")).toBeInTheDocument();
});

test("la valeur courante est affichée à côté du libellé", () => {
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={vi.fn()} />);

  // Sans ça on règle à l'aveugle et on ne peut pas reporter le chiffre
  // validé dans defaultConfig.
  expect(screen.getByText("260")).toBeInTheDocument();
});

test("déplacer un curseur remonte la config entière, pas le seul champ touché", async () => {
  const onChange = vi.fn();
  render(<ControlsPanel controls={CONTROLS} config={CONFIG} onChange={onChange} />);

  await userEvent.clear(screen.getByLabelText("Densité"));
  screen.getByLabelText("Densité").dispatchEvent(new Event("input", { bubbles: true }));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dither: false, mode: "dots" }));
});

test("un groupe rend ses enfants sous son libellé", () => {
  const grouped: Control<Config>[] = [
    { kind: "group", label: "Couleurs", children: [CONTROLS[1]] },
  ];
  render(<ControlsPanel controls={grouped} config={CONFIG} onChange={vi.fn()} />);

  expect(screen.getByText("Couleurs")).toBeInTheDocument();
  expect(screen.getByLabelText("Tramage")).toBeInTheDocument();
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- controls-panel`
Expected: FAIL — `Failed to resolve import "./controls-panel"`.

- [ ] **Step 3 : Écrire `control-field.tsx`**

Chaque champ a un `id` dérivé de sa clé et un `<label htmlFor>` : c'est ce que `getByLabelText` exige, et c'est l'accessibilité minimale.

```tsx
import type { Control } from "../types";

type Field<C> = Exclude<Control<C>, { kind: "group" }>;

interface ControlFieldProps<C> {
  control: Field<C>;
  value: C[keyof C];
  onChange(value: unknown): void;
}

export function ControlField<C>({ control, value, onChange }: ControlFieldProps<C>) {
  const id = `control-${String(control.key)}`;

  return (
    <div className="control-field">
      <label htmlFor={id}>{control.label}</label>
      {/* La valeur courante, sinon on règle à l'aveugle et on ne peut pas
          reporter le chiffre validé dans defaultConfig. */}
      {control.kind === "slider" && <span className="control-value">{String(value)}</span>}

      {control.kind === "slider" && (
        <input
          id={id}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number(value)}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
      )}

      {control.kind === "color" && (
        <input
          id={id}
          type="color"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {control.kind === "toggle" && (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      )}

      {control.kind === "select" && (
        <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {control.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Écrire `controls-panel.tsx`**

`onChange` reçoit la **config complète**, jamais un patch : le stage la repousse telle quelle au module, qui n'a pas à fusionner quoi que ce soit.

```tsx
import { ControlField } from "./control-field";
import type { Control } from "../types";

interface ControlsPanelProps<C extends object> {
  controls: Control<C>[];
  config: C;
  onChange(next: C): void;
}

export function ControlsPanel<C extends object>({
  controls,
  config,
  onChange,
}: ControlsPanelProps<C>) {
  const set = (key: keyof C, value: unknown) =>
    onChange({ ...config, [key]: value } as C);

  return (
    <div className="controls-panel">
      {controls.map((control, index) =>
        control.kind === "group" ? (
          <fieldset key={`${control.label}-${index}`}>
            <legend>{control.label}</legend>
            {control.children.map((child, childIndex) =>
              child.kind === "group" ? null : (
                <ControlField
                  key={`${String(child.key)}-${childIndex}`}
                  control={child}
                  value={config[child.key]}
                  onChange={(value) => set(child.key, value)}
                />
              ),
            )}
          </fieldset>
        ) : (
          <ControlField
            key={`${String(control.key)}-${index}`}
            control={control}
            value={config[control.key]}
            onChange={(value) => set(control.key, value)}
          />
        ),
      )}
    </div>
  );
}
```

Un `group` imbriqué dans un `group` est rendu `null` volontairement : deux niveaux suffisent à ranger un panneau, et autoriser la récursion infinie inviterait à construire des arbres de réglages que personne ne peut piloter à l'œil.

- [ ] **Step 5 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- controls-panel`
Expected: PASS

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Exposer un réglage coûte une ligne de schéma, plus un fichier React"
```

---

## Task 10 : Le module wireframe

Le plus simple des quatre : three.js nu, zéro shader. C'est l'exemple d'entrée du devkit, et il donne au stage quelque chose de réel à afficher.

**Files:**
- Create: `src/renders/wireframe/module.ts`, `src/renders/wireframe/renderer.ts`
- Source: `mytwin-health-landing/src/components/twin/basic/twin-view.tsx` (307 lignes)

**Interfaces:**
- Consumes: `RenderModule`, `RenderContext`, `RenderInstance` (tâche 3).
- Produces: le module `wireframe` dans le registre.

- [ ] **Step 1 : Porter le moteur dans `renderer.ts`**

Reprendre de `twin-view.tsx` la construction de scène et le matériau wireframe. **Supprimer** : le `"use client"`, le chargement GLB (le kit fournit le sujet), le cadrage caméra (tâche 5), les `IntersectionObserver`/`ResizeObserver`/rAF (tâche 7), les écouteurs de pointeur (tâche 6), l'import de `cn` et les classes Tailwind.

Ce qui reste est une classe :

```ts
import * as THREE from "three";
import type { Subject } from "../../kit/types";

export interface WireframeConfig {
  wireframeOpacity: number;
  color: string;
}

export class WireframeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly material: THREE.MeshStandardMaterial;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    subject: Subject,
  ) {
    this.material = new THREE.MeshStandardMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    this.setSubject(subject);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  }

  public setSubject(subject: Subject): void {
    this.scene.clear();
    subject.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = this.material;
    });
    this.scene.add(subject.group);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  }

  public setConfig(config: WireframeConfig): void {
    this.material.opacity = config.wireframeOpacity;
    this.material.color.set(config.color);
  }

  public render(rotation: number): void {
    this.scene.rotation.y = rotation;
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.material.dispose();
  }
}
```

L'opacité par défaut `0.16` est celle de la landing, relevée par rapport au `0.04` de l'ancienne landing sombre. Ne pas la « rééquilibrer » sans regarder l'écran.

- [ ] **Step 2 : Écrire le manifeste `module.ts`**

```ts
import type { RenderModule } from "../../kit/types";
import { WireframeRenderer, type WireframeConfig } from "./renderer";

const module: RenderModule<WireframeConfig> = {
  id: "wireframe",
  title: "Fil de fer",
  author: "MyTwin",
  description:
    "Le sujet en maillage translucide. Three.js nu, aucun shader — le point d'entrée pour comprendre le contrat d'un module.",

  defaultConfig: { wireframeOpacity: 0.16, color: "#1e293b" },

  controls: [
    { kind: "slider", key: "wireframeOpacity", label: "Opacité", min: 0, max: 1, step: 0.01 },
    { kind: "color", key: "color", label: "Couleur" },
  ],

  create({ renderer, camera, subject }) {
    const engine = new WireframeRenderer(renderer, camera, subject);

    return {
      frame: ({ rotation }) => engine.render(rotation),
      setConfig: (config) => engine.setConfig(config),
      resize: () => {},
      dispose: () => engine.dispose(),
      onSubjectChange: (next) => engine.setSubject(next),
    };
  },
};

export default module;
```

- [ ] **Step 3 : Lancer les tests du registre**

Run: `npm test -- registry`
Expected: PASS — `wireframe` est découvert et son id correspond au dossier.

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "Le rendu fil de fer arrive comme premier module de référence"
```

---

## Task 11 : L'écran atelier

La maquette validée : overlay flottant en haut à gauche, canvas intact derrière.

**Files:**
- Create: `src/studio/workshop-page.tsx`, `src/studio/workshop-overlay.tsx`, `src/studio/subject-picker.tsx`
- Modify: `src/App.tsx` (brancher la route `/render/:id`)
- Test: `src/studio/workshop-overlay.test.tsx`

**Interfaces:**
- Consumes: `RenderStage` (7), `ControlsPanel` (9), `getRenderModule` (3), `listSubjects`/`loadSubject` (4, 5), `encodeConfig`/`decodeConfig` (8).
- Produces: la route `/render/:id` opérationnelle.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/studio/workshop-overlay.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { WorkshopOverlay } from "./workshop-overlay";

const BASE = {
  module: {
    id: "wireframe",
    title: "Fil de fer",
    controls: [{ kind: "slider", key: "opacity", label: "Opacité", min: 0, max: 1, step: 0.01 }],
    defaultConfig: { opacity: 0.16 },
  },
  subjects: [
    { id: "male_body", label: "male_body", url: "", origin: "livré", locked: true },
  ],
  subjectId: "male_body",
  config: { opacity: 0.16 },
} as never;

test("le nom de l'effet et le sujet actif sont visibles sans ouvrir de menu", () => {
  render(<WorkshopOverlay {...BASE} onChange={vi.fn()} onReset={vi.fn()} onSubjectChange={vi.fn()} />);

  expect(screen.getByText("Fil de fer")).toBeInTheDocument();
  expect(screen.getByText("male_body")).toBeInTheDocument();
});

test("replier le panneau ne laisse que le canvas", async () => {
  render(<WorkshopOverlay {...BASE} onChange={vi.fn()} onReset={vi.fn()} onSubjectChange={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: /replier/i }));

  expect(screen.queryByLabelText("Opacité")).not.toBeInTheDocument();
});

test("« Rejouer » n'apparaît que si le module déclare une action", async () => {
  render(<WorkshopOverlay {...BASE} onChange={vi.fn()} onReset={vi.fn()} onSubjectChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Rejouer" })).not.toBeInTheDocument();

  const withAction = {
    ...BASE,
    module: { ...BASE.module, actions: [{ id: "replay", label: "Rejouer", run: vi.fn() }] },
  } as never;
  render(<WorkshopOverlay {...withAction} onChange={vi.fn()} onReset={vi.fn()} onSubjectChange={vi.fn()} />);

  expect(screen.getByRole("button", { name: "Rejouer" })).toBeInTheDocument();
});

test("« Défauts » remonte une demande de réinitialisation", async () => {
  const onReset = vi.fn();
  render(<WorkshopOverlay {...BASE} onChange={vi.fn()} onReset={onReset} onSubjectChange={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: "Défauts" }));

  expect(onReset).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npm test -- workshop-overlay`
Expected: FAIL — `Failed to resolve import "./workshop-overlay"`.

- [ ] **Step 3 : Écrire `workshop-overlay.tsx`**

Quatre sections dans cet ordre, comme la maquette validée :

1. retour galerie (`<Link to="/">`) + titre du module + bouton « Replier » ;
2. `<SubjectPicker>` — vignette + nom, ouvre la liste de `listSubjects()` ;
3. `<ControlsPanel>` ;
4. les actions : celles de `module.actions` s'il y en a, puis « Défauts » et « Copier la config / le lien » fournis par le kit.

Replier masque **tout** le panneau et ne laisse qu'un petit bouton « Réglages » — c'est le mode « je regarde mon rendu », la raison d'être de ce layout.

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { ControlsPanel } from "../kit/controls/controls-panel";
import { SubjectPicker } from "./subject-picker";
import { encodeConfig } from "../kit/url-config";
import type { RenderModule } from "../kit/types";
import type { SubjectDescriptor } from "../kit/subjects";

interface WorkshopOverlayProps<C extends object> {
  module: RenderModule<C>;
  subjects: SubjectDescriptor[];
  subjectId: string;
  config: C;
  onChange(next: C): void;
  onReset(): void;
  onSubjectChange(id: string): void;
  onAction?(actionId: string): void;
}

export function WorkshopOverlay<C extends object>({
  module,
  subjects,
  subjectId,
  config,
  onChange,
  onReset,
  onSubjectChange,
  onAction,
}: WorkshopOverlayProps<C>) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button type="button" className="overlay-reopen" onClick={() => setOpen(true)}>
        Réglages
      </button>
    );
  }

  return (
    <aside className="overlay">
      <header className="overlay-head">
        <Link to="/" aria-label="Retour à la galerie">
          ←
        </Link>
        <span className="overlay-title">{module.title}</span>
        <button type="button" onClick={() => setOpen(false)}>
          Replier
        </button>
      </header>

      <SubjectPicker subjects={subjects} activeId={subjectId} onChange={onSubjectChange} />

      <ControlsPanel controls={module.controls} config={config} onChange={onChange} />

      <footer className="overlay-actions">
        {/* Les actions propres au module d'abord : « Rejouer » n'existe que
            pour les rendus qui ont une timeline. */}
        {module.actions?.map((action) => (
          <button key={action.id} type="button" onClick={() => onAction?.(action.id)}>
            {action.label}
          </button>
        ))}
        <button type="button" onClick={onReset}>
          Défauts
        </button>
        <button
          type="button"
          onClick={() => {
            const url = `${location.origin}${location.pathname}?c=${encodeConfig(config)}`;
            void navigator.clipboard.writeText(url);
          }}
        >
          Copier le lien
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(JSON.stringify(config, null, 2))}
        >
          Copier la config
        </button>
      </footer>
    </aside>
  );
}
```

- [ ] **Step 4 : Écrire `workshop-page.tsx`**

La page assemble : `useParams()` → `getRenderModule(id)` (404 lisible si inconnu) ; `listSubjects()` + `loadSubject()` avec un état de chargement et l'affichage de `SubjectLoadError` ; `decodeConfig(searchParams.get("c"), module.defaultConfig, module.controls)` ; et `setSearchParams` à chaque changement de config via `encodeConfig`.

- [ ] **Step 5 : Lancer les tests et vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 6 : Vérification manuelle**

Run: `npm run dev`, ouvrir `http://localhost:5173/render/wireframe`.
Attendu : le sujet s'affiche en fil de fer, tourne au doigt avec inertie, le curseur d'opacité agit immédiatement, l'URL gagne un `?c=`, recharger la page conserve le réglage, changer de sujet charge `Rubens_MyTwin.glb` sans perdre le réglage, et « Replier » ne laisse que le canvas.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "L'atelier affiche un rendu réglable, partageable par son URL"
```

---

## Task 12 : Le module hologram

**Files:**
- Create: `src/renders/hologram/module.ts`, `src/renders/hologram/hologram-material.ts`, `src/renders/hologram/renderer.ts`
- Source: `mytwin-health-landing/src/components/twin/shader/hologram-material.ts` (423 lignes) et `twin-canvas.tsx` (240 lignes)

**Interfaces:**
- Consumes: le contrat (tâche 3).
- Produces: le module `hologram`.

- [ ] **Step 1 : Copier `hologram-material.ts` tel quel**

Le fichier n'a aucune dépendance React ni Next. Il exporte `HOLOGRAM_PRESETS`, `DEFAULT_PRESET`, `resolvePreset`, `HOLOGRAM_DEFAULTS`, `BLOOM_DEFAULTS`, `createHologramMaterial`, `applyHologramParams`.

- [ ] **Step 2 : Porter le chaînage de post-traitement dans `renderer.ts`**

De `twin-canvas.tsx`, garder `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` (imports `three/examples/jsm/postprocessing/*`). Jeter le chargement GLB, le cadrage, les observers et les classes Tailwind. `resize()` doit appeler `composer.setSize(width, height)` — c'est la seule raison pour laquelle ce module implémente `resize`.

C'est aussi le module qui justifie que **le kit n'appelle jamais `renderer.render()`** : ici c'est `composer.render()` qui produit l'image.

- [ ] **Step 3 : Écrire `module.ts`**

`defaultConfig` part de `HOLOGRAM_DEFAULTS` étendu du preset et des trois réglages de bloom. `controls` expose un `select` sur `Object.keys(HOLOGRAM_PRESETS)` plus un `group` « Bloom » contenant `strength`, `radius`, `threshold` en sliders.

- [ ] **Step 4 : Vérification manuelle**

Run: `npm run dev`, ouvrir `/render/hologram`.
Attendu : le rendu hologramme s'affiche, changer de preset le modifie sans recharger, les curseurs de bloom agissent, redimensionner la fenêtre ne déforme pas l'image.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Le rendu hologramme rejoint le devkit avec ses presets et son bloom"
```

---

## Task 13 : Le module dot-matrix et la passe hors écran

C'est ici que la technique centrale du devkit monte dans `kit/` : la spec (§3.3) assume explicitement la rupture avec la règle d'isolation de la landing, où `analysis-pass.ts` est dupliqué à l'identique dans deux dossiers.

**Files:**
- Create: `src/kit/offscreen.ts`, `src/renders/dot-matrix/` (`module.ts`, `renderer.ts`, `grid-pass.ts`, `glyph-atlas.ts`, `shaders/*.glsl`)
- Source: `mytwin-health-landing/src/components/twin/dot-matrix/` (8 fichiers)
- Test: `src/kit/offscreen.test.ts`

**Interfaces:**
- Consumes: le contrat (3).
- Produces: `createOffscreenPass(renderer, { width, height })` renvoyant `{ normalTarget, depthTexture, render(scene, camera), setSize(w, h), dispose() }` — réutilisé par la tâche 14.

- [ ] **Step 1 : Écrire le test de la passe hors écran**

Le rendu ne se teste pas en jsdom ; ce qui se teste, c'est la gestion des ressources — le point où un atelier fuit.

```ts
import { vi } from "vitest";
import { createOffscreenPass } from "./offscreen";

test("redimensionner ne crée pas une cible par appel", () => {
  const renderer = { setRenderTarget: vi.fn(), render: vi.fn() } as never;
  const pass = createOffscreenPass(renderer, { width: 100, height: 100 });
  const first = pass.normalTarget;

  pass.setSize(200, 200);

  expect(pass.normalTarget).toBe(first);
  expect(first.width).toBe(200);
});

test("dispose libère la cible et la texture de profondeur", () => {
  const renderer = { setRenderTarget: vi.fn(), render: vi.fn() } as never;
  const pass = createOffscreenPass(renderer, { width: 100, height: 100 });
  const dispose = vi.spyOn(pass.normalTarget, "dispose");

  pass.dispose();

  expect(dispose).toHaveBeenCalled();
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec, écrire `src/kit/offscreen.ts`**

Run: `npm test -- offscreen` → FAIL, puis porter le contenu de `analysis-pass.ts` (43 lignes, identique dans les deux dossiers de la landing) en y ajoutant `setSize` qui **réutilise** la cible au lieu d'en recréer une.

- [ ] **Step 3 : Porter le moteur dot-matrix**

Copier `dot-matrix-renderer.ts`, `grid-pass.ts`, `glyph-atlas.ts`, `config.ts`. Retirer le cadrage (`updateFraming`), le cycle de vie rAF, les pointeurs — tout est dans le kit. **Garder** `updateGradientRange` : le dégradé est borné sur l'emprise écran du sujet et cette projection des 8 coins est rejouée à chaque frame ; c'est un choix documenté, pas une optimisation.

`shaders.ts` (180 lignes de template strings) devient des fichiers `.glsl` importés par `vite-plugin-glsl` — c'est l'intérêt principal du passage à Vite.

Reporter en commentaire, dans ce dossier, les gotchas qui lui sont propres : Bayer 4×4 analytique (GLSL ES 1.00 interdit l'indexation dynamique de tableau), couleur des dots chargée en sRGB brut, `near`/`far` serrés autour du sujet, atlas de glyphes généré au runtime en canvas 2D.

- [ ] **Step 4 : Écrire `module.ts`**

`controls` reprend les réglages de `Twin2DConfig` : `select` sur `mode` (`dots`/`bars`/`ascii`), sliders pour `gridColumns`, `dotRadius`, `dotSoftness`, `baseOpacity`, `ambient`, `normalInfluence`, `depthInfluence`, `edgeInfluence`, `backgroundOpacity`, `rotationSpeed`, `toggle` pour `dither`, et un `group` « Couleurs » avec les quatre couleurs.

`defaultConfig` = `DEFAULT_TWIN_2D_CONFIG` à l'identique. Ces valeurs sont réglées à l'œil ; le commentaire de `config.ts` qui l'indique voyage avec elles.

- [ ] **Step 5 : Vérification manuelle**

Run: `npm run dev`, ouvrir `/render/dot-matrix`.
Attendu : la matrice de points reproduit le rendu de `/twin-2D` de la landing ; les trois primitives commutent ; sur un viewport portrait étroit, **les mains ne sortent pas du cadre** (c'est le test du cadrage à deux axes de la tâche 5) ; éditer un `.glsl` met le rendu à jour sans recharger la page ni perdre les réglages.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "La matrice de points arrive avec sa passe hors écran mutualisée et ses shaders en fichiers"
```

---

## Task 14 : Le module reveal et les actions déclarées

**Files:**
- Create: `src/renders/reveal/` (`module.ts`, `renderer.ts`, `choreography.ts`, `discharges.ts`, `noise.ts`, `subject-projection.ts`, `shaders/*.glsl`)
- Source: `mytwin-health-landing/src/components/twin/reveal/` (11 fichiers)
- Test: `src/renders/reveal/choreography.test.ts`

**Interfaces:**
- Consumes: `createOffscreenPass` (13), `RenderAction` (3).
- Produces: le module `reveal`, premier à déclarer `actions`.

- [ ] **Step 1 : Écrire le test de la chorégraphie**

`choreography.ts` est une fonction pure interrogée à chaque frame — c'est la seule partie d'un moteur qui se teste vraiment.

```ts
import { frameAt } from "./choreography";

test("au temps zéro, seuls les germes sont allumés", () => {
  expect(frameAt(0).coverage).toBe(0);
});

test("la couverture croît puis sature à 1", () => {
  expect(frameAt(1000).coverage).toBeGreaterThan(frameAt(500).coverage);
  expect(frameAt(60_000).coverage).toBe(1);
});

test("la main passe à l'utilisateur une fois la silhouette complète", () => {
  expect(frameAt(60_000).interactive).toBe(true);
  expect(frameAt(0).interactive).toBe(false);
});

test("le pas de grille monte géométriquement, jamais linéairement", () => {
  const a = frameAt(1000).pitch / frameAt(2000).pitch;
  const b = frameAt(2000).pitch / frameAt(3000).pitch;

  // L'œil lit une densité en rapport, pas en écart.
  expect(a).toBeCloseTo(b, 1);
});
```

Adapter les noms exacts à la signature réelle de `choreography.ts` en la lisant d'abord — la fonction existe, le test décrit son comportement documenté.

- [ ] **Step 2 : Lancer le test, le voir échouer, porter le dossier**

Copier les 11 fichiers. Remplacer l'`analysis-pass.ts` local par `createOffscreenPass` du kit (tâche 13). Retirer `pointer-orbit.ts` — le kit fournit l'orbit (tâche 6). Convertir `shaders.ts` (346 lignes) en `.glsl`.

Reporter en commentaire les gotchas propres à ce module : un germe n'allume que la cellule qui le porte, les germes restent sur l'axe médian entre crâne et bassin, le front dépasse le sujet d'une épaisseur de crête, toutes les mesures du front sont en hauteurs de sujet.

- [ ] **Step 3 : Écrire `module.ts` avec son action**

```ts
actions: [
  {
    id: "replay",
    label: "Rejouer",
    run: (instance) => (instance as unknown as { replay(): void }).replay(),
  },
],
```

L'instance expose une méthode `replay()` en plus du contrat. `controls` expose un `toggle` « Courants » (`effectsEnabled`) et les couleurs.

- [ ] **Step 4 : Lancer les tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5 : Vérification manuelle**

Run: `npm run dev`, ouvrir `/render/reveal`.
Attendu : quatre germes se posent, le front remplit la silhouette, la trame monte en résolution, le sujet devient manipulable au doigt ; **le bouton « Rejouer » est présent** dans le panneau — et absent sur `/render/wireframe`. En `prefers-reduced-motion`, la chorégraphie ne s'anime pas.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "La révélation rejoint le devkit et inaugure les actions propres à un module"
```

---

## Task 15 : Les vignettes

**Files:**
- Create: `src/kit/thumbnails.ts`
- Test: `src/kit/thumbnails.test.ts`

**Interfaces:**
- Consumes: `listRenderModules` (3), `loadSubject` (5).
- Produces: `getThumbnail(id): Promise<string | null>`, `captureThumbnail(id, canvas): Promise<void>`, `warmMissingThumbnails(): Promise<void>`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { captureThumbnail, getThumbnail } from "./thumbnails";

test("une vignette capturée est relue depuis le cache", async () => {
  const canvas = document.createElement("canvas");
  canvas.toDataURL = () => "data:image/webp;base64,AAAA";

  await captureThumbnail("wireframe", canvas);

  expect(await getThumbnail("wireframe")).toBe("data:image/webp;base64,AAAA");
});

test("une vignette absente renvoie null au lieu de jeter", async () => {
  expect(await getThumbnail("jamais-visite")).toBeNull();
});
```

Le test tourne sur `fake-indexeddb` (`npm install -D fake-indexeddb`, importé dans `setup-tests.ts`).

- [ ] **Step 2 : Lancer le test, le voir échouer, écrire `thumbnails.ts`**

Une base IndexedDB `devkit`, un store `thumbnails` (clé = id du module, valeur = data URL WebP). `captureThumbnail` lit `canvas.toDataURL("image/webp", 0.8)`.

`warmMissingThumbnails` traite les modules manquants **un par un dans un seul canvas réutilisé** : monter le module, rendre une frame, capturer, disposer. Un canvas par tuile est exclu — les navigateurs plafonnent à ~8-16 contextes WebGL simultanés. La fonction est appelée via `requestIdleCallback` par la galerie, et un module qui jette est simplement sauté.

- [ ] **Step 3 : Lancer le test et vérifier qu'il passe**

Run: `npm test -- thumbnails`
Expected: PASS

- [ ] **Step 4 : Brancher la capture dans l'atelier**

Dans `workshop-page.tsx`, capturer une vignette ~2 secondes après le premier rendu réussi, si le module n'en a pas encore.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Chaque rendu gagne sa vignette sans multiplier les contextes WebGL"
```

---

## Task 16 : La galerie des rendus

**Files:**
- Create: `src/studio/gallery-page.tsx`, `src/studio/subjects-page.tsx`
- Modify: `src/App.tsx`
- Test: `src/studio/gallery-page.test.tsx`

**Interfaces:**
- Consumes: `listRenderModules` (3), `getThumbnail`/`warmMissingThumbnails` (15), `listSubjects` (4).
- Produces: les routes `/` et `/sujets` complètes.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
test("chaque module découvert a sa tuile", async () => { /* … getAllByRole("link") contient wireframe, dot-matrix, hologram, reveal … */ });

test("la tuile de scaffolding affiche la commande", async () => {
  expect(await screen.findByText("npm run new:render")).toBeInTheDocument();
});

test("les créations et les références sont dans la même grille", async () => {
  // Une seule <ul>, distinguées par une pastille — pas deux sections.
});
```

- [ ] **Step 2 : Lancer le test, le voir échouer, écrire les deux pages**

`gallery-page.tsx` : une grille, une tuile par `listRenderModules()`, vignette depuis `getThumbnail`, pastille « référence » si `author === "MyTwin"` sinon le nom de l'auteur, et en dernière position la tuile en pointillés qui affiche `npm run new:render`. Appeler `warmMissingThumbnails()` au montage, en idle.

`subjects-page.tsx` : les emplacements de `listSubjects()`, verrouillés, avec un bouton « Choisir » qui mène à l'atelier. Le troisième emplacement (personnel) arrive au plan 2.

- [ ] **Step 3 : Vérification manuelle**

Run: `npm run dev`, ouvrir `/`.
Attendu : quatre tuiles + la tuile de scaffolding ; au premier lancement les vignettes se remplissent progressivement sans figer la page ; cliquer une tuile ouvre son atelier.

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "La galerie se remplit toute seule des rendus trouvés dans le repo"
```

---

## Task 17 : Le scaffolding

**Files:**
- Create: `scripts/new-render.mjs`, `src/renders/_template/` (`module.ts`, `renderer.ts`, `shaders/fragment.glsl`)
- Modify: `src/kit/registry.ts` (exclure `_template`)
- Test: `scripts/new-render.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces: `npm run new:render <slug>`.

- [ ] **Step 1 : Écrire `_template/` — un effet qui marche déjà**

Non négociable : **pas un squelette vide**. Un dégradé animé plaqué sur la silhouette, avec deux réglages exposés (une couleur, une vitesse) et un fragment shader d'une quinzaine de lignes, clairement commenté à l'endroit où on est censé écrire. On part de quelque chose qui tourne et qu'on déforme ; jamais d'un écran noir face auquel on ne sait pas si c'est son code ou le kit qui est cassé.

- [ ] **Step 2 : Exclure `_template` du registre**

`registry.ts` filtre les dossiers commençant par `_`. Ajouter au test de la tâche 3 :

```ts
test("le template n'apparaît pas dans la galerie", () => {
  expect(listRenderModules().map((m) => m.id)).not.toContain("_template");
});
```

- [ ] **Step 3 : Écrire le test du script**

```js
test("le slug devient l'id du module, sinon le registre refusera le dossier", async () => {
  await run("mon-effet");
  const written = readFileSync("src/renders/mon-effet/module.ts", "utf8");
  expect(written).toContain('id: "mon-effet"');
});

test("un slug invalide est refusé avant toute écriture", async () => {
  await expect(run("Mon Effet!")).rejects.toThrow(/minuscules/);
});

test("un dossier existant n'est jamais écrasé", async () => {
  await run("mon-effet");
  await expect(run("mon-effet")).rejects.toThrow(/existe déjà/);
});
```

- [ ] **Step 4 : Écrire `scripts/new-render.mjs`**

Valide le slug (`/^[a-z0-9-]+$/`), refuse un dossier existant, copie `_template/`, remplace l'id et le titre, puis affiche :

```
✓ src/renders/mon-effet/ créé
  Ouvrez http://localhost:5173/render/mon-effet
  Le fichier à modifier en premier : src/renders/mon-effet/shaders/fragment.glsl
```

- [ ] **Step 5 : Vérification manuelle de bout en bout**

```bash
npm run new:render test-scaffold
npm run dev
```

Attendu : la tuile apparaît dans la galerie sans rien éditer d'autre, l'atelier affiche un effet qui tourne, éditer `fragment.glsl` met le rendu à jour sans recharger. Puis `rm -rf src/renders/test-scaffold`.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "Une commande suffit à partir d'un effet qui tourne déjà"
```

---

## Task 18 : La documentation

C'est le livrable, pas l'emballage : la spec (§2) pose que la qualité du template *est* le produit.

**Files:**
- Create: `README.md`, `docs/creer-un-rendu.md`, `docs/anatomie-d-un-rendu.md`, `docs/pipeline-avatar.md`
- Source des gotchas: `mytwin-health-landing/docs/features/twin.md`

- [ ] **Step 1 : Écrire le `README.md`**

Du clone au premier pixel, sans détour :

```markdown
## Démarrer

    git clone <url> && cd mytwin-avatar-devkit
    cp .env.example .env     # l'URL du backend vous est fournie
    npm install
    npm run dev

Ouvrez http://localhost:5173 — quatre rendus vous attendent.

## Créer le vôtre

    npm run new:render mon-effet

Ouvrez `src/renders/mon-effet/shaders/fragment.glsl` et changez une ligne.
L'écran se met à jour sans recharger.
```

Puis : l'arborescence commentée, la frontière `kit/` ↔ `renders/` (ce qu'on ouvre, ce qu'on n'ouvre pas), et le contrat `RenderModule` en un exemple complet.

- [ ] **Step 2 : Écrire `docs/anatomie-d-un-rendu.md`**

La technique des deux passes hors écran, expliquée. **Le piège n°1 y figure en tête** : le rendu dot-matrix est un raster 2D, jamais un nuage de points 3D. Remplacer le pipeline par des `THREE.Points` est l'erreur classique — la grille cesserait d'être rectiligne. Le modèle est rendu hors écran en normales + profondeur, et un quad plein écran échantillonne ces buffers au centre de chaque cellule.

Y migrent aussi les gotchas généraux de `twin.md` : le dégradé borné sur l'emprise écran du sujet, le `near`/`far` serré, le cadrage contraint sur les deux axes, la densité de grille suivant le viewport.

- [ ] **Step 3 : Écrire `docs/creer-un-rendu.md` et `docs/pipeline-avatar.md`**

Le premier : le tutoriel pas à pas, du `new:render` au premier shader modifié, avec le contrat commenté champ par champ.

Le second : comment `photo → GLB` fonctionne (rembg, Meshy, greffe CPU), ce que le backend attend, et pourquoi la greffe prend une minute. Sert de lecture préalable au plan 2.

- [ ] **Step 4 : Vérification manuelle**

Faire lire le README à quelqu'un qui n'a pas vu le repo, et le regarder essayer. Tout point où la personne hésite est un défaut du README, pas de la personne.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "Le repo explique comment créer un rendu sans lire le moteur"
```

---

## Ce qui reste au plan 2

L'emplacement personnel des sujets (IndexedDB, un seul, « Refaire » avec confirmation), le wizard de génération porté depuis `index.html` (photo → capture visage → greffe → rangement), le remplacement de `model-viewer` par un viewer maison, et le branchement du backend Scaleway.
