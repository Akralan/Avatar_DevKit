// ─────────────────────────────────────────────────────────────────────────────
//  C'EST ICI QUE TOUT COMMENCE.
//
//  Ce shader reçoit deux images produites hors écran par le kit :
//    uNormalTexture — les normales du sujet, encodées en RGB. Noir = pas de
//                     corps à cet endroit. C'est ce qui donne la silhouette.
//    uDepthTexture  — la profondeur. Plus c'est proche, plus c'est petit.
//
//  Modifiez une ligne, regardez l'écran : il se met à jour sans recharger.
// ─────────────────────────────────────────────────────────────────────────────

uniform sampler2D uNormalTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSpeed;
uniform float uBandes;

varying vec2 vUv;

void main() {
  vec3 normale = texture2D(uNormalTexture, vUv).rgb;

  // Le fond de la passe d'analyse est noir : tout ce qui a une normale est du
  // corps. Masque binaire, pas de dégradé — on sélectionne, on n'interpole pas.
  float corps = step(0.02, length(normale));
  if (corps < 0.5) discard;

  // Une vague qui remonte le long du sujet. `vUv.y` est la coordonnée
  // verticale, 0 en bas, 1 en haut.
  float vague = sin((vUv.y * uBandes - uTime * uSpeed) * 6.2831853) * 0.5 + 0.5;

  // L'orientation de la surface ajoute du relief : une face tournée vers nous
  // est plus claire qu'une face de profil.
  float relief = clamp(normale.b, 0.0, 1.0);

  vec3 couleur = mix(uColorA, uColorB, vague);
  gl_FragColor = vec4(couleur * (0.45 + 0.55 * relief), 1.0);
}
