# Anatomie d'un rendu

Comment les rendus du devkit fabriquent une image, et les pièges qui ont coûté
cher à ceux qui les ont écrits avant vous.

---

## Le piège numéro un

> **Le rendu en matrice de points est un raster 2D. Jamais un nuage de points 3D.**

La source est bien un humain en trois dimensions, mais la sortie visible est une
grille d'écran fixe. La tentation — et l'erreur classique — est de remplacer le
pipeline par des `THREE.Points` collés aux sommets du modèle. Le résultat en a
l'air une seconde, puis la grille cesse d'être rectiligne : les points suivent la
géométrie au lieu de suivre l'écran, ils se serrent là où le maillage est dense,
ils dansent quand le sujet tourne.

La géométrie fournit **l'anatomie, la projection et l'occlusion**. Le shader
d'écran fournit **la direction artistique**. Les deux ne se mélangent pas.

---

## Les deux passes

C'est le pipeline que partagent `dot-matrix`, `reveal` et le template. Il vit
dans `src/kit/offscreen.ts`, et vous l'obtenez en une ligne.

### Passe 1 — le sujet, hors écran

Le corps est rendu dans une cible qui n'est **jamais affichée**, avec un
`MeshNormalMaterial` : chaque pixel contient l'orientation de la surface, encodée
en RGB. Une texture de profondeur accompagne la cible.

Ce que vous en tirez :

| Information | Où la lire | À quoi ça sert |
|---|---|---|
| Y a-t-il du corps ici ? | `length(normale) > 0` | la silhouette |
| Dans quel sens regarde la surface ? | `normale.rgb` | le relief, l'éclairage |
| À quelle distance ? | la texture de profondeur | l'avant/arrière, la brume |

Le fond est noir : tout ce qui a une normale est du corps. Le masque est
**binaire**, on sélectionne, on n'interpole pas.

### Passe 2 — le quad plein écran

Un rectangle qui couvre l'écran, avec votre fragment shader. Il lit les buffers
de la passe 1 et décide de chaque pixel. C'est là que tout se joue.

```ts
const offscreen = createOffscreenPass(renderer, { width: 1, height: 1 });

// dans frame() :
sourceScene.overrideMaterial = offscreen.normalMaterial;
renderer.setRenderTarget(offscreen.target);
renderer.render(sourceScene, camera);
sourceScene.overrideMaterial = null;

renderer.setRenderTarget(null);
renderer.render(quadScene, quadCamera);
```

---

## Les pièges, un par un

Chacun a été payé une fois. Ils sont ici pour que ça n'arrive pas deux fois.

### `NearestFilter`, partout

Le shader échantillonne le **centre exact** d'une cellule. Une interpolation
linéaire mélangerait corps et fond sur les contours, et le masque de silhouette
cesserait d'être déterministe — les bords se mettraient à grouiller d'une frame
à l'autre.

### Des plans de caméra serrés autour du sujet

Avec un `far` lointain, la profondeur linéarisée devient quasi constante sur le
corps : un réglage qui module par la profondeur ne module plus rien du tout. Le
kit resserre `near` et `far` autour de la sphère englobante à chaque cadrage.

### Le cadrage se contraint sur les deux axes

Ne cadrer que la hauteur suffit en paysage. En portrait, le champ horizontal est
plus étroit que l'envergure des bras, et **les mains sortent du cadre**. Le
résultat dépend donc du rapport de forme : il est rejoué à chaque
redimensionnement, pas seulement au chargement du sujet.

### Un dégradé se borne sur l'emprise écran du sujet, pas sur le cadre

Un corps est haut et étroit. Une diagonale plein cadre reste coincée dans sa
portion centrale, et aucune des deux couleurs n'est jamais atteinte. `dot-matrix`
projette les 8 coins de la boîte englobante à chaque frame pour en tirer les
bornes réelles — huit projections, c'est gratuit.

Corollaire : le dégradé appartient au **cadre**, pas au corps. Il ne tourne pas
avec lui.

### Les couleurs se chargent en sRGB brut

Un `ShaderMaterial` n'hérite pas de l'encodage de sortie de three. Chargez vos
couleurs avec `setStyle(hex, THREE.LinearSRGBColorSpace)` : les convertir en
linéaire assombrirait tout le rendu.

### Pas d'indexation dynamique de tableau en GLSL ES 1.00

`matrice[index]` dans un fragment shader ne compile pas. C'est pour ça que le
tramage Bayer 4×4 de `dot-matrix` est écrit analytiquement plutôt que lu dans un
tableau.

### La résolution d'analyse n'a pas besoin d'être celle de l'écran

Le shader ne lit qu'un texel par cellule. Rendre la passe 1 à la pleine
résolution d'un écran HiDPI se paie pour rien. Les rendus du devkit la plafonnent,
tout en gardant **au moins deux texels par cellule** : en deçà, la silhouette est
décidée par un échantillon sur deux et les contours grouillent.

### Une chorégraphie est une fonction pure, pas un état React

`reveal` tient toute son animation dans `choreography.ts` : une fonction qu'on
interroge à chaque frame, et qui répond « voilà à quoi ça ressemble à cet
instant ». React n'entre jamais dans la boucle. Une version antérieure faisait un
`setState` par frame — même résultat à l'écran, un rendu React par image en plus.

Avantage direct : cette fonction se teste. Voyez
`src/renders/reveal/choreography.test.ts`.

### Une densité se lit en rapport, pas en écart

Quand `reveal` fait monter la trame en résolution, le pas descend
**géométriquement**. Une interpolation linéaire passerait la moitié du temps
entre deux images presque identiques, puis avalerait tout le reste en un souffle.

### Le départ s'indexe sur le sujet, l'arrivée sur le pixel

La maille de départ vaut « hauteur du sujet ÷ 16 » : la silhouette basse
résolution est la même figure sur tous les écrans. La maille d'arrivée est en
pixels CSS : la trame finale a partout la même texture. C'est la seule façon
d'obtenir les deux — un pas fixe en pixels donnerait deux fois plus de points au
départ sur un grand écran ; un ratio fixe donnerait des points trois fois plus
petits à l'arrivée sur mobile.

---

## Ce que le kit vous garantit

Vous n'avez à écrire aucune de ces lignes :

- le canvas et le `WebGLRenderer`, configurés et libérés ;
- le sujet chargé, recentré sur l'origine, et sa boîte englobante ;
- une caméra cadrée automatiquement, sur les deux axes ;
- la rotation au doigt, avec une inertie qui s'éteint ;
- la boucle de rendu, **coupée quand le canvas sort de l'écran** ;
- le suivi du redimensionnement ;
- la libération complète au démontage.

Si votre `create()` jette — un shader qui ne compile pas, par exemple — le kit
affiche l'erreur et **libère le contexte WebGL**. Les navigateurs en plafonnent le
nombre simultané : sans ça, quelques plantages suffiraient à rendre les ateliers
suivants impossibles à ouvrir.

---

## Ce que vous contrôlez

Le contenu de `frame()`, entièrement. Vos passes, vos cibles de rendu, votre
post-traitement. `hologram` s'en sert pour faire passer l'image par une chaîne
`RenderPass → Bloom → OutputPass` ; c'est `composer.render()` qui produit
l'image, et le kit n'en sait rien.
