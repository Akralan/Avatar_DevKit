# MyTwin Avatar DevKit — design

> Spec validée le 23/09/2026. Transforme `Avatar_DevKit` en atelier de création
> de rendus pour l'avatar, destiné à quatre étudiants en école de dev / 3D.

---

## 1. Intention

Aujourd'hui, la matière est éclatée en deux endroits qui s'ignorent :

- **`Avatar_DevKit/`** — le pipeline `photo → GLB` : un frontend Flask qui sert
  une page unique de 911 lignes (`index.html`, JS vanilla, `model-viewer` par
  CDN, MediaPipe WASM, galerie IndexedDB) et un backend Python déployé sur
  Scaleway (détourage rembg, génération de corps via Meshy, greffe du visage).
- **`mytwin-health-landing/src/app/[lang]/(sandbox)/`** — cinq routes non
  indexées, chacune un atelier de rendu, alimentées par quatre moteurs three.js
  isolés dans `src/components/twin/` (~4 200 lignes).

Le devkit **fusionne les deux** dans un repo autonome. La landing n'en fait
partie à aucun titre : ni son code, ni ses conventions, ni son historique.

## 2. Public et critères de succès

Quatre étudiants en école de dev et de 3D, sur un projet annuel MyTwin Avatar.
Chacun clone le repo, travaille dessus, et pousse **sur son GitHub perso**. Ce
n'est pas un repo de contribution : il n'y a ni PR, ni revue, ni retour vers un
tronc commun. C'est un **repo template**, et sa qualité *est* le produit.

Rien de ce qu'ils produisent n'a vocation à repartir vers la landing. Cette
décision libère entièrement le choix technique : aucune contrainte de
portabilité ne pèse sur le code.

Le devkit est réussi si :

- un étudiant qui clone a **un rendu à l'écran en moins de cinq minutes**, sans
  Docker, sans clé d'API, sans compte ;
- il a **son propre effet à l'écran en moins d'une heure**, sans avoir lu les
  4 200 lignes des moteurs existants ;
- éditer un shader **ne fait pas perdre l'état** de ce qu'il était en train de
  régler.

## 3. Décisions structurantes

### 3.1 Vite + React + TypeScript, une seule application

Flask disparaît. Son seul travail — servir une page statique, poser une CSP,
proxifier le backend en dev — est couvert par Vite en développement et par
n'importe quel hébergeur statique en production.

Ce qui a emporté la décision, dans l'ordre :

1. **Les shaders redeviennent des fichiers.** Dans la landing, `shaders.ts` est
   un pavé de template strings TypeScript, et la raison est documentée :
   *« Turbopack ne résout pas les imports `?raw` de Vite »*. Vite, lui, les
   résout. Pour quatre étudiants dont le métier est le shader, des `.glsl` avec
   coloration syntaxique et HMR n'est pas un confort, c'est l'outil de travail.
2. **Découverte automatique des modules** par `import.meta.glob` : créer un
   dossier suffit, il n'existe aucun index à tenir à jour.
3. **Une seule origine.** IndexedDB est cloisonné par origine. Pour qu'un avatar
   généré puisse servir de sujet à un atelier, il faut littéralement une seule
   application — ce qui écarte l'option « garder Flask et ajouter une app à
   côté ».
4. Pas de SSR, pas de Server Components, pas d'i18n. Un devkit n'a rien à
   référencer et n'a pas à être traduit.

Next.js a été écarté : son seul avantage résiduel était la parité de stack avec
la landing, or rien ne circule entre les deux.

### 3.2 La frontière `kit/` ↔ `renders/` est la seule qui compte

Toute la plomberie vit dans `kit/` et n'est jamais recopiée : boucle rAF coupée
hors viewport, `ResizeObserver`, `dispose` complet, chargement GLB, cadrage
automatique, orbit au doigt. Dans la landing, ces ~80 lignes de cycle de vie
WebGL sont dupliquées dans chacun des quatre renderers.

Un étudiant qui ouvre `renders/dot-matrix/` ne doit y trouver que ce qui fait
l'effet.

### 3.3 Rupture assumée avec la règle d'isolation de la landing

Dans `mytwin-health-landing`, `analysis-pass.ts` est dupliqué à l'identique
entre `dot-matrix/` et `reveal/`, **volontairement**, pour que toucher l'un ne
touche jamais l'autre.

Le devkit fait l'inverse : la technique des deux passes hors écran (normales +
profondeur, quantifiées par un quad plein écran) **est la chose à enseigner**.
Elle monte dans `kit/` comme aide optionnelle.

