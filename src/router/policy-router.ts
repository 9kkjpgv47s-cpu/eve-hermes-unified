import type {
  FailureClass,
  LaneId,
  RoutingDecision,
  UnifiedMessageEnvelope,
} from "../contracts/types.js";
import { validateRoutingDecision } from "../contracts/validate.js";

export type RouterCutoverStage = "shadow" | "canary" | "majority" | "full";

export type RouterPolicyConfig = {
  defaultPrimary: LaneId;
  defaultFallback: LaneId | "none";
  failClosed: boolean;
  policyVersion: string;
  cutoverStage?: RouterCutoverStage;
  canaryChatIds?: string[];
  majorityPercent?: number;
  hashSalt?: string;
  /**
   * When set, only these primary-lane failure classes may trigger automatic fallback
   * (when failClosed=false and fallbackLane is not "none"). When unset, any primary
   * failure may trigger fallback (legacy behavior).
   */
  dispatchFailureClassesAllowingFallback?: FailureClass[];
};

function normalizeCutoverStage(value: RouterCutoverStage | undefined): RouterCutoverStage {
  return value ?? "shadow";
}

function normalizeChatIds(values: string[] | undefined): Set<string> {
  if (!values) {
    return new Set();
  }
  return new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function normalizeMajorityPercent(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function stableBucketFromChatId(chatId: string, hashSalt: string | undefined): number {
  const source = `${hashSalt ?? ""}:${chatId}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
}

function defaultRouteForStage(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
): Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason"> {
  const stage = normalizeCutoverStage(config.cutoverStage);
  if (stage === "shadow") {
    return {
      primaryLane: config.defaultPrimary,
      fallbackLane: config.defaultFallback,
      reason: "stage_shadow_default_primary",
    };
  }
  if (stage === "full") {
    return {
      primaryLane: "hermes",
      fallbackLane: config.defaultFallback,
      reason: "stage_full_force_hermes",
    };
  }

  if (stage === "canary") {
    const canaryChats = normalizeChatIds(config.canaryChatIds);
    if (canaryChats.has(envelope.chatId)) {
      return {
        primaryLane: "hermes",
        fallbackLane: config.defaultFallback,
        reason: "stage_canary_allowlist",
      };
    }
    return {
      primaryLane: config.defaultPrimary,
      fallbackLane: config.defaultFallback,
      reason: "stage_canary_default_primary",
    };
  }

  const percent = normalizeMajorityPercent(config.majorityPercent);
  const bucket = stableBucketFromChatId(envelope.chatId, config.hashSalt);
  if (bucket < percent) {
    return {
      primaryLane: "hermes",
      fallbackLane: config.defaultFallback,
      reason: "stage_majority_weighted",
    };
  }
  return {
    primaryLane: config.defaultPrimary,
    fallbackLane: config.defaultFallback,
    reason: "stage_majority_default_primary",
  };
}

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

  // Default policy lane ownership can be stage-aware for cutover.
  if (config.cutoverStage) {
    const stagedDefaultRoute = defaultRouteForStage(envelope, config);
    return validateRoutingDecision({
      primaryLane: stagedDefaultRoute.primaryLane,
      fallbackLane: stagedDefaultRoute.fallbackLane,
      reason: stagedDefaultRoute.reason,
      policyVersion: config.policyVersion,
      failClosed: config.failClosed,
    });
  }

  return validateRoutingDecision({
    primaryLane: config.defaultPrimary,
    fallbackLane: config.defaultFallback,
    reason: "default_policy_lane",
    policyVersion: config.policyVersion,
    failClosed: config.failClosed,
  });
}
