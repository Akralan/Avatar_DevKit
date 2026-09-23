# Le pipeline photo → avatar

Comment une photo devient un corps 3D utilisable comme sujet de rendu, et ce
qu'il faut savoir du backend qui le fabrique.

> **État :** le backend est en service ; l'écran de génération dans le devkit
> arrive avec le plan 2 (`docs/2026-09-23-devkit-plan-2-pipeline-avatar.md`).
> Les deux corps livrés dans `public/models/` suffisent à travailler en
> attendant.

---

## Le parcours

Le navigateur est le chef d'orchestre. Il n'y a **aucun état côté serveur** :
pas de base de données, pas de disque persistant, pas de file d'attente.

1. **La photo** part au backend, qui la détoure (`rembg`) et ouvre une tâche de
   génération de corps chez Meshy. Le backend répond un `task_id`.
2. **Le visage** est capturé dans le navigateur, en local, par MediaPipe
   FaceLandmarker (WASM). 478 points et une matrice de pose. Aucune image ne part
   à ce stade.
3. Le navigateur **construit un `face.glb`** à partir de ces points et de la
   photo du visage, au format exact qu'attend la greffe.
4. **La greffe** se fait côté backend : `face.glb` + `task_id` → `avatar.glb`.
   ~1 minute de calcul CPU.
5. L'avatar est **rangé dans IndexedDB**, sur l'appareil. Il n'en sort jamais.

Les étapes 1 et 2 **se recouvrent** : le corps se génère pendant que vous
cadrez votre visage. Les deux attentes ne s'additionnent pas — c'est ce qui rend
le parcours supportable.

## Les endpoints

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/body` | détourage + création de la tâche Meshy → `{task_id}` |
| `GET` | `/body/status?task_id=` | proxy court vers Meshy → `{status, progress}` |
| `POST` | `/graft` | `face.glb` + `task_id` → renvoie `avatar.glb` |
| `GET` | `/healthz` | état du service |

En développement, **Vite proxifie ces routes** vers le backend (voir
`vite.config.ts` et `VITE_API_BASE`). Le navigateur ne voit donc qu'une seule
origine : il n'y a aucune question de CORS tant que vous travaillez en local.

## Le format du `face.glb` n'est pas négociable

Le pipeline de greffe (`backend/pipeline/texture_swap.py`) attend exactement :

- **478 sommets** en ordre canonique MediaPipe ;
- **898 triangles**, la triangulation canonique extraite des `visage.glb` de
  référence ARCore ;
- des **UV** obtenus par projection orthographique du maillage frontalisé —
  `corr(U, x) = +1`, `corr(V, y) = −1` ;
- **une seule texture**.

S'en écarter ne produit pas une erreur : ça produit une greffe laide. Deux
constantes méritent d'être connues :

- **`FACE_TEX_MAX = 1024`** — la webcam capture jusqu'en 4K, mais le rastériseur
  du backend décode la texture en tableau numpy brut. Une texture 4K fait sauter
  le conteneur en OOM. Ce plafond est une protection serveur, pas un réglage de
  qualité. Les points étant normalisés, réduire la texture ne touche ni le
  repérage ni les UV.
- **`FACE_EDGE_ERODE = 0.07`** — les UV du contour sont rentrées vers
  l'intérieur, pour que les triangles de bordure échantillonnent la peau et
  jamais l'arrière-plan.

## Le pipeline de greffe

Python CPU pur (`numpy`, `scipy`, `trimesh`, `opencv`, rastériseur logiciel). Pas
de GPU, pas de Blender. `libgl1` et `libglib2.0-0` sont requis au runtime pour
opencv. La greffe est **synchrone**, environ une minute.

## Exploitation du backend

### Variables

`MESHY_API_KEY`, `MESHY_*`, `REMOVE_BG`, `REMBG_MODEL`, `CORS_ORIGIN`.

Les modes test — greffer `corps.glb` / `visage.glb` sans appeler Meshy — sont
pilotés **par requête** via les champs `local_body` / `local_face`, pas par une
variable d'environnement.

### Réglages du conteneur serverless

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Port | `8080` | celui qu'expose le `Dockerfile` |
| RAM / vCPU | **3072 Mo** / ~2500 mVCPU | le mélange de texture HD + rembg + mediapipe dépasse 2 Go ; 1024 Mo échoue quasi certainement |
| Concurrence | **1** | deux greffes simultanées se font OOM ; laisser la plateforme scaler en instances |
| Timeout | **300 s** | couvre le démarrage à froid et la greffe |
| Visibilité | **Public** | le navigateur appelle l'API directement |

### Build et déploiement

```bash
cd backend
docker build -t mytwin-api .
docker run -p 8080:8080 -e MESHY_API_KEY=... mytwin-api
```

Le build et le push de l'image sont automatisés par GitHub Actions
(`.github/workflows/deploy-backend.yml`) : à chaque push touchant le backend, les
runners construisent l'image et la poussent sur le registre. Seul secret requis :
`SCW_SECRET_KEY`. Le `.gitignore` fait une exception pour `backend/corps.glb` et
`backend/visage.glb`, afin que la CI puisse les embarquer.

**Un push d'image ne redéploie pas un conteneur en place.** Il faut déclencher le
déploiement depuis la console, ou activer le bloc auto-redeploy du workflow.

## Dépannage

**« Failed to fetch » alors que `curl <backend>/healthz` répond.** Le navigateur
est bloqué là où curl ne l'est pas : c'est du CORS. Ouvrez la console. Un
`blocked by CORS policy` signifie que `CORS_ORIGIN` ne correspond pas à l'origine
du frontend **au caractère près** — pièges classiques : le slash final
(`https://x/` ≠ `https://x`), `http` contre `https`. En développement, le proxy
Vite rend la question sans objet.

**Caméra inactive.** Elle exige un contexte sécurisé : HTTPS, ou `localhost` /
`127.0.0.1`. Un test depuis une IP réseau demande du HTTPS.

**Démarrage à froid.** La première requête après inactivité charge rembg et
mediapipe : 10 à 30 secondes. Fixer `min-scale=1` pendant une démonstration.

**Poids des avatars.** Un avatar fait ~60 Mo (corps haute résolution et
textures). IndexedDB peut être purgé par le navigateur sous pression de stockage,
particulièrement sur iOS. Un avatar auquel vous tenez se télécharge — la demande
de stockage persistant fait partie du plan 2, et n'est de toute façon jamais une
garantie absolue.

## Crédits Meshy

La protection des crédits est **volontairement absente** : c'est une
démonstration. Chaque génération de corps consomme des crédits réels. Les modes
test (`local_body`, `local_face`) existent précisément pour mettre au point le
parcours sans en dépenser — utilisez-les.
