# MyTwin Avatar DevKit

Un atelier pour écrire des rendus 3D d'un corps humain. Vous clonez, vous lancez,
vous avez un effet à l'écran. Ensuite vous écrivez le vôtre.

## Démarrer

```bash
git clone <url> mytwin-avatar-devkit
cd mytwin-avatar-devkit
cp .env.example .env     # l'URL du backend vous est fournie
npm install
npm run dev
```

Ouvrez **http://localhost:5173** — quatre rendus vous attendent.

Rien d'autre à installer : pas de Docker, pas de clé d'API, pas de compte. Le
`.env` ne sert qu'à la génération d'avatar depuis une photo ; les rendus
fonctionnent sans lui, sur le corps livré avec le dépôt.

## Créer le vôtre

```bash
npm run new:render mon-effet
```

Ouvrez `src/renders/mon-effet/shaders/effect.frag.glsl` et changez une ligne.
L'écran se met à jour sans recharger, sans perdre vos réglages.

Le dossier que vous venez de créer **contient déjà un effet qui tourne**. Vous
ne partez jamais d'un écran noir : vous déformez quelque chose de vivant.

## Ce qu'il y a dans le dépôt

```
src/
├── kit/        ← le socle. Vous n'avez pas à l'ouvrir.
├── renders/    ← votre terrain de jeu. Un dossier = un rendu.
└── studio/     ← les écrans : galerie, atelier, sujets.
public/models/  ← les corps disponibles comme sujets
backend/        ← le pipeline photo → avatar, hors de votre périmètre
docs/           ← les guides
```

**La seule frontière qui compte est `kit/` ↔ `renders/`.** Le kit tient tout ce
qui est pénible et se répète : chargement du corps, cadrage de la caméra,
rotation au doigt, boucle de rendu, redimensionnement, libération de la mémoire
GPU. Un dossier de `renders/` ne contient que ce qui fait l'effet.

## Le contrat d'un rendu

Un rendu est un dossier qui exporte un seul objet :

```ts
export default {
  id: "mon-effet",          // doit être le nom du dossier
  title: "Mon effet",
  author: "Votre nom",
  description: "Ce que ça fait, en une phrase.",

  defaultConfig: { vitesse: 0.35, couleur: "#79f0d1" },

  // Une ligne ici = un champ dans le panneau de l'atelier.
  controls: [
    { kind: "slider", key: "vitesse", label: "Vitesse", min: 0, max: 2, step: 0.01 },
    { kind: "color", key: "couleur", label: "Couleur" },
  ],

  create({ renderer, camera, subject }) {
    // `subject` est déjà chargé, centré et cadré.
    return { frame, setConfig, resize, dispose };
  },
} satisfies RenderModule<MaConfig>;
```

Le kit **n'appelle jamais `renderer.render()` lui-même**. C'est votre `frame()`
qui produit l'image, comme vous voulez — plusieurs passes, vos propres cibles de
rendu, du post-traitement. Il n'y a pas de plafond de verre au bout de trois
semaines.

Types de contrôles disponibles : `slider`, `color`, `toggle`, `select`, et
`group` pour replier une section.

## Partager un réglage

L'atelier écrit vos réglages dans l'URL. « Copier le lien » vous donne une
adresse qui reproduit exactement ce que vous avez sous les yeux, sujet compris.
« Copier la config » sort le JSON, prêt à coller dans `defaultConfig` quand un
réglage est validé.

## Générer votre propre corps

Les rendus fonctionnent sur le corps livré avec le dépôt. Si vous voulez
travailler sur le vôtre :

```
/sujets  →  « Générer »
```

Le parcours prend une photo (trois angles valent mieux qu'un), capture votre
visage dans le navigateur, puis demande la greffe au backend. Comptez une minute
de calcul. Le corps généré vit **sur votre machine**, dans IndexedDB : il n'est
ni versionné ni envoyé ailleurs, et vous n'en avez qu'un.

Le **mode test** de l'écran de génération n'appelle pas Meshy et ne consomme
aucun crédit — utilisez-le pour mettre le parcours au point.

Détail du pipeline : [docs/pipeline-avatar.md](docs/pipeline-avatar.md).

## Les guides

| Fichier | Quand le lire |
|---|---|
| [docs/creer-un-rendu.md](docs/creer-un-rendu.md) | Votre premier rendu, pas à pas |
| [docs/anatomie-d-un-rendu.md](docs/anatomie-d-un-rendu.md) | Comment la technique fonctionne, et les pièges |
| [docs/pipeline-avatar.md](docs/pipeline-avatar.md) | Comment une photo devient un corps 3D |

## Les commandes

```bash
npm run dev              # serveur de développement
npm run build            # vérification des types + build de production
npm test                 # la suite de tests
npm run new:render <nom> # créer un rendu
```

## Ce que le devkit ne fait pas

Pas de compte, pas de galerie partagée, pas de sauvegarde en ligne. Tout vit sur
votre machine, et votre travail part sur votre dépôt à vous.
