import { createHubAuthorizationService, HubAuthorizationError, hubRoles, type HubAuthorizationContext, type HubRole } from "../auth/index.js";

type TailscaleHeaderRequest = Readonly<{
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}>;

type Grant = Readonly<{
  subject?: string;
  roles: readonly HubRole[];
}>;

type HeaderAuthOptions = Readonly<{
  appCapability: string;
}>;

export function authorizeTailscaleServeRequest(request: TailscaleHeaderRequest, options: HeaderAuthOptions): HubAuthorizationContext {
  const login = optionalHeader(request.headers["tailscale-user-login"]);
  const grants = capabilityGrants(singleHeader(request.headers["tailscale-app-capabilities"], "Tailscale-App-Capabilities"), options.appCapability);
  const actorId = actorIdFor(login, grants);
  const roles = rolesFor(actorId, login, grants);
  return createHubAuthorizationService({
    actorRoles: { [actorId]: roles },
    capabilityNamespaces: [options.appCapability]
  }).authorize({ actorId, kind: actorId.startsWith("node:") ? "node" : "user", ...(actorId.startsWith("node:") ? { nodeId: actorId.slice(5) } : {}), appCapabilities: [] });
}

function singleHeader(value: string | readonly string[] | undefined, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value)) throw new HubAuthorizationError(`${name} must be a single header`);
  throw new HubAuthorizationError(`${name} is required`);
}

function optionalHeader(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new HubAuthorizationError("Tailscale-User-Login must be a single non-empty header when present");
}

function capabilityGrants(value: string, appCapability: string): Grant[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new HubAuthorizationError("Tailscale-App-Capabilities must be JSON");
  }
  if (!isRecord(parsed) || !Object.hasOwn(parsed, appCapability) || Object.keys(parsed).length !== 1) {
    throw new HubAuthorizationError("Tailscale-App-Capabilities must contain exactly the configured Hub capability");
  }
  const grants = parsed[appCapability];
  if (!Array.isArray(grants) || grants.length === 0) throw new HubAuthorizationError("Hub capability grants are required");
  return grants.map(parseGrant);
}

function parseGrant(value: unknown): Grant {
  if (!isRecord(value)) throw new HubAuthorizationError("Hub capability grant must be an object");
  const keys = Object.keys(value);
  if (!keys.every((key) => key === "subject" || key === "roles")) throw new HubAuthorizationError("Hub capability grant fields are invalid");
  const subject = value.subject;
  if (subject !== undefined && (typeof subject !== "string" || !/^node:[^\s:][^\s]*$|^user:[^\s:][^\s]*$/.test(subject))) {
    throw new HubAuthorizationError("Hub capability subject is invalid");
  }
  if (!Array.isArray(value.roles) || value.roles.length === 0 || !value.roles.every(isHubRole)) {
    throw new HubAuthorizationError("Hub capability roles are invalid");
  }
  return { ...(subject === undefined ? {} : { subject }), roles: [...new Set(value.roles)] };
}

function actorIdFor(login: string | undefined, grants: readonly Grant[]): string {
  if (login !== undefined) {
    if (login.startsWith("tag:")) throw new HubAuthorizationError("Tagged device login headers are not trusted actor identity");
    return `user:${login}`;
  }
  const subjects = [...new Set(grants.map((grant) => grant.subject).filter((subject): subject is string => subject !== undefined))];
  if (subjects.length !== 1 || !subjects[0]!.startsWith("node:")) throw new HubAuthorizationError("Tagged agents require exactly one node subject");
  if (grants.some((grant) => grant.subject !== subjects[0])) throw new HubAuthorizationError("Tagged agent grants must use one identical subject");
  return subjects[0]!;
}

function rolesFor(actorId: string, login: string | undefined, grants: readonly Grant[]): HubRole[] {
  const relevant = grants.filter((grant) => {
    if (actorId.startsWith("node:")) return grant.subject === actorId;
    return grant.subject === undefined || grant.subject === actorId || grant.subject === `user:${login}`;
  });
  if (login !== undefined && grants.some((grant) => grant.subject !== undefined && grant.subject !== actorId)) {
    throw new HubAuthorizationError("Human grants must be unscoped or match the login actor");
  }
  if (relevant.length === 0) throw new HubAuthorizationError("Hub capability grants do not authorize this actor");
  const roleSets = relevant.map((grant) => grant.roles.join("\0"));
  if (new Set(roleSets).size !== 1) throw new HubAuthorizationError("Hub capability role grants conflict");
  return [...relevant[0]!.roles];
}

function isHubRole(value: unknown): value is HubRole {
  return typeof value === "string" && hubRoles.includes(value as HubRole);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
