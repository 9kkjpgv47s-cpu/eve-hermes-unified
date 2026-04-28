import type { FailureClass, LaneId, RoutingDecision, UnifiedMessageEnvelope } from "../contracts/types.js";
import { validateRoutingDecision } from "../contracts/validate.js";

export type RouterCutoverStage = "shadow" | "canary" | "majority" | "full";

export type RouterPolicyConfig = {
  defaultPrimary: LaneId;
  defaultFallback: LaneId | "none";
  failClosed: boolean;
  policyVersion: string;
  /**
   * When non-empty, only these primary `DispatchState.failureClass` values may trigger automatic fallback.
   * When empty/omitted, any primary failure may trigger fallback (subject to `failClosed` and `fallbackLane`).
   */
  dispatchFailureClassesAllowingFallback?: FailureClass[];
  cutoverStage?: RouterCutoverStage;
  canaryChatIds?: string[];
  majorityPercent?: number;
  hashSalt?: string;
  /** H5: home region for the router instance; used with envelope.regionId for alignment. */
  routerRegionId?: string;
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

export function mergeRegionRouting(
  envelope: UnifiedMessageEnvelope,
  config: RouterPolicyConfig,
  base: RoutingDecision,
): RoutingDecision {
  const dispatchRegionId = envelope.regionId?.trim();
  const routerRegionId = config.routerRegionId?.trim();
  const regionAligned =
    !dispatchRegionId || !routerRegionId || dispatchRegionId === routerRegionId;
  return validateRoutingDecision({
    ...base,
    dispatchRegionId: dispatchRegionId || undefined,
    routerRegionId: routerRegionId || undefined,
    regionAligned,
  });
}

function swapLanesForRegionFailover(
  base: Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason">,
): Pick<RoutingDecision, "primaryLane" | "fallbackLane" | "reason"> {
  const { primaryLane, fallbackLane } = base;
  if (fallbackLane === "none" || primaryLane === fallbackLane) {
    return { ...base, reason: `${base.reason}_region_misaligned_no_swap` };
  }
  return {
    primaryLane: fallbackLane,
    fallbackLane: primaryLane,
    reason: `${base.reason}_region_failover_swap`,
  };
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

  const regionMisaligned = Boolean(
    envelope.regionId?.trim() &&
      config.routerRegionId?.trim() &&
      envelope.regionId.trim() !== config.routerRegionId.trim(),
  );

  // Explicit lane commands take priority and are message-local.
  if (lower.startsWith("@cursor ")) {
    const lanes = regionMisaligned
      ? swapLanesForRegionFailover({
          primaryLane: "eve",
          fallbackLane: config.defaultFallback,
          reason: "explicit_cursor_passthrough",
        })
      : { primaryLane: "eve" as const, fallbackLane: config.defaultFallback, reason: "explicit_cursor_passthrough" };
    return mergeRegionRouting(
      envelope,
      config,
      validateRoutingDecision({
        primaryLane: lanes.primaryLane,
        fallbackLane: lanes.fallbackLane,
        reason: lanes.reason,
        policyVersion: config.policyVersion,
        failClosed: config.failClosed,
      }),
    );
  }
  if (lower.startsWith("@hermes ")) {
    const lanes = regionMisaligned
      ? swapLanesForRegionFailover({
          primaryLane: "hermes",
          fallbackLane: config.defaultFallback,
          reason: "explicit_hermes_passthrough",
        })
      : { primaryLane: "hermes" as const, fallbackLane: config.defaultFallback, reason: "explicit_hermes_passthrough" };
    return mergeRegionRouting(
      envelope,
      config,
      validateRoutingDecision({
        primaryLane: lanes.primaryLane,
        fallbackLane: lanes.fallbackLane,
        reason: lanes.reason,
        policyVersion: config.policyVersion,
        failClosed: config.failClosed,
      }),
    );
  }

  // Default policy lane ownership can be stage-aware for cutover.
  if (config.cutoverStage) {
    const stagedDefaultRoute = defaultRouteForStage(envelope, config);
    const lanes = regionMisaligned ? swapLanesForRegionFailover(stagedDefaultRoute) : stagedDefaultRoute;
    return mergeRegionRouting(
      envelope,
      config,
      validateRoutingDecision({
        primaryLane: lanes.primaryLane,
        fallbackLane: lanes.fallbackLane,
        reason: lanes.reason,
        policyVersion: config.policyVersion,
        failClosed: config.failClosed,
      }),
    );
  }

  const defaultLanes = regionMisaligned
    ? swapLanesForRegionFailover({
        primaryLane: config.defaultPrimary,
        fallbackLane: config.defaultFallback,
        reason: "default_policy_lane",
      })
    : {
        primaryLane: config.defaultPrimary,
        fallbackLane: config.defaultFallback,
        reason: "default_policy_lane",
      };
  return mergeRegionRouting(
    envelope,
    config,
    validateRoutingDecision({
      primaryLane: defaultLanes.primaryLane,
      fallbackLane: defaultLanes.fallbackLane,
      reason: defaultLanes.reason,
      policyVersion: config.policyVersion,
      failClosed: config.failClosed,
    }),
  );
}
