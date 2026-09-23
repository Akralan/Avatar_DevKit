// Copie le runtime WASM de MediaPipe dans public/, où Vite le sert à
// l'identique en développement et dans un build de production.
//
// Pourquoi ne pas pointer directement dans node_modules : `vite dev` sait
// servir ce dossier, `vite build` non — le chemin survivrait au dev et
// casserait en production, sans que rien ne le signale au passage.
//
// Le dossier de destination est ignoré par git : il se reconstruit à chaque
// npm install, il n'a rien à faire dans l'historique.
import { cp, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "node_modules/@mediapipe/tasks-vision/wasm");
const DESTINATION = resolve(ROOT, "public/mediapipe/wasm");

try {
  await access(SOURCE);
} catch {
  console.warn(
    "[mediapipe] runtime WASM introuvable — la capture du visage ne fonctionnera pas.\n" +
      "            Lancez `npm install @mediapipe/tasks-vision` puis relancez ce script.",
  );
  process.exit(0);
}

await mkdir(dirname(DESTINATION), { recursive: true });
await cp(SOURCE, DESTINATION, { recursive: true });

console.log(`[mediapipe] runtime WASM copié dans public/mediapipe/wasm`);
