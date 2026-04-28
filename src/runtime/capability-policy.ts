export type CapabilityPolicyConfig = {
  defaultMode: "allow" | "deny";
  allowCapabilities: string[];
  denyCapabilities: string[];
  allowedChatIds: string[];
  deniedChatIds: string[];
  allowCapabilityChats: Record<string, string[]>;
  denyCapabilityChats: Record<string, string[]>;
  /** H5: tenant -> allowlisted chat ids (empty value = no restriction for that tenant). */
  allowChatIdsByTenant: Record<string, string[]>;
  /** H5: tenant -> denylisted chat ids. */
  denyChatIdsByTenant: Record<string, string[]>;
};

export type CapabilityPolicy = {
  authorize(input: {
    capabilityId: string;
    lane: "eve" | "hermes";
    chatId: string;
    tenantId?: string;
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

export function parseCapabilityChatMaps(raw: string | undefined): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(parseCapabilityChatAllowlists(raw)).map(([capabilityId, chats]) => [
      capabilityId,
      [...chats.values()],
    ]),
  );
}

function normalizeTenantId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseTenantChatMap(raw: string | undefined): Record<string, Set<string>> {
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
    const tenant = rule.slice(0, separator).trim();
    const chats = parseCsvSet(rule.slice(separator + 1));
    if (!tenant || !chats) {
      continue;
    }
    mapping[tenant] = chats;
  }
  return mapping;
}

export function parseTenantChatMaps(raw: string | undefined): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(parseTenantChatMap(raw)).map(([tenant, chats]) => [tenant, [...chats.values()]]),
  );
}

export function createCapabilityPolicyConfigFromEnv(input: {
  defaultModeRaw: string | undefined;
  allowCapabilitiesRaw: string | undefined;
  denyCapabilitiesRaw: string | undefined;
  allowedChatIdsRaw: string | undefined;
  deniedChatIdsRaw: string | undefined;
  allowCapabilityChatsRaw: string | undefined;
  denyCapabilityChatsRaw: string | undefined;
  allowChatIdsByTenantRaw: string | undefined;
  denyChatIdsByTenantRaw: string | undefined;
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
  const allowCapabilityChats = Object.fromEntries(
    Object.entries(parseCapabilityChatAllowlists(input.allowCapabilityChatsRaw)).map(
      ([capabilityId, chatIds]) => [capabilityId, [...chatIds.values()]],
    ),
  );
  const denyCapabilityChats = Object.fromEntries(
    Object.entries(parseCapabilityChatAllowlists(input.denyCapabilityChatsRaw)).map(
      ([capabilityId, chatIds]) => [capabilityId, [...chatIds.values()]],
    ),
  );
  const allowChatIdsByTenant = parseTenantChatMaps(input.allowChatIdsByTenantRaw);
  const denyChatIdsByTenant = parseTenantChatMaps(input.denyChatIdsByTenantRaw);
  return {
    defaultMode,
    allowCapabilities,
    denyCapabilities,
    allowedChatIds,
    deniedChatIds,
    allowCapabilityChats,
    denyCapabilityChats,
    allowChatIdsByTenant,
    denyChatIdsByTenant,
  };
}

export function createCapabilityPolicy(config: CapabilityPolicyConfig): CapabilityPolicy {
  const allowCapabilities = new Set(config.allowCapabilities.map((item) => normalizeCapabilityId(item)));
  const denyCapabilities = new Set(config.denyCapabilities.map((item) => normalizeCapabilityId(item)));
  const allowedChats = new Set(config.allowedChatIds.map((item) => item.trim()).filter(Boolean));
  const deniedChats = new Set(config.deniedChatIds.map((item) => item.trim()).filter(Boolean));
  const allowCapabilityChats = new Map<string, Set<string>>(
    Object.entries(config.allowCapabilityChats).map(([capabilityId, chats]) => [
      normalizeCapabilityId(capabilityId),
      new Set(chats.map((chatId) => chatId.trim()).filter(Boolean)),
    ]),
  );
  const denyCapabilityChats = new Map<string, Set<string>>(
    Object.entries(config.denyCapabilityChats).map(([capabilityId, chats]) => [
      normalizeCapabilityId(capabilityId),
      new Set(chats.map((chatId) => chatId.trim()).filter(Boolean)),
    ]),
  );
  const allowChatsByTenant = new Map<string, Set<string>>(
    Object.entries(config.allowChatIdsByTenant).map(([tenant, chats]) => [
      tenant.trim(),
      new Set(chats.map((chatId) => chatId.trim()).filter(Boolean)),
    ]),
  );
  const denyChatsByTenant = new Map<string, Set<string>>(
    Object.entries(config.denyChatIdsByTenant).map(([tenant, chats]) => [
      tenant.trim(),
      new Set(chats.map((chatId) => chatId.trim()).filter(Boolean)),
    ]),
  );

  return {
    authorize(input): CapabilityPolicyDecision {
      const capabilityId = normalizeCapabilityId(input.capabilityId);
      const tenantId = normalizeTenantId(input.tenantId);

      if (tenantId) {
        const tenantDenied = denyChatsByTenant.get(tenantId);
        if (tenantDenied?.has(input.chatId)) {
          return { allowed: false, reason: "chat_denied_by_tenant_policy" };
        }
        const tenantAllowed = allowChatsByTenant.get(tenantId);
        if (tenantAllowed && tenantAllowed.size > 0 && !tenantAllowed.has(input.chatId)) {
          return { allowed: false, reason: "chat_not_in_tenant_allowlist" };
        }
      }

      if (deniedChats.has(input.chatId)) {
        return { allowed: false, reason: "chat_denied_by_policy" };
      }
      const deniedCapabilityChats = denyCapabilityChats.get(capabilityId);
      if (deniedCapabilityChats?.has(input.chatId)) {
        return { allowed: false, reason: "capability_chat_denied_by_policy" };
      }
      if (denyCapabilities.has(capabilityId)) {
        return { allowed: false, reason: "capability_denied_by_policy" };
      }
      const allowedCapabilityChats = allowCapabilityChats.get(capabilityId);
      if (allowedCapabilityChats && !allowedCapabilityChats.has(input.chatId)) {
        return { allowed: false, reason: "chat_not_in_capability_allowlist" };
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
  tenantId?: string,
): CapabilityPolicyDecision {
  return createCapabilityPolicy(config).authorize({
    capabilityId,
    chatId,
    lane: "eve",
    tenantId,
  });
}
