type OrdersListFilters = {
  q?: string | null;
  status?: string | null;
  createdFromMs?: number | null;
  createdToMs?: number | null;
  updatedFromMs?: number | null;
  updatedToMs?: number | null;
  archiveMonth?: string | null;
  limit?: number | null;
  offset?: number | null;
  deletedMode?: "active" | "deleted" | "all" | null;
};

type OrderListItem = {
  id: string;
  systemName: string;
  wechat: string;
  username: string;
  repoUrl: string;
  requirementPath: string;
  status: "pending_send" | "done" | "canceled";
  techStack: string;
  deliverables: string;
  note: string;
  archiveMonth: string | null;
  totalBaseCents: number;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
  totalCurrentCents: number;
  paidSumCents: number;
  depositSumCents: number;
  outstandingCents: number;
};

type OrderCreatePayload = {
  systemName: string;
  wechat: string;
  username: string;
  repoUrl: string;
  requirementPath?: string | null;
  status?: OrderListItem["status"] | null;
  techStack?: string | null;
  deliverables?: string | null;
  note?: string | null;
  archiveMonth?: string | null;
  totalBaseCents: number;
};

type OrderPatch = Partial<OrderCreatePayload> & { totalBaseCents?: number };

type ArchiveMonthOverviewItem = {
  month: string;
  orderCount: number;
  paidSumCents: number;
};

type MonthlyIncomeSummary = {
  month: string;
  archivedOrders: number;
  paidSumCents: number;
  depositSumCents: number;
  outstandingSumCents: number;
};

type PaymentType = "deposit" | "final" | "other";

type PaymentRecord = {
  id: string;
  orderId: string;
  amountCents: number;
  type: PaymentType;
  paidAtMs: number;
  note: string;
  createdAtMs: number;
};

type PaymentCreatePayload = {
  amountCents: number;
  type: PaymentType;
  paidAtMs: number;
  note?: string | null;
};

type PaymentPatch = Partial<PaymentCreatePayload>;

type AmountAdjustmentRecord = {
  id: string;
  orderId: string;
  deltaCents: number;
  reason: string;
  atMs: number;
  createdAtMs: number;
};

type AmountAdjustmentCreatePayload = {
  deltaCents: number;
  reason?: string | null;
  atMs: number;
};

type MockPersistedStateV1 = {
  v: 1;
  orders: OrderListItem[];
  paymentsByOrder: Record<string, PaymentRecord[]>;
  adjustmentsByOrder: Record<string, AmountAdjustmentRecord[]>;
};

type UiPrefGetInput = {
  userKey: string;
  pageKey: string;
  prefKey: string;
};

type UiPrefSetInput = UiPrefGetInput & {
  prefValue: string;
};

type UiPrefGetOutput = {
  prefValue: string | null;
  updatedAtMs: number | null;
};

const MOCK_PERSIST_KEY = "orderly_mock_state_v1";
const MOCK_PERSIST_ENABLED_KEY = "orderly_mock_persist_enabled";
const UI_PREFS_KEY = "orderly_ui_preferences_v1";

type UiPrefStore = Record<string, { prefValue: string; updatedAtMs: number }>;

function getMockPersistEnabled(): boolean {
  try {
    const v = localStorage.getItem(MOCK_PERSIST_ENABLED_KEY);
    if (v == null) return true;
    return v !== "0";
  } catch {
    return false;
  }
}

