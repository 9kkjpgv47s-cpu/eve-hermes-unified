import type { DispatchState, UnifiedMessageEnvelope } from "../contracts/types.js";

export type LaneDispatchInput = {
  envelope: UnifiedMessageEnvelope;
  intentRoute: string;
};

export type LaneAdapter = {
  laneId: "eve" | "hermes";
  dispatch(input: LaneDispatchInput): Promise<DispatchState>;
};
