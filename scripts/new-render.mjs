// Crée un nouveau rendu à partir du template.
//
// Le template n'est pas un squelette vide : c'est un effet qui tourne déjà.
// On part de quelque chose qui marche et qu'on déforme — jamais d'un écran
// noir face auquel on ne sait pas si c'est son code ou le kit qui est cassé.
import { access, cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = "src/renders/_template";

/** Le slug devient l'id du module ET le nom du dossier : le registre exige
 *  qu'ils soient identiques. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createRender(slug, { root = REPO } = {}) {
  if (!SLUG.test(slug)) {
    throw new Error(
      `« ${slug} » ne convient pas comme nom de rendu : minuscules, chiffres et tirets uniquement (par exemple « glitch-scan »).`,
    );
  }

  const destination = join(root, "src/renders", slug);
  if (await exists(destination)) {
    throw new Error(`src/renders/${slug}/ existe déjà — choisissez un autre nom.`);
  }

  await cp(join(root, TEMPLATE), destination, { recursive: true });

  // Le template se nomme lui-même dans son manifeste et dans ses commentaires :
  // un dossier fraîchement créé ne doit en garder aucune trace.
  const files = await readdir(destination, { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;

    const path = join(file.parentPath ?? file.path, file.name);
    const contents = await readFile(path, "utf8");
    const rewritten = contents
      .replaceAll('id: "_template"', `id: "${slug}"`)
      .replaceAll('title: "Nouveau rendu"', `title: "${slug}"`)
      .replaceAll("_template", slug);

    if (rewritten !== contents) await writeFile(path, rewritten);
  }

  return destination;
}

// Exécution en ligne de commande. Importé par les tests, il ne fait rien.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [slug] = process.argv.slice(2);

  if (!slug) {
    console.error("Usage : npm run new:render <nom-du-rendu>");
    process.exit(1);
  }

  try {
    await createRender(slug);
    console.log(`\n  ✓ src/renders/${slug}/ créé`);
    console.log(`    Ouvrez http://localhost:5173/render/${slug}`);
    console.log(`    Le fichier à modifier en premier :`);
    console.log(`    src/renders/${slug}/shaders/effect.frag.glsl\n`);
  } catch (cause) {
    console.error(`\n  ✗ ${cause.message}\n`);
    process.exit(1);
  }
}
