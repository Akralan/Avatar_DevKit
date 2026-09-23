import { REVEAL_DURATION_MS, resolveRevealFrame, type RevealStage } from "./choreography";

const STAGE: RevealStage = { widthPx: 1000, subjectHeightPx: 640, finalPitchPx: 2.9 };

const frameAt = (ms: number) => resolveRevealFrame(ms, STAGE);
const pitchAt = (ms: number) => STAGE.widthPx / frameAt(ms).gridColumns;

test("au premier instant, rien n'est encore révélé", () => {
  expect(frameAt(0).revealRadius).toBe(0);
  expect(frameAt(0).opacity).toBe(0);
});

test("le front de propagation croît puis se fige", () => {
  expect(frameAt(1000).revealRadius).toBeGreaterThan(frameAt(600).revealRadius);
  expect(frameAt(REVEAL_DURATION_MS).revealRadius).toBeCloseTo(
    frameAt(REVEAL_DURATION_MS * 2).revealRadius,
    10,
  );
});

test("le front dépasse le sujet, il ne s'arrête pas à sa couverture", () => {
  // Les pieds sont à ~0.49 hauteur de sujet du germe de bassin. S'arrêter là
  // les laisserait dans la crête du front et figerait leur gonflement.
  expect(frameAt(REVEAL_DURATION_MS).revealRadius).toBeGreaterThan(0.52);
});

test("la main passe à l'utilisateur dès la silhouette complète, pas à la fin", () => {
  expect(frameAt(0).interactive).toBe(false);
  expect(frameAt(REVEAL_DURATION_MS).interactive).toBe(true);
  // La montée en résolution dure encore plusieurs secondes après ce point :
  // attendre la fin pour rendre la main ferait paraître le sujet inerte.
  const fin = frameAt(REVEAL_DURATION_MS);
  const auRelais = frameAt(1700);
  expect(auRelais.interactive).toBe(true);
  expect(auRelais.finished).toBe(false);
  expect(fin.finished).toBe(true);
});

test("la maille de départ s'indexe sur le sujet, celle d'arrivée sur le pixel", () => {
  // Un pas de départ fixé en px donnerait deux fois plus de dots sur un grand
  // écran ; un ratio fixe à l'arrivée donnerait des dots trois fois plus petits
  // sur mobile. C'est la seule façon d'avoir les deux.
  expect(pitchAt(0)).toBeCloseTo(STAGE.subjectHeightPx / 16, 6);
  expect(pitchAt(REVEAL_DURATION_MS)).toBeCloseTo(STAGE.finalPitchPx, 6);
});

test("le pas monte géométriquement, jamais linéairement", () => {
  const depart = pitchAt(0);
  const arrivee = pitchAt(REVEAL_DURATION_MS);

  // Repère la mise au point sans dépendre de constantes internes : c'est le
  // premier instant où le pas bouge.
  let debutMiseAuPoint = 0;
  for (let ms = 0; ms <= REVEAL_DURATION_MS; ms += 5) {
    if (Math.abs(pitchAt(ms) - depart) > 1e-9) {
      debutMiseAuPoint = ms;
      break;
    }
  }

  const milieu = debutMiseAuPoint + (REVEAL_DURATION_MS - debutMiseAuPoint) / 2;
  const geometrique = Math.sqrt(depart * arrivee);
  const lineaire = (depart + arrivee) / 2;

  // À 5 % près : le repère est trouvé par échantillonnage, pas au millième.
  // Ce qui compte est l'écart au lerp linéaire, qui est d'un facteur deux.
  expect(pitchAt(milieu) / geometrique).toBeCloseTo(1, 1);
  expect(pitchAt(milieu)).toBeLessThan(lineaire * 0.7);
});

test("la trame de fond n'apparaît qu'à la toute fin", () => {
  // Présente à l'ouverture, elle noierait les quatre germes dans un damier.
  expect(frameAt(0).backgroundFade).toBe(0);
  expect(frameAt(REVEAL_DURATION_MS / 2).backgroundFade).toBe(0);
  expect(frameAt(REVEAL_DURATION_MS).backgroundFade).toBe(1);
});

test("le pas final suit la finesse du rendu, pas celle de l'écran", async () => {
  const { resolveFinalPitch } = await import("./choreography");

  expect(resolveFinalPitch(2)).toBeLessThan(resolveFinalPitch(1));
});
