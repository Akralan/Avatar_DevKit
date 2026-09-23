import type { Control } from "./types";

type Field<C> = Exclude<Control<C>, { kind: "group" }>;

/**
 * Base64 « URL-safe » : le base64 standard contient `+`, que `URLSearchParams`
 * relit comme une espace. Un lien partagé rendrait alors une config corrompue,
 * silencieusement — et c'est précisément l'usage qu'on vise.
 */
function toUrlSafe(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafe(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

export function encodeConfig(config: object): string {
  return toUrlSafe(btoa(encodeURIComponent(JSON.stringify(config))));
}

function flatten<C>(controls: Control<C>[]): Field<C>[] {
  return controls.flatMap((control) =>
    control.kind === "group" ? flatten(control.children) : [control],
  );
}

/**
 * Le décodage est **validé par le schéma `controls`**, jamais accepté sur
 * parole : une URL partagée survit à une modification du module, et un lien
 * collé de travers retombe sur les défauts au lieu de casser l'atelier.
 */
export function decodeConfig<C extends object>(
  raw: string | null,
  defaults: C,
  controls: Control<C>[],
): C {
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(atob(fromUrlSafe(raw))));
  } catch {
    return defaults;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return defaults;
  }

  const incoming = parsed as Record<string, unknown>;
  const result = { ...defaults };

  for (const control of flatten(controls)) {
    const value = incoming[String(control.key)];
    if (value === undefined) continue;

    switch (control.kind) {
      case "slider":
        if (typeof value !== "number" || Number.isNaN(value)) continue;
        result[control.key] = Math.min(
          control.max,
          Math.max(control.min, value),
        ) as C[keyof C];
        break;

      case "toggle":
        if (typeof value !== "boolean") continue;
        result[control.key] = value as C[keyof C];
        break;

      case "select":
        if (typeof value !== "string" || !control.options.includes(value)) continue;
        result[control.key] = value as C[keyof C];
        break;

      case "color":
        if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) continue;
        result[control.key] = value as C[keyof C];
        break;
    }
  }

  return result;
}
