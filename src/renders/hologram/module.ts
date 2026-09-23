import type { RenderModule } from "../../kit/types";
import { HOLOGRAM_PRESETS } from "./hologram-material";
import { HologramRenderer, type HologramConfig } from "./renderer";

const module: RenderModule<HologramConfig> = {
  id: "hologram",
  title: "Hologramme",
  author: "MyTwin",
  description:
    "Shader de matériau auto-ombré, émissions HDR compressées en AgX puis diffusées par un bloom. Le module qui montre qu'un rendu peut avoir sa propre chaîne de passes.",

  // Fond neutre : le rendu repose sur des émissions, un fond trop clair ou trop
  // noir en fausse la lecture.
  background: "#404040",

  defaultConfig: {
    preset: "base",
    bloomStrength: 0,
    bloomRadius: 0.4,
    bloomThreshold: 0.85,
    exposure: 0.28,
  },

  controls: [
    {
      kind: "select",
      key: "preset",
      label: "Preset",
      options: Object.keys(HOLOGRAM_PRESETS),
    },
    {
      kind: "group",
      label: "Bloom",
      children: [
        { kind: "slider", key: "bloomStrength", label: "Intensité", min: 0, max: 3, step: 0.01 },
        { kind: "slider", key: "bloomRadius", label: "Rayon", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "bloomThreshold", label: "Seuil", min: 0, max: 1, step: 0.01 },
      ],
    },
    { kind: "slider", key: "exposure", label: "Exposition", min: 0.05, max: 1.5, step: 0.01 },
  ],

  create({ renderer, camera, subject }) {
    const engine = new HologramRenderer(renderer, camera, subject);

    return {
      frame: ({ delta }) => engine.frame(delta),
      setConfig: (config) => engine.setConfig(config),
      resize: (width, height, pixelRatio) => engine.resize(width, height, pixelRatio),
      dispose: () => engine.dispose(),
      onSubjectChange: (next) => engine.setSubject(next),
    };
  },
};

export default module;
