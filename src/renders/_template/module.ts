import type { RenderModule } from "../../kit/types";
import { TemplateRenderer, type TemplateConfig } from "./renderer";

// ─────────────────────────────────────────────────────────────────────────────
//  La carte d'identité de votre rendu.
//
//  `id` DOIT être le nom du dossier — sinon l'URL de votre atelier ne mène
//  nulle part, et le registre vous le dira franchement au démarrage.
//
//  Chaque entrée de `controls` fabrique un champ dans le panneau de l'atelier.
//  Une ligne ici = un réglage à l'écran, rien d'autre à brancher.
// ─────────────────────────────────────────────────────────────────────────────

const module: RenderModule<TemplateConfig> = {
  id: "_template",
  title: "Nouveau rendu",
  author: "Votre nom",
  description: "Un dégradé qui remonte le long du sujet. Déformez-le.",

  background: "#0e1116",

  defaultConfig: {
    couleurA: "#79f0d1",
    couleurB: "#6b5bd2",
    vitesse: 0.35,
    bandes: 3,
  },

  controls: [
    { kind: "color", key: "couleurA", label: "Couleur A" },
    { kind: "color", key: "couleurB", label: "Couleur B" },
    { kind: "slider", key: "vitesse", label: "Vitesse", min: 0, max: 2, step: 0.01 },
    { kind: "slider", key: "bandes", label: "Bandes", min: 1, max: 12, step: 1 },
  ],

  create({ renderer, camera, subject }) {
    const engine = new TemplateRenderer(renderer, camera, subject);

    return {
      frame: ({ delta, rotation, reduceMotion }) => engine.frame(delta, rotation, reduceMotion),
      setConfig: (config) => engine.setConfig(config),
      resize: (width, height, pixelRatio) => engine.resize(width, height, pixelRatio),
      dispose: () => engine.dispose(),
      onSubjectChange: (next) => engine.setSubject(next),
    };
  },
};

export default module;
