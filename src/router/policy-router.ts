import type { LaneId, RoutingDecision, UnifiedMessageEnvelope } from "../contracts/types.js";
import { validateRoutingDecision } from "../contracts/validate.js";

export type RouterPolicyConfig = {
  defaultPrimary: LaneId;
  defaultFallback: LaneId | "none";
  failClosed: boolean;
  policyVersion: string;
};

export function routeMessage(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
): RoutingDecision {
  const text = envelope.text.trim();
  const lower = text.toLowerCase();

  // Explicit lane commands take priority and are message-local.
  if (lower.startsWith("@cursor ")) {
    return validateRoutingDecision({
      primaryLane: "eve",
      fallbackLane: config.defaultFallback,
      reason: "explicit_cursor_passthrough",
      policyVersion: config.policyVersion,
      failClosed: config.failClosed,
    });
  }
  if (lower.startsWith("@hermes ")) {
    return validateRoutingDecision({
      primaryLane: "hermes",
      fallbackLane: config.defaultFallback,
      reason: "explicit_hermes_passthrough",
      policyVersion: config.policyVersion,
      failClosed: config.failClosed,
    });
  }

  // Default policy lane ownership.
  return validateRoutingDecision({
    primaryLane: config.defaultPrimary,
    fallbackLane: config.defaultFallback,
    reason: "default_policy_lane",
    policyVersion: config.policyVersion,
    failClosed: config.failClosed,
  });
}
