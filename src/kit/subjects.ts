export interface SubjectDescriptor {
  id: string;
  label: string;
  url: string;
  origin: "livré" | "personnel";
  /** Un sujet verrouillé ne peut être ni supprimé ni refait. */
  locked: boolean;
}

export const DEFAULT_SUBJECT_ID = "male_body";

// Les deux sujets livrés garantissent que tout le monde compare ses rendus sur
// le même corps.
const SHIPPED: SubjectDescriptor[] = [
  {
    id: "male_body",
    label: "male_body",
    url: "/models/male_body.glb",
    origin: "livré",
    locked: true,
  },
  {
    id: "rubens",
    label: "Corps réel",
    url: "/models/Rubens_MyTwin.glb",
    origin: "livré",
    locked: true,
  },
];

/**
 * Asynchrone par anticipation : le pipeline avatar y ajoutera l'emplacement
 * personnel, lu dans IndexedDB. Changer la signature plus tard obligerait à
 * reprendre tous les appelants.
 */
export async function listSubjects(): Promise<SubjectDescriptor[]> {
  return SHIPPED;
}
