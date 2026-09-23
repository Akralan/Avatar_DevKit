import type { RenderModule } from "../../kit/types";
import { WireframeRenderer, type WireframeConfig } from "./renderer";

const module: RenderModule<WireframeConfig> = {
  id: "wireframe",
  title: "Fil de fer",
  author: "MyTwin",
  description:
    "Le sujet en maillage translucide. Three.js nu, aucun shader — le point d'entrée pour comprendre le contrat d'un module.",

  defaultConfig: { opacite: 0.35, couleur: "#41b7de" },

  controls: [
    { kind: "slider", key: "opacite", label: "Opacité", min: 0, max: 1, step: 0.01 },
    { kind: "color", key: "couleur", label: "Couleur" },
  ],

  create({ renderer, camera, subject }) {
    const engine = new WireframeRenderer(renderer, camera, subject);

    return {
      frame: ({ rotation }) => engine.render(rotation),
      setConfig: (config) => engine.setConfig(config),
      resize: () => {},
      dispose: () => engine.dispose(),
      onSubjectChange: (next) => engine.setSubject(next),
    };
  },
};

export default module;
