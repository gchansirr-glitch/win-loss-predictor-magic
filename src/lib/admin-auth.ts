const ADMIN_USERNAMES = new Set(["one_percent_trader_1", "thetpyinn7"]);
const ADMIN_IDS = new Set(["5471930058", "7147520184"]);

export function isAuthorizedAdmin(telegramId: unknown, username: unknown): boolean {
  const id = String(telegramId ?? "").trim();
  const name = String(username ?? "").trim().replace(/^@/, "").toLowerCase();
  return ADMIN_IDS.has(id) || ADMIN_USERNAMES.has(name);
}
