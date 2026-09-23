import type { RenderModule, RenderInstance } from "../../kit/types";
import { REVEAL_BACKGROUND } from "./config";
import { RevealRenderer, type RevealConfig } from "./renderer";

/** L'instance expose `replay()` en plus du contrat : c'est ce que l'action
 *  « Rejouer » appelle, via la poignée du stage. */
interface RevealInstance extends RenderInstance<RevealConfig> {
  replay(): void;
}

const module: RenderModule<RevealConfig> = {
  id: "reveal",
  title: "Révélation",
  author: "MyTwin",
  description:
    "Quatre germes se posent, un front de propagation remplit la silhouette, puis la trame monte en résolution. Le module qui montre comment scénariser un rendu dans le temps.",

  background: REVEAL_BACKGROUND,

  defaultConfig: { effectsEnabled: true },

  controls: [{ kind: "toggle", key: "effectsEnabled", label: "Courants traversants" }],

  actions: [
    {
      id: "replay",
      label: "Rejouer",
      run: (instance) => (instance as unknown as RevealInstance).replay(),
    },
  ],

  create({ renderer, camera, subject }) {
    const engine = new RevealRenderer(renderer, camera, subject);

    const instance: RevealInstance = {
      frame: ({ delta, rotation, reduceMotion }) => engine.frame(delta, rotation, reduceMotion),
      setConfig: (config) => engine.setConfig(config),
      resize: (width, height, pixelRatio) => engine.resize(width, height, pixelRatio),
      dispose: () => engine.dispose(),
      onSubjectChange: (next) => engine.setSubject(next),
      replay: () => engine.replay(),
    };

    return instance;
  },
};

export default module;
