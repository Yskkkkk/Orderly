export type MoneyParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

export function parseYuanToCents(input: string): MoneyParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "金额不能为空" };

  const normalized = raw.replace(/,/g, "");
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!m) return { ok: false, error: "金额格式不正确（示例：1234 或 1234.56）" };

  const sign = m[1] ? -1 : 1;
  const intPart = m[2] ?? "0";
  const decPart = m[3] ?? "";

  const yuan = Number(intPart);
  if (!Number.isFinite(yuan)) return { ok: false, error: "金额过大" };

  let cents = yuan * 100;
  if (decPart.length === 1) cents += Number(decPart) * 10;
  else if (decPart.length === 2) cents += Number(decPart);

  return { ok: true, cents: cents * sign };
}

export function formatCentsToYuan(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const dec = abs % 100;
  return `${sign}${yuan}.${dec.toString().padStart(2, "0")}`;
}

