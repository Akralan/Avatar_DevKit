import type { RenderModule } from "../../kit/types";

// Manifeste minimal — le moteur arrive en tâche 10. Il existe dès maintenant
// parce que le registre n'a rien à découvrir sans lui.
const module: RenderModule = {
  id: "wireframe",
  title: "Fil de fer",
  author: "MyTwin",
  description: "Le sujet en maillage translucide. Three.js nu, aucun shader.",
  defaultConfig: {},
  controls: [],
  create: () => ({
    frame: () => {},
    setConfig: () => {},
    resize: () => {},
    dispose: () => {},
  }),
};

export default module;
