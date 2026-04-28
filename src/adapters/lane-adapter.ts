import type { DispatchState, UnifiedMessageEnvelope } from "../contracts/types.js";

export type LaneDispatchInput = {
  envelope: UnifiedMessageEnvelope;
  intentRoute: string;
  /** Capability ids from the unified registry exposed to this lane (Phase 4). */
  capabilityIds?: readonly string[];
  /** Serialized working-set keys for this chat (Phase 3); lanes may ignore until wired. */
  memorySnapshot?: Record<string, string>;
};

export type LaneAdapter = {
  laneId: "eve" | "hermes";
  dispatch(input: LaneDispatchInput): Promise<DispatchState>;
};
