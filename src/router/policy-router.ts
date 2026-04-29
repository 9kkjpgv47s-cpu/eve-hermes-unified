import type { FailureClass, LaneId, RoutingDecision, UnifiedMessageEnvelope } from "../contracts/types.js";
import { validateRoutingDecision } from "../contracts/validate.js";

export type RouterCutoverStage = "shadow" | "canary" | "majority" | "full";

export type RouterPolicyConfig = {
  defaultPrimary: LaneId;
  defaultFallback: LaneId | "none";
  failClosed: boolean;
  policyVersion: string;
  /**
   * When primary fails with one of these failure classes, skip fallback even if a fallback lane exists.
   * Does not override failClosed or fallbackLane "none".
   */
  noFallbackOnFailureClasses?: FailureClass[];
  /** When set, these chats use Hermes as primary without enabling full cutover staging. */
  hermesPrimaryChatIds?: string[];
  /** When envelope.regionId matches this label, swap primary/fallback (failover drill). Ignored if fallback is none. */
  standbyRegion?: string;
  cutoverStage?: RouterCutoverStage;
  canaryChatIds?: string[];
  majorityPercent?: number;
  hashSalt?: string;
  /**
   * When primary dispatch fails with one of these failure classes, do not invoke the fallback lane
   * (same outcome as failClosed for that request). Empty = disabled.
   */
  noFallbackOnPrimaryFailureClasses?: FailureClass[];
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

function swapLanesForStandby(
  primary: LaneId,
  fallback: LaneId | "none",
): { primaryLane: LaneId; fallbackLane: LaneId | "none" } {
  if (fallback === "none") {
    return { primaryLane: primary, fallbackLane: "none" };
  }
  return { primaryLane: fallback, fallbackLane: primary };
}

function applyStandbyRegionSwap(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
  route: Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason">,
): Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason"> {
  const standby = config.standbyRegion?.trim();
  const region = envelope.regionId?.trim();
  if (!standby || !region || standby !== region || route.fallbackLane === "none") {
    return route;
  }
  const swapped = swapLanesForStandby(route.primaryLane, route.fallbackLane);
  return {
    ...route,
    primaryLane: swapped.primaryLane,
    fallbackLane: swapped.fallbackLane,
    reason: `${route.reason}:standby_region_swap`,
  };
}

function resolveRoutingLanes(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
): Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason"> {
  const text = envelope.text.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("@cursor ")) {
    return applyStandbyRegionSwap(envelope, config, {
      primaryLane: "eve",
      fallbackLane: config.defaultFallback,
      reason: "explicit_cursor_passthrough",
    });
  }
  if (lower.startsWith("@hermes ")) {
    return applyStandbyRegionSwap(envelope, config, {
      primaryLane: "hermes",
      fallbackLane: config.defaultFallback,
      reason: "explicit_hermes_passthrough",
    });
  }

  const hermesPrimaryChats = normalizeChatIds(config.hermesPrimaryChatIds);
  if (hermesPrimaryChats.has(envelope.chatId)) {
    return applyStandbyRegionSwap(envelope, config, {
      primaryLane: "hermes",
      fallbackLane: config.defaultFallback,
      reason: "router_hermes_primary_allowlist",
    });
  }

  if (config.cutoverStage) {
    const stagedDefaultRoute = defaultRouteForStage(envelope, config);
    return applyStandbyRegionSwap(envelope, config, stagedDefaultRoute);
  }

  return applyStandbyRegionSwap(envelope, config, {
    primaryLane: config.defaultPrimary,
    fallbackLane: config.defaultFallback,
    reason: "default_policy_lane",
  });
}

export function routeMessage(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
): RoutingDecision {
  const lanes = resolveRoutingLanes(envelope, config);
  return validateRoutingDecision({
    primaryLane: lanes.primaryLane,
    fallbackLane: lanes.fallbackLane,
    reason: lanes.reason,
    policyVersion: config.policyVersion,
    failClosed: config.failClosed,
  });
}
