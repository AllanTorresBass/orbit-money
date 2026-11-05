/** One short sentence shown inline after a create, update, or delete. */
export interface InlineFeedback {
  id: number;
  /** `low` for something that worked or a soft heads-up. `short` for a failure. */
  tone: "low" | "short";
  message: string;
}