La landing optimise pour expédier sans casse ; le devkit pour comprendre et
réutiliser. Objectifs différents, règle différente.

---

## 4. Architecture du repo

Le frontend passe **à la racine** : l'expérience visée est
`git clone && npm install && npm run dev`, sans détour par un sous-dossier.

```
mytwin-avatar-devkit/
├── README.md                    # du clone au premier effet
├── package.json                 # dev, build, new:render
├── vite.config.ts               # proxy backend + plugin GLSL
├── .env.example                 # VITE_API_BASE=…
├── public/models/               # GLB livrés (sujets de référence)
├── docs/
│   ├── creer-un-rendu.md        # tutoriel pas à pas
│   ├── anatomie-d-un-rendu.md   # les deux passes, expliquées
│   └── pipeline-avatar.md       # comment photo → GLB fonctionne
├── backend/                     # inchangé, hors périmètre étudiant
└── src/
    ├── kit/                     # LE SOCLE — ils n'ont pas à l'ouvrir
    │   ├── types.ts             # RenderModule, RenderInstance, ControlSchema
    │   ├── stage.tsx            # canvas, rAF, resize, visibilité, dispose
    │   ├── subject.ts           # chargement GLB, centrage, cadrage auto
    │   ├── orbit.ts             # rotation au doigt, inertie amortie
    │   ├── offscreen.ts         # passe normales + profondeur (optionnelle)
    │   ├── controls/            # panneau généré depuis le schéma
    │   ├── registry.ts          # import.meta.glob des modules
    │   ├── thumbnails.ts        # capture + cache IndexedDB
    │   └── storage.ts           # sujet personnel (IndexedDB)
    ├── renders/                 # LE TERRAIN DE JEU
    │   ├── wireframe/           #   porté de basic/    — three.js nu
    │   ├── dot-matrix/          #   porté              — les deux passes
    │   ├── hologram/            #   porté de shader/   — matériau + bloom
    │   ├── reveal/              #   porté              — chorégraphie
    │   └── _template/           #   copié par new:render
    └── studio/                  # les écrans
```

---

## 5. Le contrat `RenderModule`

Un rendu est **un dossier** exposant un seul objet par défaut.

```ts
export default {
  id: "dot-matrix",
  title: "Matrice de points",
  author: "Prénom Nom",
  description: "Le sujet rendu en grille de dots alignée à l'écran.",

  defaultConfig: { gridColumns: 260, dotRadius: 0.22, dotColor: "#79f0d1" },

  controls: [
    { kind: "slider", key: "gridColumns", label: "Densité", min: 40, max: 400, step: 2 },
    { kind: "slider", key: "dotRadius", label: "Rayon du dot", min: 0, max: 0.5, step: 0.01 },
    { kind: "color", key: "dotColor", label: "Couleur" },
  ],

  create(ctx) {
    // ctx = { canvas, renderer, camera, subject }
    return { frame, setConfig, resize, dispose }
  },
} satisfies RenderModule<DotMatrixConfig>
```

