import type { RenderModule } from "../../kit/types";
import {
  DEFAULT_TWIN_2D_CONFIG,
  DOT_MATRIX_BACKGROUND,
  DOT_MATRIX_MODES,
  type Twin2DConfig,
} from "./config";
import { DotMatrixRenderer } from "./renderer";

const module: RenderModule<Twin2DConfig> = {
  id: "dot-matrix",
  title: "Matrice de points",
  author: "MyTwin",
  description:
    "Le sujet quantifié sur une grille alignée à l'écran : dots, barres ou glyphes ASCII. La technique de référence du devkit — deux passes hors écran, jamais un nuage de points.",

  background: DOT_MATRIX_BACKGROUND,

  defaultConfig: DEFAULT_TWIN_2D_CONFIG,

  controls: [
    { kind: "select", key: "mode", label: "Primitive", options: DOT_MATRIX_MODES },
    { kind: "slider", key: "gridColumns", label: "Densité", min: 40, max: 520, step: 2 },
    { kind: "slider", key: "dotRadius", label: "Rayon", min: 0, max: 0.5, step: 0.01 },
    { kind: "slider", key: "dotSoftness", label: "Douceur", min: 0, max: 0.5, step: 0.01 },
    { kind: "toggle", key: "dither", label: "Tramage Bayer" },
    {
      kind: "group",
      label: "Ombrage",
      children: [
        { kind: "slider", key: "baseOpacity", label: "Opacité de base", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "ambient", label: "Ambiant", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "normalInfluence", label: "Normales", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "depthInfluence", label: "Profondeur", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "edgeInfluence", label: "Contour", min: 0, max: 1, step: 0.01 },
        { kind: "slider", key: "backgroundOpacity", label: "Matrice de fond", min: 0, max: 0.3, step: 0.005 },
      ],
    },
    {
      kind: "group",
      label: "Couleurs",
      children: [
        { kind: "color", key: "dotColorStart", label: "Dégradé — départ" },
        { kind: "color", key: "dotColorEnd", label: "Dégradé — arrivée" },
        { kind: "color", key: "gridDotColor", label: "Matrice de fond" },
      ],
    },
    { kind: "slider", key: "rotationSpeed", label: "Rotation auto", min: 0, max: 1, step: 0.01 },
  ],

  create({ renderer, camera, subject }) {
    const engine = new DotMatrixRenderer(renderer, camera, subject);

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
