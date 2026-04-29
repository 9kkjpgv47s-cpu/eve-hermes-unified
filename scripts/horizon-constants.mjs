/**
 * Single source of truth for horizon ids (H8 program extension).
 */
export const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];

/** Highest horizon id; used as default upper bound for policy windows. */
export const MAX_HORIZON_ID = "H8";

export const HORIZON_STAGE_MAP = {
  H1: "shadow",
  H2: "canary",
  H3: "majority",
  H4: "full",
  H5: "full",
  H6: "full",
  H7: "full",
  H8: "full",
};
