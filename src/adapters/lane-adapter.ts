import type { DispatchState, UnifiedMessageEnvelope } from "../contracts/types.js";

export type LaneDispatchInput = {
  envelope: UnifiedMessageEnvelope;
  intentRoute: string;
  /** When aborted, lane subprocess receives SIGTERM (cooperative cancel). */
  signal?: AbortSignal;
};

export type LaneAdapter = {
  laneId: "eve" | "hermes";
  dispatch(input: LaneDispatchInput): Promise<DispatchState>;
};