**Ce que le kit garantit**, et qu'aucun module ne réécrit : le canvas et le
`WebGLRenderer` configurés ; le sujet déjà chargé, centré et cadré (auto-fit par
sphère englobante — aujourd'hui réimplémenté quatre fois) ; une caméra prête ;
l'orbit au doigt avec inertie ; la boucle rAF coupée hors viewport ; le
`ResizeObserver` ; et le `dispose` complet au démontage. Un module qui plante ne
doit pas fuiter de contexte WebGL.

**Ce que le module contrôle** : le contenu de `frame()`. **Le kit n'appelle
jamais `renderer.render()` lui-même** — il passe le renderer et laisse le module
produire l'image comme il l'entend, y compris avec ses propres render targets et
son post-processing. Choix assumé : il permet de tout casser, mais il évite le
plafond de verre au bout de trois semaines.

`RenderInstance` expose `frame`, `setConfig`, `resize`, `dispose`, plus deux
membres optionnels : `onSubjectChange(subject)` et une liste d'`actions`
propres au module (voir §7).

## 6. Le panneau de réglages, généré

`controls` est un schéma déclaratif — `slider`, `color`, `toggle`, `select`, et
`group` pour replier une section. Le panneau se construit à partir de lui.

Aujourd'hui, `twin-2d-controls.tsx` fait 196 lignes écrites à la main pour
**une seule** config. Avec ce schéma, exposer un paramètre coûte une ligne dans
un tableau, pas l'ouverture d'un fichier React.

**La valeur courante s'affiche à droite de chaque libellé** (`Densité — 260`).
Sans elle on règle à l'aveugle, et surtout on ne peut pas reporter le chiffre
validé dans `defaultConfig`. C'est le manque principal du panneau actuel.

**L'état du réglage vit dans l'URL** (`?c=<config encodée>`), ce qui rend
n'importe quel réglage partageable par copier-coller — au prof, entre eux, à
toi. Un bouton « copier la config » sort le JSON prêt à coller dans
`defaultConfig` quand un réglage est validé.

**Objectif de confort explicite :** éditer un `.glsl` recharge le rendu *sans
perdre l'état* — pas de reload de page, pas de réglages à refaire, pas de sujet
à recharger. C'est le HMR de Vite appliqué au bon endroit. Si un cas résiste
techniquement, le repli est le rechargement complet.

---

## 7. Les écrans

| Route | Rôle |
|---|---|
| `/` | Galerie des **rendus** — une tuile par module découvert |
| `/render/:id` | L'**atelier** |
| `/sujets` | Les **trois emplacements** de sujets |
| `/sujets/nouveau` | Le **wizard** de génération |

### 7.1 Galerie des rendus (accueil)

Une tuile par dossier de `src/renders/`. Les quatre références et les créations
de l'étudiant sont **mélangées dans la même grille**, distinguées par une simple
pastille : son travail a le même statut que le code livré.

Une dernière tuile en pointillés affiche `npm run new:render` — c'est le seul
endroit où la commande se découvre sans avoir lu le README.

**Vignettes :** capturées automatiquement et mises en cache dans IndexedDB. Un
canvas WebGL par tuile est exclu (les navigateurs plafonnent à ~8–16 contextes
simultanés). La capture se fait à la visite d'un atelier ; pour que la galerie
ne soit pas vide au tout premier lancement, le kit génère au repos les vignettes
manquantes **une par une dans un seul contexte WebGL réutilisé** (monter le
module, capturer une frame, libérer).

### 7.2 L'atelier — overlay flottant

Le canvas occupe **toute** la surface. Un unique panneau flottant en haut à
gauche, repliable d'une touche, contient dans l'ordre :

1. **Retour galerie + nom de l'effet** + bouton replier. Replier le panneau
   supprime *toute* l'UI : c'est le mode « je regarde mon rendu », et c'est la
   raison d'être de ce layout.
2. **Le sujet actif**, vignette + nom, cliquable pour en changer. Toujours
   visible : changer de sujet sans perdre son réglage est le geste le plus
   fréquent.
3. **Les réglages générés** depuis `controls`, valeur courante affichée.
4. **Les actions.** « Défauts » et « Copier la config / le lien » sont fournies
   par le kit. « Rejouer » n'apparaît **que si le module déclare une timeline** —
   `reveal` en a une, `dot-matrix` non.

Un layout à barre d'outils supérieure a été écarté au profit de celui-ci.

### 7.3 Les sujets — trois emplacements, pas une galerie

**Un sujet est un corps entier avec son visage**, jamais des pièces détachées.
Il y en a exactement trois, et ce nombre ne bouge pas :

| Emplacement | Origine | Droits |
|---|---|---|
| `male_body` | livré dans `public/models/` | verrouillé — défaut de tous les ateliers |
| corps réel fourni | livré dans `public/models/` | verrouillé |
| le sien | généré depuis une photo | **un seul**, supprimable et refaisable |

Les deux références garantissent que les quatre comparent leurs rendus sur le
même corps.

Ce modèle **supprime d'un coup** le suivi de quota, l'éviction automatique et la
liste qui grossit : un seul enregistrement IndexedDB, pire cas borné à ~60 Mo.
Seul garde-fou nécessaire : « Refaire » écrase l'avatar existant, donc demande
confirmation — le refaire coûte une minute de calcul et une nouvelle séance
photo.

Le corps réel fourni est **versionné dans le repo**, donc cloné et poussé sur
les GitHub perso des quatre étudiants. C'est un choix explicite ; l'alternative
écartée était de le servir depuis le backend.

### 7.4 Le wizard de génération

Porté **à l'identique** depuis `index.html` : photo → capture du visage
(MediaPipe FaceLandmarker, en local dans le navigateur) → greffe côté backend →
rangé dans l'emplacement personnel. Le parcours est éprouvé, y compris le
recouvrement où **le corps se génère pendant la capture du visage** — les deux
attentes ne s'additionnent pas. La barre de progression et ses états sont
repris fidèlement.

Les modes de test par requête (`local_body` / `local_face`, qui greffent
`corps.glb` / `visage.glb` sans appeler Meshy) restent exposés dans un panneau
de réglages, comme aujourd'hui, désactivés par défaut.

---

## 8. Backend et configuration

Le backend Python **ne bouge pas d'un octet**. Les étudiants tapent sur le
conteneur Scaleway déjà déployé, via `VITE_API_BASE`. Ils n'ont ni Docker, ni
clé Meshy, ni backend local à lancer.

Deux points d'exploitation :

- **`CORS_ORIGIN` doit accepter les origines `localhost`** des quatre étudiants.
  Aujourd'hui la variable vaut une origine unique ou `*`. Sans ça, le premier
  étudiant est bloqué dès la première génération.
- La greffe est synchrone (~1 min CPU) et le conteneur scale à zéro : la
  première requête après inactivité paie un cold start. L'UX d'attente existante
  couvre déjà ce cas.

---

## 9. Le chemin du contributeur

`npm run new:render <slug>` copie `_template/`, remplace le slug, et affiche
l'URL de l'atelier.

**Le template est un effet qui marche déjà**, pas un squelette vide. On part de
quelque chose qui tourne et qu'on déforme ; jamais d'un écran noir face auquel
on ne sait pas si c'est son code ou le kit qui est cassé. C'est la différence
entre une première heure productive et une première journée perdue.

**Un actif à récupérer :** `mytwin-health-landing/docs/features/twin.md`
contient une vingtaine de *gotchas* durement acquis — pourquoi la grille doit
être un raster 2D et jamais des `THREE.Points`, pourquoi le dégradé est borné
sur l'emprise écran du sujet, pourquoi le Bayer 4×4 est analytique, pourquoi les
germes de la révélation doivent rester sur l'axe médian. C'est de la
connaissance qu'un étudiant mettrait des semaines à reconstruire. Elle migre :
ce qui est propre à un effet reste en commentaire dans son dossier, ce qui est
général monte dans `docs/anatomie-d-un-rendu.md`.

---

## 10. Le portage

**Jeté** — `frontend/app.py`, le `Procfile` et le `runtime.txt` du frontend, la
CSP écrite à la main, et `index.html` en tant que fichier (sa logique est
portée, pas sa forme).

**Pris tel quel** — `backend/` entier, les GLB, `face_landmarker.task`, et les
quatre moteurs three.js : ce sont des classes vanilla, elles ignorent que React
existe.

**Réécrit** — les quatre couples `Stage`/`Canvas` (ils fusionnent dans
`kit/stage.tsx`), les pages Next (deviennent des routes), le panneau de
contrôles (devient générique), le wizard (vanilla JS → React).

**Retiré** — la dépendance i18n / dictionnaires. Le sandbox actuel est déjà en
textes durs, ce qui limite le travail.

**Remplacé** — `model-viewer`, aujourd'hui chargé par CDN pour les previews du
wizard, par un petit viewer maison : `kit/` contient déjà tout le nécessaire, et
ça supprime une dépendance externe et une ligne de CSP.

Les quatre moteurs sont tous portés, pas trois : ils forment une échelle
pédagogique — `wireframe` (three.js nu, zéro shader), `dot-matrix` (les deux
passes), `hologram` (shader de matériau + bloom), `reveal` (chorégraphie
temporelle). Quatre niveaux de difficulté, quatre points d'entrée selon le
profil de l'étudiant.

---

## 11. Risques

**MediaPipe FaceLandmarker en WASM** (chargé depuis jsdelivr, modèle `.task`
servi en local) est la brique la plus susceptible de résister au portage sous
Vite : chargement WASM, worker, en-têtes éventuels. **À traiter en premier dans
l'implémentation, jamais en dernier** — c'est le seul élément dont l'échec
remettrait en cause le calendrier.

**`CORS_ORIGIN`** (§8) — blocage certain s'il n'est pas traité avant la
distribution du repo.

**Le HMR sans perte d'état** (§6) est un objectif, pas une certitude. Le repli
est connu et acceptable.

---

## 12. Ce que le devkit ne fait pas

Décidé explicitement, pour qu'on ne le redécouvre pas plus tard :

- **Pas d'authentification**, pas de compte.
- **Pas de galerie serveur ni de partage entre étudiants.** Tout est local à
  l'appareil ; le partage passe par l'URL de config et par leurs GitHub perso.
- **Pas de package npm ni de submodule** : rien ne repart vers la landing.
- **Pas d'i18n.**
- **Pas de tests automatisés de rendu.** Comparer des images pour quatre
  étudiants serait une usine à gaz ; la vérification est visuelle, et c'est
  assumé.
