import { listRenderModules } from "../kit/registry";
import type { Control } from "../kit/types";

function flatten<C>(controls: Control<C>[]): Exclude<Control<C>, { kind: "group" }>[] {
  return controls.flatMap((control) =>
    control.kind === "group" ? flatten(control.children) : [control],
  );
}

// Contrat commun à tous les rendus, y compris ceux qu'écriront les
// contributeurs : une erreur ici ne casse pas le build, elle produit un
// réglage qui ne fait rien, ou un panneau qui ne sait pas s'afficher.
const MODULES = listRenderModules();

test.each(MODULES.map((module) => [module.id, module] as const))(
  "%s — chaque contrôle pointe une clé présente dans la config par défaut",
  (_id, module) => {
    const keys = Object.keys(module.defaultConfig);

    for (const control of flatten(module.controls)) {
      expect(keys).toContain(String(control.key));
    }
  },
);

test.each(MODULES.map((module) => [module.id, module] as const))(
  "%s — les bornes d'un curseur encadrent sa valeur par défaut",
  (_id, module) => {
    const config = module.defaultConfig as Record<string, unknown>;

    for (const control of flatten(module.controls)) {
      if (control.kind !== "slider") continue;
      const value = config[String(control.key)] as number;

      expect(value).toBeGreaterThanOrEqual(control.min);
      expect(value).toBeLessThanOrEqual(control.max);
    }
  },
);

test.each(MODULES.map((module) => [module.id, module] as const))(
  "%s — une option de liste par défaut fait partie des options proposées",
  (_id, module) => {
    const config = module.defaultConfig as Record<string, unknown>;

    for (const control of flatten(module.controls)) {
      if (control.kind !== "select") continue;

      expect(control.options).toContain(config[String(control.key)]);
    }
  },
);

test.each(MODULES.map((module) => [module.id, module] as const))(
  "%s — se présente avec un titre et une description",
  (_id, module) => {
    expect(module.title.trim()).not.toBe("");
    expect(module.description.trim()).not.toBe("");
  },
);