function setMockPersistEnabled(enabled: boolean) {
  try {
    localStorage.setItem(MOCK_PERSIST_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

function saveMockState() {
  if (!getMockPersistEnabled()) return;
  try {
    const state: MockPersistedStateV1 = {
      v: 1,
      orders,
      paymentsByOrder,
      adjustmentsByOrder,
    };
    localStorage.setItem(MOCK_PERSIST_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadMockState(): MockPersistedStateV1 | null {
  if (!getMockPersistEnabled()) return null;
  try {
    const raw = localStorage.getItem(MOCK_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockPersistedStateV1>;
    if (parsed?.v !== 1) return null;
    if (!Array.isArray(parsed.orders)) return null;
    if (!parsed.paymentsByOrder || typeof parsed.paymentsByOrder !== "object") return null;
    if (!parsed.adjustmentsByOrder || typeof parsed.adjustmentsByOrder !== "object") return null;
    const normalizedOrders = parsed.orders.map((o) => ({
      ...o,
      requirementPath: (o as any).requirementPath ?? "",
      archiveMonth: normalizeArchiveMonth((o as any).archiveMonth ?? null),
      deletedAtMs: (o as any).deletedAtMs ?? null,
    })) as OrderListItem[];
    return {
      v: 1,
      orders: normalizedOrders,
      paymentsByOrder: parsed.paymentsByOrder as Record<string, PaymentRecord[]>,
      adjustmentsByOrder: parsed.adjustmentsByOrder as Record<string, AmountAdjustmentRecord[]>,
    };
  } catch {
    return null;
  }
}

function uiPrefStoreKey(input: UiPrefGetInput): string {
  return `${input.userKey}\u0001${input.pageKey}\u0001${input.prefKey}`;
}

function loadUiPrefStore(): UiPrefStore {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as UiPrefStore;
  } catch {
    return {};
  }
}

function saveUiPrefStore(store: UiPrefStore) {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function uiPrefGet(input: UiPrefGetInput): UiPrefGetOutput {
  const store = loadUiPrefStore();
  const rec = store[uiPrefStoreKey(input)];
  if (!rec) {
    return { prefValue: null, updatedAtMs: null };
  }
  return {
    prefValue: String(rec.prefValue),
    updatedAtMs: Number.isFinite(rec.updatedAtMs) ? rec.updatedAtMs : null,
  };
}

function uiPrefSet(input: UiPrefSetInput): void {
  const store = loadUiPrefStore();
  store[uiPrefStoreKey(input)] = {
    prefValue: String(input.prefValue),
    updatedAtMs: nowMs(),
  };
  saveUiPrefStore(store);
}

const seedTime = new Date("2026-02-01T00:00:00Z").getTime();
const seedOrders: OrderListItem[] = [
  makeOrder({
    id: "demo-1",
    systemName: "示例系统 A",
    wechat: "wxid_demo_a",
    username: "张三",
    repoUrl: "https://github.com/example/demo-a",
    requirementPath: "",
    status: "pending_send",
    archiveMonth: null,
    createdAtMs: seedTime + 11 * 86400000,
    updatedAtMs: seedTime + 18 * 86400000,
    totalBaseCents: 199_900,
  }),
  makeOrder({
    id: "demo-2",
    systemName: "示例系统 B",
    wechat: "wxid_demo_b",
    username: "李四",
    repoUrl: "https://github.com/example/demo-b",
    requirementPath: "",
    status: "done",
    archiveMonth: null,
    createdAtMs: seedTime + 10 * 86400000,
    updatedAtMs: seedTime + 17 * 86400000,
    totalBaseCents: 88_800,
  }),
];

let orders: OrderListItem[] = [...seedOrders];
let paymentsByOrder: Record<string, PaymentRecord[]> = {};
let adjustmentsByOrder: Record<string, AmountAdjustmentRecord[]> = {};

const loaded = loadMockState();
if (loaded) {
  orders = backfillDoneOrderArchiveMonth(loaded.orders);
  paymentsByOrder = loaded.paymentsByOrder;
  adjustmentsByOrder = loaded.adjustmentsByOrder;
} else {
  orders = backfillDoneOrderArchiveMonth(orders);
  saveMockState();
}

function nowMs() {
  return Date.now();
}

function toMonthValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function backfillDoneOrderArchiveMonth(input: OrderListItem[]): OrderListItem[] {
  return input.map((o) => {
    if (o.status === "done" && !o.archiveMonth) {
      return { ...o, archiveMonth: toMonthValue(o.updatedAtMs) };
    }
    return o;
  });
}

function ensureOrderEditable(orderId: string) {
  const curr = orders.find((o) => o.id === orderId);
  if (!curr) throw new Error("order not found");
  if (curr.archiveMonth) throw new Error("ORDER_ARCHIVED_LOCKED: order is archived, unarchive first");
  return curr;
}

function normalizeArchiveMonth(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return null;
  return s;
}

function makeOrder(input: Partial<OrderListItem> & Pick<OrderListItem, "id" | "systemName" | "wechat" | "username" | "repoUrl" | "status">) {
  const createdAtMs = input.createdAtMs ?? nowMs();
  const updatedAtMs = input.updatedAtMs ?? createdAtMs;
  const totalBaseCents = input.totalBaseCents ?? 0;
  const totalCurrentCents = input.totalCurrentCents ?? totalBaseCents;
  const paidSumCents = input.paidSumCents ?? 0;
  const depositSumCents = input.depositSumCents ?? 0;
  const outstandingCents = input.outstandingCents ?? totalCurrentCents - paidSumCents;

  return {
    id: input.id,
    systemName: input.systemName,
    wechat: input.wechat,
    username: input.username,
    repoUrl: input.repoUrl,
    requirementPath: input.requirementPath ?? "",
    status: input.status,
    techStack: input.techStack ?? "",
    deliverables: input.deliverables ?? "",
    note: input.note ?? "",
    archiveMonth: normalizeArchiveMonth(input.archiveMonth),
    totalBaseCents,
    createdAtMs,
    updatedAtMs,
    deletedAtMs: input.deletedAtMs ?? null,
    totalCurrentCents,
    paidSumCents,
    depositSumCents,
    outstandingCents,
  } satisfies OrderListItem;
}

function recomputeOrder(o: OrderListItem): OrderListItem {
  const adj = adjustmentsByOrder[o.id] ?? [];
  const pay = paymentsByOrder[o.id] ?? [];
  const totalCurrentCents = o.totalBaseCents + adj.reduce((sum, a) => sum + a.deltaCents, 0);
  const paidSumCents = pay.reduce((sum, p) => sum + p.amountCents, 0);
  const depositSumCents = pay.filter((p) => p.type === "deposit").reduce((sum, p) => sum + p.amountCents, 0);
  const outstandingCents = totalCurrentCents - paidSumCents;
  return { ...o, totalCurrentCents, paidSumCents, depositSumCents, outstandingCents };
}

function touchOrder(orderId: string) {
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return;
  const curr = orders[idx]!;
  const updatedAtMs = nowMs();
  const next = recomputeOrder({ ...curr, updatedAtMs });
  orders = [next, ...orders.filter((o) => o.id !== orderId)];
  saveMockState();
}

function applyFilters(list: OrderListItem[], filters: OrdersListFilters): OrderListItem[] {
  let out = list.map((o) => recomputeOrder(o));
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    out = out.filter((o) => [o.systemName, o.wechat, o.username].some((v) => v.toLowerCase().includes(q)));
  }
  const status = (filters.status ?? "").trim();
  if (status) out = out.filter((o) => o.status === status);

  if (filters.createdFromMs != null) out = out.filter((o) => o.createdAtMs >= filters.createdFromMs!);
  if (filters.createdToMs != null) out = out.filter((o) => o.createdAtMs <= filters.createdToMs!);
  if (filters.updatedFromMs != null) out = out.filter((o) => o.updatedAtMs >= filters.updatedFromMs!);
  if (filters.updatedToMs != null) out = out.filter((o) => o.updatedAtMs <= filters.updatedToMs!);
  const archiveMonth = String(filters.archiveMonth ?? "").trim();
  if (archiveMonth) {
    if (archiveMonth === "__none__") {
      out = out.filter((o) => !o.archiveMonth);
    } else {
      out = out.filter((o) => o.archiveMonth === archiveMonth);
    }
  }
  const deletedMode = filters.deletedMode ?? "active";
  if (deletedMode === "active") out = out.filter((o) => o.deletedAtMs == null);
  if (deletedMode === "deleted") out = out.filter((o) => o.deletedAtMs != null);

  out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const offset = Math.max(0, Number(filters.offset ?? 0) || 0);
  const limitRaw = Number(filters.limit ?? 0) || 0;
  if (limitRaw > 0) {
    const limit = Math.min(500, Math.max(1, Math.floor(limitRaw)));
    out = out.slice(offset, offset + limit);
  } else if (offset > 0) {
    out = out.slice(offset);
  }
  return out;
}

function newId(): string {
  return `web-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "ui_pref_get": {
      const input = (args?.input ?? {}) as UiPrefGetInput;
      return uiPrefGet({
        userKey: String(input.userKey ?? ""),
        pageKey: String(input.pageKey ?? ""),
        prefKey: String(input.prefKey ?? ""),
      }) as T;
    }
    case "ui_pref_set": {
      const input = (args?.input ?? {}) as UiPrefSetInput;
      uiPrefSet({
        userKey: String(input.userKey ?? ""),
        pageKey: String(input.pageKey ?? ""),
        prefKey: String(input.prefKey ?? ""),
        prefValue: String(input.prefValue ?? ""),
      });
      return undefined as T;
    }
    case "orders_list": {
      const filters = (args?.filters ?? {}) as OrdersListFilters;
      return applyFilters(orders, filters) as T;
    }
    case "archive_months_overview": {
      const buckets = new Map<string, { orderCount: number; paidSumCents: number }>();
      for (const o of orders) {
        if (!o.archiveMonth) continue;
        const rec = buckets.get(o.archiveMonth) ?? { orderCount: 0, paidSumCents: 0 };
        rec.orderCount += 1;
        const paid = (paymentsByOrder[o.id] ?? []).reduce((sum, p) => sum + p.amountCents, 0);
        rec.paidSumCents += paid;
        buckets.set(o.archiveMonth, rec);
      }
      const out: ArchiveMonthOverviewItem[] = Array.from(buckets.entries())
        .map(([month, rec]) => ({ month, orderCount: rec.orderCount, paidSumCents: rec.paidSumCents }))
        .sort((a, b) => b.month.localeCompare(a.month));
      return out as T;
    }
    case "monthly_income_summary": {
      const month = normalizeArchiveMonth(String(args?.month ?? ""));
      if (!month) throw new Error("invalid month");
      const monthOrders = orders.filter((o) => o.archiveMonth === month);
      const archivedOrders = monthOrders.length;
      let paidSumCents = 0;
      let depositSumCents = 0;
      let outstandingSumCents = 0;
      for (const paymentList of Object.values(paymentsByOrder)) {
        for (const p of paymentList) {
          const paymentMonth = toMonthValue(p.paidAtMs);
          if (paymentMonth !== month) continue;
          paidSumCents += p.amountCents;
          if (p.type === "deposit") depositSumCents += p.amountCents;
        }
      }
      for (const o of monthOrders) {
        const recomputed = recomputeOrder(o);
        outstandingSumCents += recomputed.outstandingCents;
      }
      const out: MonthlyIncomeSummary = {
        month,
        archivedOrders,
        paidSumCents,
        depositSumCents,
        outstandingSumCents,
      };
      return out as T;
    }
    case "mock_persistence_get": {
      return getMockPersistEnabled() as T;
    }
    case "mock_persistence_set": {
      const enabled = Boolean(args?.enabled);
      setMockPersistEnabled(enabled);
      if (enabled) saveMockState();
      return undefined as T;
    }
    case "mock_state_clear": {
      orders = backfillDoneOrderArchiveMonth([...seedOrders]);
      paymentsByOrder = {};
      adjustmentsByOrder = {};
      try {
        localStorage.removeItem(MOCK_PERSIST_KEY);
      } catch {
        // ignore
      }
      saveMockState();
      return undefined as T;
    }
    case "payments_list": {
      const orderId = String(args?.orderId ?? "");
      return (paymentsByOrder[orderId] ?? []).slice().sort((a, b) => a.paidAtMs - b.paidAtMs) as T;
    }
    case "payment_add": {
      const orderId = String(args?.orderId ?? "");
      ensureOrderEditable(orderId);
      const payload = args?.payload as PaymentCreatePayload;
      const id = newId();
      const createdAtMs = nowMs();
      const rec: PaymentRecord = {
        id,
        orderId,
        amountCents: payload.amountCents,
        type: payload.type,
        paidAtMs: payload.paidAtMs,
        note: payload.note ?? "",
        createdAtMs,
      };
      paymentsByOrder[orderId] = [...(paymentsByOrder[orderId] ?? []), rec];
      touchOrder(orderId);
      return id as T;
    }
    case "payment_update": {
      const id = String(args?.id ?? "");
      const patch = (args?.patch ?? {}) as PaymentPatch;
      for (const orderId of Object.keys(paymentsByOrder)) {
        const list = paymentsByOrder[orderId] ?? [];
        const idx = list.findIndex((p) => p.id === id);
        if (idx < 0) continue;
        ensureOrderEditable(orderId);
        const curr = list[idx]!;
        const next: PaymentRecord = {
          ...curr,
          amountCents: patch.amountCents ?? curr.amountCents,
          type: (patch.type as any) ?? curr.type,
          paidAtMs: patch.paidAtMs ?? curr.paidAtMs,
          note: patch.note == null ? curr.note : String(patch.note),
        };
        paymentsByOrder[orderId] = [...list.slice(0, idx), next, ...list.slice(idx + 1)];
        touchOrder(orderId);
        return undefined as T;
      }
      throw new Error("payment not found");
    }
    case "payment_delete": {
      const id = String(args?.id ?? "");
      for (const orderId of Object.keys(paymentsByOrder)) {
        const list = paymentsByOrder[orderId] ?? [];
        const next = list.filter((p) => p.id !== id);
        if (next.length === list.length) continue;
        ensureOrderEditable(orderId);
        paymentsByOrder[orderId] = next;
        touchOrder(orderId);
        return undefined as T;
      }
      return undefined as T;
    }
    case "adjustments_list": {
      const orderId = String(args?.orderId ?? "");
      return (adjustmentsByOrder[orderId] ?? []).slice().sort((a, b) => a.atMs - b.atMs) as T;
    }
    case "adjustment_add": {
      const orderId = String(args?.orderId ?? "");
      ensureOrderEditable(orderId);
      const payload = args?.payload as AmountAdjustmentCreatePayload;
      const id = newId();
      const createdAtMs = nowMs();
      const rec: AmountAdjustmentRecord = {
        id,
        orderId,
        deltaCents: payload.deltaCents,
        reason: payload.reason ?? "",
        atMs: payload.atMs,
        createdAtMs,
      };
      adjustmentsByOrder[orderId] = [...(adjustmentsByOrder[orderId] ?? []), rec];
      touchOrder(orderId);
      return id as T;
    }
    case "adjustment_delete": {
      const id = String(args?.id ?? "");
      for (const orderId of Object.keys(adjustmentsByOrder)) {
        const list = adjustmentsByOrder[orderId] ?? [];
        const next = list.filter((a) => a.id !== id);
        if (next.length === list.length) continue;
        ensureOrderEditable(orderId);
        adjustmentsByOrder[orderId] = next;
        touchOrder(orderId);
        return undefined as T;
      }
      return undefined as T;
    }
    case "order_create": {
      const payload = args?.payload as OrderCreatePayload;
      const id = newId();
      const t = nowMs();
      const status = payload.status ?? "pending_send";
      const archiveMonth = status === "done" ? toMonthValue(t) : null;
      const created = makeOrder({
        id,
        systemName: payload.systemName,
        wechat: payload.wechat,
        username: payload.username,
        repoUrl: payload.repoUrl,
        requirementPath: payload.requirementPath ?? "",
        status,
        techStack: payload.techStack ?? "",
        deliverables: payload.deliverables ?? "",
        note: payload.note ?? "",
        archiveMonth,
        totalBaseCents: payload.totalBaseCents,
        createdAtMs: t,
        updatedAtMs: t,
      });
      paymentsByOrder[id] = [];
      adjustmentsByOrder[id] = [];
      orders = [created, ...orders];
      saveMockState();
      return { id } as T;
    }
    case "order_update": {
      const id = String(args?.id ?? "");
      const patch = (args?.patch ?? {}) as OrderPatch;
      const idx = orders.findIndex((o) => o.id === id);
      if (idx < 0) throw new Error("order not found");
      const curr = orders[idx]!;
      if (curr.archiveMonth) throw new Error("ORDER_ARCHIVED_LOCKED: order is archived, unarchive first");
      const updatedAtMs = nowMs();
      const totalBaseCents = patch.totalBaseCents ?? curr.totalBaseCents;
      const nextStatus = (patch.status as any) ?? curr.status;
      const nextArchiveMonth = curr.status !== "done" && nextStatus === "done" ? toMonthValue(updatedAtMs) : null;
      const next: OrderListItem = {
        ...curr,
        systemName: patch.systemName ?? curr.systemName,
        wechat: patch.wechat ?? curr.wechat,
        username: patch.username ?? curr.username,
        repoUrl: patch.repoUrl ?? curr.repoUrl,
        requirementPath: patch.requirementPath ?? curr.requirementPath,
        status: nextStatus,
        techStack: patch.techStack ?? curr.techStack,
        deliverables: patch.deliverables ?? curr.deliverables,
        note: patch.note ?? curr.note,
        archiveMonth: nextArchiveMonth,
        totalBaseCents,
        updatedAtMs,
        totalCurrentCents: curr.totalCurrentCents,
        paidSumCents: curr.paidSumCents,
        depositSumCents: curr.depositSumCents,
        outstandingCents: curr.outstandingCents,
      };
      orders = [recomputeOrder(next), ...orders.filter((o) => o.id !== id)];
      saveMockState();
      return undefined as T;
    }
    case "order_unarchive": {
      const id = String(args?.id ?? "");
      const idx = orders.findIndex((o) => o.id === id);
      if (idx < 0) throw new Error("order not found");
      const curr = orders[idx]!;
      if (!curr.archiveMonth) throw new Error("order is not archived");
      const updatedAtMs = nowMs();
      const next = recomputeOrder({ ...curr, archiveMonth: null, updatedAtMs });
      orders = [next, ...orders.filter((o) => o.id !== id)];
      saveMockState();
      return undefined as T;
    }
    case "order_soft_delete": {
      const id = String(args?.id ?? "");
      const idx = orders.findIndex((o) => o.id === id);
      if (idx < 0) throw new Error("order not found");
      const curr = orders[idx]!;
      if (curr.archiveMonth) throw new Error("ORDER_ARCHIVED_LOCKED: order is archived, unarchive first");
      if (curr.deletedAtMs != null) return undefined as T;
      const updatedAtMs = nowMs();
      const next = recomputeOrder({ ...curr, deletedAtMs: updatedAtMs, updatedAtMs });
      orders = [next, ...orders.filter((o) => o.id !== id)];
      saveMockState();
      return undefined as T;
    }
    case "order_restore": {
      const id = String(args?.id ?? "");
      const idx = orders.findIndex((o) => o.id === id);
      if (idx < 0) throw new Error("order not found");
      const curr = orders[idx]!;
      const updatedAtMs = nowMs();
      const next = recomputeOrder({ ...curr, deletedAtMs: null, updatedAtMs });
      orders = [next, ...orders.filter((o) => o.id !== id)];
      saveMockState();
      return undefined as T;
    }
    case "order_hard_delete": {
      const id = String(args?.id ?? "");
      const curr = orders.find((o) => o.id === id);
      if (curr?.archiveMonth) throw new Error("ORDER_ARCHIVED_LOCKED: order is archived, unarchive first");
      const prev = orders.length;
      orders = orders.filter((o) => o.id !== id);
      delete paymentsByOrder[id];
      delete adjustmentsByOrder[id];
      if (orders.length === prev) throw new Error("order not found");
      saveMockState();
      return undefined as T;
    }
    case "order_files_list": {
      return [] as T;
    }
    case "order_folder_path": {
      return "C:\\mock\\orders" as T;
    }
    case "get_portable_paths": {
      return {
        data_dir: "C:\\mock\\data",
        db_path: "C:\\mock\\data\\orderly.db",
        orders_dir: "C:\\mock\\data\\orders",
        backups_dir: "C:\\mock\\data\\backups",
      } as T;
    }
    case "backup_export": {
      const t = nowMs();
      return `C:\\mock\\data\\backups\\orderly.backup.${t}.zip` as T;
    }
    case "backup_import": {
      return undefined as T;
    }
    case "greet": {
      return `Hello, ${String((args as any)?.name ?? "world")}! (web mock)` as T;
    }
    default:
      throw new Error(`mockInvoke: unsupported command: ${command}`);
  }
}
