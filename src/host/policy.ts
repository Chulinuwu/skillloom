export function loginNameFromTailscaleStatus(stdout: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.Self) || !isRecord(value.User)) return null;
  const userId = value.Self.UserID;
  if (typeof userId !== "string" && typeof userId !== "number") return null;
  const user = value.User[String(userId)];
  if (!isRecord(user) || typeof user.LoginName !== "string") return null;
  const loginName = user.LoginName.trim();
  return loginName.length > 0 && !/[\u0000-\u001f\u007f]/u.test(loginName) ? loginName : null;
}

export function personalPolicyFragment(loginName: string): string {
  const source = JSON.stringify(loginName);
  const subject = JSON.stringify(`user:${loginName}`);
  return [
    "// Merge the entry below into the existing top-level grants array.",
    "// Do not replace the rest of the tailnet policy with this fragment.",
    "{",
    "  grants: [",
    "    {",
    `      src: [${source}],`,
    '      dst: ["autogroup:self"],',
    '      ip: ["tcp:443", "tcp:8443"],',
    "      app: {",
    '        "skillloom.io/cap/skillloom": [',
    "          {",
    `            subject: ${subject},`,
    '            roles: ["reader", "contributor", "promoter"],',
    "          },",
    "        ],",
    "      },",
    "    },",
    "  ],",
    "}",
    ""
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
