import type { DispatchState, UnifiedMessageEnvelope } from "../contracts/types.js";

export type LaneDispatchInput = {
  envelope: UnifiedMessageEnvelope;
  intentRoute: string;
  /** When aborted (e.g. capability budget exceeded), lane subprocess receives SIGTERM. */
  signal?: AbortSignal;
};

export type LaneAdapter = {
  laneId: "eve" | "hermes";
  dispatch(input: LaneDispatchInput): Promise<DispatchState>;
};
