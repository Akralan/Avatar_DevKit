# Créer un rendu

Du dossier vide au premier effet à vous. Comptez une heure, dont cinquante
minutes à regarder l'écran.

---

## 1. Créez le dossier

```bash
npm run new:render mon-effet
```

Le nom ne prend que des minuscules, des chiffres et des tirets. Il devient à la
fois le nom du dossier, l'identifiant du module et l'adresse de votre atelier —
les trois doivent coïncider, et le registre vous le dira franchement sinon.

Vous obtenez :

```
src/renders/mon-effet/
├── module.ts                  ← la carte d'identité et les réglages
├── renderer.ts                ← le pipeline, déjà écrit
└── shaders/
    ├── fullscreen.vert.glsl   ← ne le touchez pas tout de suite
    └── effect.frag.glsl       ← ★ c'est ici que vous écrivez
```

Ouvrez **http://localhost:5173/render/mon-effet**. Il y a déjà quelque chose à
l'écran : un dégradé qui remonte le long du corps. C'est votre point de départ.

## 2. Changez une ligne

Dans `shaders/effect.frag.glsl`, trouvez :

```glsl
float vague = sin((vUv.y * uBandes - uTime * uSpeed) * 6.2831853) * 0.5 + 0.5;
```

Remplacez `vUv.y` par `vUv.x`. Enregistrez.

L'écran se met à jour **sans recharger la page** : vos réglages restent, le corps
reste chargé, seule l'image change. C'est ce qui rend l'itération supportable, et
c'est la raison pour laquelle les shaders sont des fichiers et pas des chaînes de
caractères dans du TypeScript.

## 3. Comprenez ce que vous avez sous la main

Votre fragment shader reçoit deux images, produites hors écran par le kit :

```glsl
uniform sampler2D uNormalTexture;  // l'orientation de la surface, en RGB
uniform sampler2D uDepthTexture;   // la distance à la caméra
```

Le fond est noir. Tout ce qui a une normale est du corps :

```glsl
vec3 normale = texture2D(uNormalTexture, vUv).rgb;
float corps = step(0.02, length(normale));
if (corps < 0.5) discard;
```

`normale.b` vous donne gratuitement du relief : une surface tournée vers vous est
plus claire qu'une surface de profil.

Le détail du pipeline et ses pièges sont dans
[anatomie-d-un-rendu.md](anatomie-d-un-rendu.md). Lisez-le quand vous voudrez
sortir du dégradé — notamment le passage sur le raster 2D, qui vous évitera une
journée perdue.

## 4. Ajoutez un réglage

Trois endroits, dans cet ordre.

**Le type**, dans `renderer.ts` :

```ts
export interface TemplateConfig {
  vitesse: number;
  intensite: number;   // ← nouveau
}
```

**L'uniform**, dans le même fichier :

```ts
uniforms: {
  uIntensite: { value: 1 },
},

// et dans setConfig :
uniforms.uIntensite.value = config.intensite;
```

**Le curseur**, dans `module.ts` :

```ts
defaultConfig: { vitesse: 0.35, intensite: 1 },

controls: [
  { kind: "slider", key: "intensite", label: "Intensité", min: 0, max: 3, step: 0.01 },
],
```

Il apparaît dans le panneau, avec sa valeur affichée à côté du libellé. Vous
n'avez aucun composant React à écrire : le panneau se construit à partir de ce
tableau.

Types disponibles : `slider`, `color`, `toggle`, `select` (avec `options`), et
`group` pour replier une section sous un titre.

> Un filet de sécurité : un test du dépôt vérifie que chaque clé de contrôle
> existe bien dans `defaultConfig`, et que les bornes d'un curseur encadrent sa
> valeur par défaut. Une faute de frappe ne casse pas le build — elle produit un
> réglage qui ne fait rien. `npm test` l'attrape.

## 5. Réglez à l'œil, puis figez

Quand le rendu vous plaît :

- **Copier la config** met le JSON dans votre presse-papier. Collez-le dans
  `defaultConfig` : votre rendu s'ouvrira désormais sur ce réglage.
- **Copier le lien** vous donne une URL qui reproduit exactement ce que vous
  voyez, sujet compris. C'est ce qu'on envoie pour montrer un résultat.

## 6. Changez de corps

Le sélecteur en haut du panneau bascule entre les sujets sans recharger l'atelier
ni perdre vos réglages. Prenez l'habitude de vérifier votre effet sur les deux :
un rendu réglé sur un modèle neutre peut s'effondrer sur un corps réel, qui n'a
ni la même densité de maillage ni les mêmes proportions.

Si vous avez généré votre propre corps depuis une photo, il apparaît là aussi —
voir [pipeline-avatar.md](pipeline-avatar.md).

## 7. Si quelque chose casse

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| Un message d'erreur rouge à la place du rendu | Votre `create()` a jeté. Le message est celui de l'exception — souvent une erreur de compilation du shader, ligne indiquée. |
| L'écran reste vide, sans erreur | Votre `frame()` ne rend rien, ou rend dans la mauvaise cible. Vérifiez le `setRenderTarget(null)` avant la passe visible. |
| Le corps est là mais tout noir | Le masque de silhouette ou l'éclairage. Affichez `normale` directement en couleur pour voir ce que vous recevez. |
| La grille danse quand le sujet tourne | Vous avez collé quelque chose à la géométrie au lieu de l'écran. Relisez le premier paragraphe d'`anatomie-d-un-rendu.md`. |
| Une page blanche | Une erreur de TypeScript. La console du terminal où tourne `npm run dev` la nomme. |

## 8. Avant de pousser

```bash
npm test     # la suite complète
npm run build  # vérification des types + build de production
```

Les deux doivent être verts. Ensuite, votre rendu part sur votre dépôt à vous :
il apparaîtra dans la galerie de quiconque clonera votre fork, avec votre nom
dessus.
