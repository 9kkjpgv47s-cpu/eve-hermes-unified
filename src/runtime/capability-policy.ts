export type CapabilityPolicyConfig = {
  defaultMode: "allow" | "deny";
  allowCapabilities: string[];
  denyCapabilities: string[];
  allowedChatIds: string[];
  deniedChatIds: string[];
};

export type CapabilityPolicy = {
  authorize(input: {
    capabilityId: string;
    lane: "eve" | "hermes";
    chatId: string;
  }): CapabilityPolicyDecision;
};

export type CapabilityPolicyDecision = {
  allowed: boolean;
  reason: string;
};

function normalizeCapabilityId(value: string): string {
  return value.trim().toLowerCase();
}

function parseCsvSet(raw: string | undefined): Set<string> | undefined {
  if (!raw) {
    return undefined;
  }
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    return undefined;
  }
  return new Set(values);
}

export function parseCapabilityChatAllowlists(
  raw: string | undefined,
): Record<string, Set<string>> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const mapping: Record<string, Set<string>> = {};
  const rules = raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const rule of rules) {
    const separator = rule.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const id = normalizeCapabilityId(rule.slice(0, separator));
    const chats = parseCsvSet(rule.slice(separator + 1));
    if (!id || !chats) {
      continue;
    }
    mapping[id] = chats;
  }
  return mapping;
}

export function createCapabilityPolicyConfigFromEnv(input: {
  defaultModeRaw: string | undefined;
  allowCapabilitiesRaw: string | undefined;
  denyCapabilitiesRaw: string | undefined;
  allowedChatIdsRaw: string | undefined;
  deniedChatIdsRaw: string | undefined;
}): CapabilityPolicyConfig {
  const defaultMode = input.defaultModeRaw?.trim().toLowerCase() === "deny" ? "deny" : "allow";
  const allowCapabilities = [...(parseCsvSet(input.allowCapabilitiesRaw) ?? [])].map((item) =>
    normalizeCapabilityId(item),
  );
  const denyCapabilities = [...(parseCsvSet(input.denyCapabilitiesRaw) ?? [])].map((item) =>
    normalizeCapabilityId(item),
  );
  const allowedChatIds = [...(parseCsvSet(input.allowedChatIdsRaw) ?? [])];
  const deniedChatIds = [...(parseCsvSet(input.deniedChatIdsRaw) ?? [])];
  return {
    defaultMode,
    allowCapabilities,
    denyCapabilities,
    allowedChatIds,
    deniedChatIds,
  };
}

export function createCapabilityPolicy(config: CapabilityPolicyConfig): CapabilityPolicy {
  const allowCapabilities = new Set(config.allowCapabilities.map((item) => normalizeCapabilityId(item)));
  const denyCapabilities = new Set(config.denyCapabilities.map((item) => normalizeCapabilityId(item)));
  const allowedChats = new Set(config.allowedChatIds.map((item) => item.trim()).filter(Boolean));
  const deniedChats = new Set(config.deniedChatIds.map((item) => item.trim()).filter(Boolean));

  return {
    authorize(input): CapabilityPolicyDecision {
      const capabilityId = normalizeCapabilityId(input.capabilityId);

      if (deniedChats.has(input.chatId)) {
        return { allowed: false, reason: "chat_denied_by_policy" };
      }
      if (denyCapabilities.has(capabilityId)) {
        return { allowed: false, reason: "capability_denied_by_policy" };
      }

      if (config.defaultMode === "deny") {
        const allowedByCapability = allowCapabilities.has(capabilityId);
        const allowedByChat = allowedChats.size === 0 || allowedChats.has(input.chatId);
        if (!allowedByCapability || !allowedByChat) {
          return { allowed: false, reason: "capability_policy_denied" };
        }
        return { allowed: true, reason: "capability_policy_allowlisted" };
      }

      if (allowedChats.size > 0 && !allowedChats.has(input.chatId)) {
        return { allowed: false, reason: "chat_not_allowlisted" };
      }
      return { allowed: true, reason: "allowed_by_default_policy" };
    },
  };
}

export function buildCapabilityPolicyFromConfig(config: CapabilityPolicyConfig): CapabilityPolicy {
  return createCapabilityPolicy(config);
}

export function evaluateCapabilityPolicy(
  config: CapabilityPolicyConfig,
  capabilityId: string,
  chatId: string,
): CapabilityPolicyDecision {
  return createCapabilityPolicy(config).authorize({
    capabilityId,
    chatId,
    lane: "eve",
  });
}
