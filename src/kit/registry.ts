import type { RenderModule } from "./types";

/**
 * Découverte automatique : déposer un dossier dans `src/renders/` suffit, il
 * n'existe aucun index à tenir à jour.
 *
 * `eager: true` — la galerie a besoin des métadonnées de tous les modules dès
 * son premier rendu. Le code three.js de chaque module reste enfermé dans son
 * `create()`, donc rien de lourd ne s'exécute au chargement.
 */
const MODULES = import.meta.glob<{ default: RenderModule }>("../renders/*/module.ts", {
  eager: true,
});

function folderOf(path: string): string {
  return path.split("/").at(-2) ?? "";
}

const ALL: RenderModule[] = Object.entries(MODULES)
  // Un dossier préfixé d'un souligné est un point de départ à copier, pas un
  // rendu à présenter : `_template` ne doit pas encombrer la galerie.
  .filter(([path]) => !folderOf(path).startsWith("_"))
  .map(([path, loaded]) => {
    const module = loaded.default;
    const folder = folderOf(path);
    if (module.id !== folder) {
      throw new Error(
        `Le module ${path} déclare l'id « ${module.id} » mais vit dans le dossier « ${folder} ». ` +
          `Les deux doivent être identiques, sinon son URL d'atelier ne mène nulle part.`,
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
