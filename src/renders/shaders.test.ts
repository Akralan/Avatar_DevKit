// Les shaders viennent de gabarits TypeScript qui interpolaient du code
// (`${NOISE_GLSL}`). Converti en fichier, un placeholder oublié ne casse ni le
// build ni le typage : il casse la compilation du shader, à l'exécution, et le
// rendu devient un écran noir silencieux.
const SHADERS = import.meta.glob("./*/shaders/*.glsl", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

test("des shaders sont bien découverts, sinon ce test ne garde rien", () => {
  expect(Object.keys(SHADERS).length).toBeGreaterThan(0);
});

test.each(Object.entries(SHADERS))(
  "%s ne contient aucune interpolation TypeScript non substituée",
  (_path, source) => {
    expect(source).not.toMatch(/\$\{/);
  },
);

test.each(Object.entries(SHADERS))("%s n'a pas de `#include` orphelin", (_path, source) => {
  // `#include <chunk>` est résolu par three à la compilation du matériau ;
  // `#include fichier.glsl;` par vite-plugin-glsl au build. Tout le reste est
  // une faute de frappe qui ne se verra qu'à l'écran.
  const includes = source.match(/^\s*#include\s+.*$/gm) ?? [];

  for (const ligne of includes) {
    expect(ligne).toMatch(/#include\s+(<[a-z_]+>|[\w./-]+\.glsl;)/i);
  }
});
