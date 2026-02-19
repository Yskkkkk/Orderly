import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invokeCommand, openPathSafe, openUrlSafe } from "@/lib/backend";
import { isTauriRuntime } from "@/lib/runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uiError } from "@/lib/errors";
import { parseYuanToCents, formatCentsToYuan } from "@/lib/money";

type OrderStatus = "pending_send" | "done" | "canceled";

const AgentationToolbar = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("agentation");
      return { default: mod.Agentation };
    })
  : null;

type OrderListRow = {
  id: string;
  systemName: string;
  wechat: string;
  username: string;
  status: OrderStatus;
  updatedAt: string;
};

type OrderListItem = {
  id: string;
  systemName: string;
  wechat: string;
  username: string;
  repoUrl: string;
  requirementPath: string;
  status: OrderStatus;
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

const PAGE_SIZE = 100;
const LEFT_PANE_DEFAULT_WIDTH = 380;
const LEFT_PANE_MIN_WIDTH = 320;
const LEFT_PANE_MIN_WIDTH_TABLET = 260;
const RIGHT_PANE_MIN_WIDTH = 560;
const RIGHT_PANE_MIN_WIDTH_TABLET = 420;
const SPLITTER_HIT_WIDTH = 18;
const SPLITTER_STEP = 16;
const SPLITTER_STEP_FAST = 48;
const ORDERS_DESKTOP_MIN_WIDTH = 1200;
const ORDERS_TABLET_MIN_WIDTH = 900;
const UI_PREF_USER_KEY = "default";
const UI_PREF_PAGE_KEY = "orders";
const UI_PREF_KEY_LEFT_PANE = "left_pane_width_desktop";
const UI_PREF_LOCAL_FALLBACK_KEY = `orderly_ui_pref_v1:${UI_PREF_USER_KEY}:${UI_PREF_PAGE_KEY}:${UI_PREF_KEY_LEFT_PANE}`;
const DAY_MS = 24 * 60 * 60 * 1000;

type OrderFileEntry = {
  relPath: string;
  absPath: string;
  isDir: boolean;
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

type AmountAdjustmentRecord = {
  id: string;
  orderId: string;
  deltaCents: number;
  reason: string;
  atMs: number;
  createdAtMs: number;
};

type UiPrefGetOutput = {
  prefValue: string | null;
  updatedAtMs: number | null;
};

type OrdersViewportMode = "desktop" | "tablet" | "mobile";

type TreeNode = {
  name: string;
  path: string;
  absPath?: string;
  isDir: boolean;
  children?: TreeNode[];
};

function parseTechStackTags(input: string): string[] {
  const raw = input.trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,，;；/|]+/g)
    .flatMap((s) => s.split(/\s+/g))
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function repoUrlWarning(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "仓库 URL 建议使用 http/https 协议";
    }
    return "";
  } catch {
    return "仓库 URL 格式建议为 https://github.com/user/repo（仅提示，不阻止保存）";
  }
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const { text, variant } = useMemo(() => {
    switch (status) {
      case "pending_send":
        return { text: "待发送", variant: "warning" as const };
      case "done":
        return { text: "已完成", variant: "success" as const };
      case "canceled":
        return { text: "已取消", variant: "destructive" as const };
      default:
        return { text: status, variant: "muted" as const };
    }
  }, [status]);

  return <Badge variant={variant}>{text}</Badge>;
}

function IconOrders({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 6H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 18H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconSettings({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3.8v2.1M12 18.1v2.1M18.2 12h2M3.8 12h2M16.4 7.6l1.5-1.5M6.1 17.9l1.5-1.5M16.4 16.4l1.5 1.5M6.1 6.1l1.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconStats({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 19V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 19V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 19V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 19.5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M20 7V3.5H16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v3.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.8 9.2A7 7 0 0 1 18.6 7M17.2 14.8A7 7 0 0 1 5.4 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconEmpty({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="12" width="32" height="24" rx="8" fill="hsl(var(--primary) / 0.08)" />
      <path d="M16 22H32" stroke="hsl(var(--primary))" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 28H26" stroke="hsl(var(--primary) / 0.75)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="34" cy="30" r="3" fill="#ff8a1f" />
    </svg>
  );
}

export default function App() {
  function toDateInputValue(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getRecentDateRange(): { from: string; to: string } {
    const toMs = Date.now();
    const fromMs = toMs - 7 * DAY_MS;
    return {
      from: toDateInputValue(fromMs),
      to: toDateInputValue(toMs),
    };
  }

  function getCurrentMonthValue(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  const tauriRuntime = isTauriRuntime();
  const [activeMenu, setActiveMenu] = useState<"orders" | "stats" | "settings">("orders");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [archiveMonthFilter, setArchiveMonthFilter] = useState<"all" | "__none__" | string>("all");
  const [deletedMode, setDeletedMode] = useState<"active" | "deleted">("active");
  const [timeField, setTimeField] = useState<"created" | "updated">("updated");
  const [dateFrom, setDateFrom] = useState<string>(() => getRecentDateRange().from);
  const [dateTo, setDateTo] = useState<string>(() => getRecentDateRange().to);
  const [archiveOverview, setArchiveOverview] = useState<ArchiveMonthOverviewItem[]>([]);
  const [statsMonth, setStatsMonth] = useState<string>(() => getCurrentMonthValue());
  const [monthlySummary, setMonthlySummary] = useState<MonthlyIncomeSummary | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);
  const [debugBox, setDebugBox] = useState<string>("");
  const [files, setFiles] = useState<OrderFileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [adjustments, setAdjustments] = useState<AmountAdjustmentRecord[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({
    amountYuan: "",
    type: "deposit" as PaymentType,
    paidDate: "",
    note: "",
  });
  const [paymentError, setPaymentError] = useState<string>("");
  const [isPaymentSaving, setIsPaymentSaving] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentDraft, setAdjustmentDraft] = useState({
    deltaYuan: "",
    atDate: "",
    reason: "",
  });
  const [adjustmentError, setAdjustmentError] = useState<string>("");
  const [isAdjustmentSaving, setIsAdjustmentSaving] = useState(false);
  const [backupZipPath, setBackupZipPath] = useState<string>("");
  const [backupError, setBackupError] = useState<string>("");
  const [isBackupExporting, setIsBackupExporting] = useState(false);
  const [isBackupImporting, setIsBackupImporting] = useState(false);
  const [mockPersistEnabled, setMockPersistEnabled] = useState(true);
  const [mockPersistLoaded, setMockPersistLoaded] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    systemName: "",
    wechat: "",
    username: "",
    repoUrl: "",
    requirementPath: "",
    totalBaseYuan: "",
    status: "pending_send" as OrderStatus,
    techStack: "",
    deliverables: "",
    note: "",
  });
  const [createError, setCreateError] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({
    systemName: "",
    wechat: "",
    username: "",
    repoUrl: "",
    requirementPath: "",
    totalBaseYuan: "",
    status: "pending_send" as OrderStatus,
    techStack: "",
    deliverables: "",
    note: "",
  });
  const [editError, setEditError] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_DEFAULT_WIDTH);
  const [isPaneResizing, setIsPaneResizing] = useState(false);
  const [ordersViewportWidth, setOrdersViewportWidth] = useState(ORDERS_DESKTOP_MIN_WIDTH);
  const [mobileOrdersView, setMobileOrdersView] = useState<"list" | "detail">("list");
  const ordersSplitRef = useRef<HTMLDivElement | null>(null);
  const leftPaneWidthRef = useRef(LEFT_PANE_DEFAULT_WIDTH);
  const ordersViewportModeRef = useRef<OrdersViewportMode>("desktop");
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  function dateStartMs(dateStr: string): number | null {
    const s = dateStr.trim();
    if (!s) return null;
    const t = new Date(`${s}T00:00:00`).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function dateEndMs(dateStr: string): number | null {
    const s = dateStr.trim();
    if (!s) return null;
    const t = new Date(`${s}T23:59:59.999`).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function localDateInputValue(ms: number): string {
    return toDateInputValue(ms);
  }

  function formatDateShort(ms: number): string {
    try {
      return new Date(ms).toLocaleDateString();
    } catch {
      return String(ms);
    }
  }

  function showGlobalError(error: unknown, fallback: string) {
    const raw = uiError(error, fallback);
    const msg = raw.includes("ORDER_ARCHIVED_LOCKED")
      ? "该单子已归档，若需修改请先执行“取消归档”。"
      : raw;
    setGlobalError(msg);
    setDebugBox(msg);
  }

  function resetRecentDateRange() {
    const next = getRecentDateRange();
    setDateFrom(next.from);
    setDateTo(next.to);
  }

  function readLocalFallbackWidth(): number | null {
    try {
      const raw = localStorage.getItem(UI_PREF_LOCAL_FALLBACK_KEY);
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function writeLocalFallbackWidth(width: number) {
    try {
      localStorage.setItem(UI_PREF_LOCAL_FALLBACK_KEY, String(width));
    } catch {
      // ignore
    }
  }

  function getLeftPaneMaxWidth(): number {
    const mode = ordersViewportModeRef.current;
    if (mode === "mobile") return Number.POSITIVE_INFINITY;
    const containerWidth = ordersSplitRef.current?.clientWidth ?? 0;
    if (containerWidth <= 0) return Number.POSITIVE_INFINITY;
    const rightMin = mode === "desktop" ? RIGHT_PANE_MIN_WIDTH : RIGHT_PANE_MIN_WIDTH_TABLET;
    return containerWidth - SPLITTER_HIT_WIDTH - rightMin;
  }

  function clampLeftPaneWidth(width: number): number {
    if (!Number.isFinite(width)) return LEFT_PANE_DEFAULT_WIDTH;
    const mode = ordersViewportModeRef.current;
    const leftMin = mode === "desktop" ? LEFT_PANE_MIN_WIDTH : LEFT_PANE_MIN_WIDTH_TABLET;
    const maxWidth = getLeftPaneMaxWidth();
    if (!Number.isFinite(maxWidth)) return Math.max(leftMin, Math.round(width));
    if (maxWidth < leftMin) return leftMin;
    return Math.min(maxWidth, Math.max(leftMin, Math.round(width)));
  }

  function applyLeftPaneWidth(width: number): number {
    const next = clampLeftPaneWidth(width);
    leftPaneWidthRef.current = next;
    setLeftPaneWidth(next);
    return next;
  }

  async function persistLeftPaneWidth(width: number) {
    const next = clampLeftPaneWidth(width);
    try {
      await invokeCommand("ui_pref_set", {
        input: {
          userKey: UI_PREF_USER_KEY,
          pageKey: UI_PREF_PAGE_KEY,
          prefKey: UI_PREF_KEY_LEFT_PANE,
          prefValue: String(next),
        },
      });
    } catch {
      // ignore and fallback to localStorage
    }
    writeLocalFallbackWidth(next);
  }

  const createRepoWarning = useMemo(() => repoUrlWarning(createDraft.repoUrl), [createDraft.repoUrl]);
  const editRepoWarning = useMemo(() => repoUrlWarning(editDraft.repoUrl), [editDraft.repoUrl]);
  const ordersViewportMode = useMemo<OrdersViewportMode>(() => {
    if (ordersViewportWidth >= ORDERS_DESKTOP_MIN_WIDTH) return "desktop";
    if (ordersViewportWidth >= ORDERS_TABLET_MIN_WIDTH) return "tablet";
    return "mobile";
  }, [ordersViewportWidth]);

  useEffect(() => {
    ordersViewportModeRef.current = ordersViewportMode;
    if (ordersViewportMode !== "mobile") {
      setMobileOrdersView("list");
    }
  }, [ordersViewportMode]);

  useEffect(() => {
    if (activeMenu !== "orders") return;
    const el = ordersSplitRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.clientWidth || window.innerWidth;
      if (next > 0) setOrdersViewportWidth(next);
    };

    updateWidth();
    const onResize = () => updateWidth();
    window.addEventListener("resize", onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [activeMenu]);

  useEffect(() => {
    let cancelled = false;
    invokeCommand<UiPrefGetOutput>("ui_pref_get", {
      input: {
        userKey: UI_PREF_USER_KEY,
        pageKey: UI_PREF_PAGE_KEY,
        prefKey: UI_PREF_KEY_LEFT_PANE,
      },
    })
      .then((res) => {
        const saved = Number(res?.prefValue ?? "");
        if (!Number.isFinite(saved)) throw new Error("invalid width");
        if (cancelled) return;
        applyLeftPaneWidth(saved);
      })
      .catch(() => {
        const local = readLocalFallbackWidth();
        const width = local ?? LEFT_PANE_DEFAULT_WIDTH;
        if (cancelled) return;
        applyLeftPaneWidth(width);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => {
      setLeftPaneWidth((curr) => {
        const next = clampLeftPaneWidth(curr);
        leftPaneWidthRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeMenu !== "orders") return;
    const raf = window.requestAnimationFrame(() => {
      setLeftPaneWidth((curr) => {
        const next = clampLeftPaneWidth(curr);
        leftPaneWidthRef.current = next;
        return next;
      });
    });
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu]);

  useEffect(() => {
    if (ordersViewportMode === "mobile") return;
    setLeftPaneWidth((curr) => {
      const next = clampLeftPaneWidth(curr);
      leftPaneWidthRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersViewportMode]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      document.body.classList.remove("is-col-resizing");
    };
  }, []);

  async function refreshOrders(options?: Partial<{ q: string; append: boolean }>) {
    const q = options?.q ?? query;
    const append = Boolean(options?.append);
    const filters: OrdersListFilters = { q };
    if (statusFilter !== "all") filters.status = statusFilter;
    if (archiveMonthFilter !== "all") filters.archiveMonth = archiveMonthFilter;
    filters.deletedMode = deletedMode;
    filters.limit = PAGE_SIZE;
    filters.offset = append ? orders.length : 0;

    const fromMs = dateStartMs(dateFrom);
    const toMs = dateEndMs(dateTo);
    if (timeField === "created") {
      if (fromMs != null) filters.createdFromMs = fromMs;
      if (toMs != null) filters.createdToMs = toMs;
    } else {
      if (fromMs != null) filters.updatedFromMs = fromMs;
      if (toMs != null) filters.updatedToMs = toMs;
    }

    const res = await invokeCommand<OrderListItem[]>("orders_list", { filters });
    const next = append ? [...orders, ...res] : res;
    setHasMoreOrders(res.length === PAGE_SIZE);
    setOrders(next);
    if (!next.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !next.some((o) => o.id === selectedId)) setSelectedId(next[0].id);
  }

  async function loadMoreOrders() {
    if (isLoadingMoreOrders || !hasMoreOrders) return;
    setIsLoadingMoreOrders(true);
    try {
      await refreshOrders({ append: true });
    } catch (e) {
      showGlobalError(e, "加载更多订单失败");
    } finally {
      setIsLoadingMoreOrders(false);
    }
  }

  useEffect(() => {
    refreshOrders().catch((e) => showGlobalError(e, "加载订单列表失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshOrders().catch((e) => showGlobalError(e, "刷新订单列表失败"));
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, archiveMonthFilter, deletedMode, timeField, dateFrom, dateTo]);

  useEffect(() => {
    if (!globalError) return;
    const timer = setTimeout(() => setGlobalError(""), 5000);
    return () => clearTimeout(timer);
  }, [globalError]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? (orders[0] ?? null),
    [orders, selectedId],
  );
  const selectedDeleted = selected?.deletedAtMs != null;
  const selectedArchived = selected?.archiveMonth != null;
  const selectedLocked = Boolean(selectedDeleted || selectedArchived);
  const techTags = useMemo(() => parseTechStackTags(selected?.techStack ?? ""), [selected?.techStack]);

  useEffect(() => {
    if (tauriRuntime) return;
    invokeCommand<boolean>("mock_persistence_get")
      .then((v) => setMockPersistEnabled(Boolean(v)))
      .catch(() => setMockPersistEnabled(true))
      .finally(() => setMockPersistLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshFiles(orderId: string) {
    const res = await invokeCommand<OrderFileEntry[]>("order_files_list", { orderId });
    setFiles(res);
  }

  async function refreshMoney(orderId: string) {
    const [p, a] = await Promise.all([
      invokeCommand<PaymentRecord[]>("payments_list", { orderId }),
      invokeCommand<AmountAdjustmentRecord[]>("adjustments_list", { orderId }),
    ]);
    setPayments(p);
    setAdjustments(a);
  }

  async function refreshArchiveOverview() {
    const res = await invokeCommand<ArchiveMonthOverviewItem[]>("archive_months_overview");
    setArchiveOverview(res);
  }

  async function refreshMonthlySummary(month: string) {
    const normalized = month.trim();
    if (!normalized) return;
    const res = await invokeCommand<MonthlyIncomeSummary>("monthly_income_summary", { month: normalized });
    setMonthlySummary(res);
  }

  useEffect(() => {
    if (!selected?.id) return;
    refreshFiles(selected.id).catch((e) => showGlobalError(e, "加载附件列表失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setPayments([]);
      setAdjustments([]);
      return;
    }
    refreshMoney(selected.id).catch((e) => showGlobalError(e, "加载金额流水失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    refreshArchiveOverview().catch((e) => showGlobalError(e, "加载归档月份失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  useEffect(() => {
    refreshMonthlySummary(statsMonth).catch((e) => showGlobalError(e, "加载月度收入失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsMonth, orders]);

  async function testInvoke() {
    const res = await invokeCommand<string>("greet", { name: "Orderly" });
    setDebugBox(res);
  }

  async function showPaths() {
    const res = await invokeCommand<{
      data_dir: string;
      db_path: string;
      orders_dir: string;
      backups_dir: string;
    }>("get_portable_paths");
    setDebugBox(JSON.stringify(res, null, 2));
  }

  async function openBackupsDir() {
    try {
      const res = await invokeCommand<{
        backups_dir: string;
      }>("get_portable_paths");
      await openPathSafe(res.backups_dir);
    } catch (e) {
      showGlobalError(e, "打开备份目录失败");
    }
  }

  async function exportBackup() {
    setBackupError("");
    setIsBackupExporting(true);
    try {
      const path = await invokeCommand<string>("backup_export");
      setBackupZipPath(path);
      setDebugBox(`已导出备份：${path}`);
    } catch (e) {
      const msg = uiError(e, "导出备份失败");
      setBackupError(msg);
      setGlobalError(msg);
    } finally {
      setIsBackupExporting(false);
    }
  }

  async function importBackup() {
    const p = backupZipPath.trim();
    if (!p) return setBackupError("请填写 zip 路径");
    const ok = window.confirm("恢复会先备份当前 data/，再用 zip 内容替换。建议先关闭其他操作。\n确定继续吗？");
    if (!ok) return;

    setBackupError("");
    setIsBackupImporting(true);
    try {
      await invokeCommand("backup_import", { srcZipPath: p });
      setDebugBox(`已恢复备份：${p}\n建议点击“刷新”重新加载列表。`);
      setSelectedId(null);
      await refreshOrders();
    } catch (e) {
      const msg = uiError(e, "恢复备份失败");
      setBackupError(msg);
      setGlobalError(msg);
    } finally {
      setIsBackupImporting(false);
    }
  }

  async function toggleMockPersist(enabled: boolean) {
    setMockPersistEnabled(enabled);
    try {
      await invokeCommand("mock_persistence_set", { enabled });
    } catch (e) {
      showGlobalError(e, "切换 Mock 持久化失败");
    }
  }

  async function clearMockState() {
    const ok = window.confirm("确定清空 Web Mock 数据吗？这会重置为示例数据。");
    if (!ok) return;
    try {
      await invokeCommand("mock_state_clear");
      setSelectedId(null);
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "清空 Mock 数据失败");
    }
  }

  async function openOrderFolder() {
    if (!selected?.id) return;
    try {
      const path = await invokeCommand<string>("order_folder_path", { orderId: selected.id });
      await openPathSafe(path);
    } catch (e) {
      showGlobalError(e, "打开单子目录失败");
    }
  }

  function labelPaymentType(t: PaymentType): string {
    switch (t) {
      case "deposit":
        return "定金";
      case "final":
        return "尾款";
      case "other":
        return "其他";
      default:
        return t;
    }
  }

  function openAddPaymentDialog() {
    if (!selected?.id || selectedDeleted) return;
    if (selected.archiveMonth) {
      setGlobalError("已归档单子不可修改收款，请先取消归档。");
      return;
    }
    setPaymentError("");
    setEditingPaymentId(null);
    setPaymentDraft({
      amountYuan: "",
      type: "deposit",
      paidDate: localDateInputValue(Date.now()),
      note: "",
    });
    setIsPaymentOpen(true);
  }

  function openEditPaymentDialog(p: PaymentRecord) {
    if (selected?.archiveMonth) {
      setGlobalError("已归档单子不可编辑收款，请先取消归档。");
      return;
    }
    setPaymentError("");
    setEditingPaymentId(p.id);
    setPaymentDraft({
      amountYuan: formatCentsToYuan(p.amountCents),
      type: p.type,
      paidDate: localDateInputValue(p.paidAtMs),
      note: p.note ?? "",
    });
    setIsPaymentOpen(true);
  }

  async function savePayment() {
    if (!selected?.id) return;
    setPaymentError("");

    const centsRes = parseYuanToCents(paymentDraft.amountYuan);
    if (!centsRes.ok) return setPaymentError(centsRes.error);
    const paidAtMs = dateStartMs(paymentDraft.paidDate);
    if (paidAtMs == null) return setPaymentError("收款日期不能为空");

    setIsPaymentSaving(true);
    try {
      if (editingPaymentId) {
        await invokeCommand("payment_update", {
          id: editingPaymentId,
          patch: {
            amountCents: centsRes.cents,
            type: paymentDraft.type,
            paidAtMs,
            note: paymentDraft.note.trim(),
          },
        });
      } else {
        await invokeCommand<string>("payment_add", {
          orderId: selected.id,
          payload: {
            amountCents: centsRes.cents,
            type: paymentDraft.type,
            paidAtMs,
            note: paymentDraft.note.trim() || null,
          },
        });
      }

      await refreshMoney(selected.id);
      await refreshOrders();
      setIsPaymentOpen(false);
    } catch (e) {
      const msg = uiError(e, "保存收款失败");
      setPaymentError(msg);
      setGlobalError(msg);
    } finally {
      setIsPaymentSaving(false);
    }
  }

  async function deletePayment(p: PaymentRecord) {
    if (!selected?.id) return;
    if (selected.archiveMonth) {
      setGlobalError("已归档单子不可删除收款，请先取消归档。");
      return;
    }
    const ok = window.confirm(`确定删除这笔收款吗？\n${labelPaymentType(p.type)} ${formatCentsToYuan(p.amountCents)}`);
    if (!ok) return;
    try {
      await invokeCommand("payment_delete", { id: p.id });
      await refreshMoney(selected.id);
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "删除收款记录失败");
    }
  }

  function openAddAdjustmentDialog() {
    if (!selected?.id || selectedDeleted) return;
    if (selected.archiveMonth) {
      setGlobalError("已归档单子不可新增金额调整，请先取消归档。");
      return;
    }
    setAdjustmentError("");
    setAdjustmentDraft({
      deltaYuan: "",
      atDate: localDateInputValue(Date.now()),
      reason: "",
    });
    setIsAdjustmentOpen(true);
  }

  async function saveAdjustment() {
    if (!selected?.id) return;
    setAdjustmentError("");

    const centsRes = parseYuanToCents(adjustmentDraft.deltaYuan);
    if (!centsRes.ok) return setAdjustmentError(centsRes.error);
    const atMs = dateStartMs(adjustmentDraft.atDate);
    if (atMs == null) return setAdjustmentError("调整日期不能为空");

    setIsAdjustmentSaving(true);
    try {
      await invokeCommand<string>("adjustment_add", {
        orderId: selected.id,
        payload: {
          deltaCents: centsRes.cents,
          reason: adjustmentDraft.reason.trim() || null,
          atMs,
        },
      });
      await refreshMoney(selected.id);
      await refreshOrders();
      setIsAdjustmentOpen(false);
    } catch (e) {
      const msg = uiError(e, "保存金额调整失败");
      setAdjustmentError(msg);
      setGlobalError(msg);
    } finally {
      setIsAdjustmentSaving(false);
    }
  }

  async function deleteAdjustment(a: AmountAdjustmentRecord) {
    if (!selected?.id) return;
    if (selected.archiveMonth) {
      setGlobalError("已归档单子不可删除金额调整，请先取消归档。");
      return;
    }
    const ok = window.confirm(`确定删除这条金额调整吗？\n${formatCentsToYuan(a.deltaCents)} ${a.reason || ""}`.trim());
    if (!ok) return;
    try {
      await invokeCommand("adjustment_delete", { id: a.id });
      await refreshMoney(selected.id);
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "删除金额调整失败");
    }
  }

  function buildTree(entries: OrderFileEntry[]): TreeNode[] {
    const root: TreeNode[] = [];

    const sorted = [...entries].sort((a, b) => a.relPath.localeCompare(b.relPath));

    for (const e of sorted) {
      const parts = e.relPath.split("/").filter(Boolean);
      let nodes = root;
      let currPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const isLeaf = i === parts.length - 1;
        currPath = currPath ? `${currPath}/${part}` : part;

        let node = nodes.find((n) => n.name === part);
        if (!node) {
          node = {
            name: part,
            path: currPath,
            isDir: isLeaf ? e.isDir : true,
            children: [],
          };
          nodes.push(node);
        }

        if (isLeaf) {
          node.isDir = e.isDir;
          node.absPath = e.absPath;
        }

        if (!node.children) node.children = [];
        nodes = node.children;
      }
    }

    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const n of nodes) {
        if (n.children && n.children.length) sortNodes(n.children);
      }
    };
    sortNodes(root);

    return root;
  }

  const tree = useMemo(() => buildTree(files), [files]);

  function toggleDir(path: string) {
    setExpandedDirs((s) => ({ ...s, [path]: !s[path] }));
  }

  async function openFile(node: TreeNode) {
    if (!node.absPath || node.isDir) return;
    try {
      await openPathSafe(node.absPath);
    } catch (e) {
      showGlobalError(e, "打开附件失败");
    }
  }

  async function openRepo() {
    if (!selected?.repoUrl) return;
    try {
      await openUrlSafe(selected.repoUrl);
    } catch (e) {
      showGlobalError(e, "打开仓库链接失败");
    }
  }

  async function openRequirementPath() {
    const path = selected?.requirementPath?.trim() ?? "";
    if (!path) return;
    try {
      await openPathSafe(path);
    } catch (e) {
      showGlobalError(e, "打开需求文件地址失败");
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setDebugBox(`已复制${label}：${value}`);
    } catch (e) {
      showGlobalError(e, `复制${label}失败`);
    }
  }

  async function setSelectedStatus(nextStatus: OrderStatus) {
    if (!selected?.id || selected.status === nextStatus || selectedDeleted || selected.archiveMonth) return;
    try {
      await invokeCommand("order_update", {
        id: selected.id,
        patch: { status: nextStatus },
      });
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "更新状态失败");
    }
  }

  async function unarchiveSelectedOrder() {
    if (!selected?.id || selectedDeleted || !selected.archiveMonth) return;
    const ok = window.confirm(`确定取消归档「${selected.systemName}」吗？\n取消后才可编辑该单子。`);
    if (!ok) return;
    try {
      await invokeCommand("order_unarchive", { id: selected.id, reason: "manual_unarchive_from_ui" });
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "取消归档失败");
    }
  }

  function jumpToArchiveMonth(month: string) {
    setArchiveMonthFilter(month);
    setDeletedMode("active");
    setDateFrom("");
    setDateTo("");
    setActiveMenu("orders");
  }

  async function softDeleteSelectedOrder() {
    if (!selected?.id || selectedDeleted || selected.archiveMonth) return;
    const ok = window.confirm(`确定将单子「${selected.systemName}」移入已删除吗？`);
    if (!ok) return;
    try {
      await invokeCommand("order_soft_delete", { id: selected.id });
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "删除单子失败");
    }
  }

  async function restoreSelectedOrder() {
    if (!selected?.id || !selectedDeleted) return;
    try {
      await invokeCommand("order_restore", { id: selected.id });
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "恢复单子失败");
    }
  }

  async function hardDeleteSelectedOrder() {
    if (!selected?.id || !selectedDeleted || selected.archiveMonth) return;
    const ok = window.confirm(
      `彻底删除后无法恢复，且会删除该单子的附件目录。\n确定彻底删除「${selected.systemName}」吗？`,
    );
    if (!ok) return;
    try {
      await invokeCommand("order_hard_delete", { id: selected.id });
      await refreshOrders();
    } catch (e) {
      showGlobalError(e, "彻底删除单子失败");
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setArchiveMonthFilter("all");
    setTimeField("updated");
    resetRecentDateRange();
  }

  function selectOrder(id: string) {
    setSelectedId(id);
    if (ordersViewportModeRef.current === "mobile") {
      setMobileOrdersView("detail");
    }
  }

  function renderTree(nodes: TreeNode[], depth = 0): JSX.Element {
    return (
      <div className="flex flex-col gap-1">
        {nodes.map((n) => {
          const isExpanded = expandedDirs[n.path] ?? depth < 1;
          return (
            <div key={n.path}>
              <button
                type="button"
                className={[
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                  "hover:bg-accent",
                ].join(" ")}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => (n.isDir ? toggleDir(n.path) : openFile(n))}
              >
                <span className="w-4 text-xs text-muted-foreground">{n.isDir ? (isExpanded ? "▾" : "▸") : ""}</span>
                <span className="truncate">{n.name}</span>
              </button>
              {n.isDir && isExpanded && n.children && n.children.length ? (
                <div className="mt-1">{renderTree(n.children, depth + 1)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  async function createOrder() {
    setCreateError("");
    const centsRes = parseYuanToCents(createDraft.totalBaseYuan);
    if (!centsRes.ok) {
      setCreateError(centsRes.error);
      return;
    }
    if (!createDraft.systemName.trim()) return setCreateError("系统名称不能为空");
    if (!createDraft.wechat.trim()) return setCreateError("微信号不能为空");
    if (!createDraft.username.trim()) return setCreateError("用户名不能为空");
    if (!createDraft.repoUrl.trim()) return setCreateError("GitHub 仓库 URL 不能为空");

    setIsCreating(true);
    try {
      const res = await invokeCommand<{ id: string }>("order_create", {
        payload: {
          systemName: createDraft.systemName.trim(),
          wechat: createDraft.wechat.trim(),
          username: createDraft.username.trim(),
          repoUrl: createDraft.repoUrl.trim(),
          requirementPath: createDraft.requirementPath.trim() || null,
          status: createDraft.status,
          techStack: createDraft.techStack.trim() || null,
          deliverables: createDraft.deliverables.trim() || null,
          note: createDraft.note.trim() || null,
          totalBaseCents: centsRes.cents,
        },
      });
      await refreshOrders();
      setSelectedId(res.id);
      setCreateDraft((s) => ({
        ...s,
        systemName: "",
        wechat: "",
        username: "",
        repoUrl: "",
        requirementPath: "",
        totalBaseYuan: "",
        status: "pending_send",
        techStack: "",
        deliverables: "",
        note: "",
      }));
      setIsCreateOpen(false);
    } catch (e) {
      const msg = uiError(e, "创建单子失败");
      setCreateError(msg);
      setGlobalError(msg);
    } finally {
      setIsCreating(false);
    }
  }

  function openEditDialog() {
    if (!selected) return;
    if (selected.deletedAtMs != null) {
      setGlobalError("已删除单子不可编辑，请先恢复。");
      return;
    }
    if (selected.archiveMonth) {
      setGlobalError("已归档单子不可编辑，请先取消归档。");
      return;
    }
    setEditError("");
    setEditDraft({
      systemName: selected.systemName ?? "",
      wechat: selected.wechat ?? "",
      username: selected.username ?? "",
      repoUrl: selected.repoUrl ?? "",
      requirementPath: selected.requirementPath ?? "",
      totalBaseYuan: formatCentsToYuan(selected.totalBaseCents ?? 0),
      status: selected.status,
      techStack: selected.techStack ?? "",
      deliverables: selected.deliverables ?? "",
      note: selected.note ?? "",
    });
    setIsEditOpen(true);
  }

  async function saveEdit() {
    if (!selected?.id) return;
    setEditError("");

    const centsRes = parseYuanToCents(editDraft.totalBaseYuan);
    if (!centsRes.ok) return setEditError(centsRes.error);
    if (!editDraft.systemName.trim()) return setEditError("系统名称不能为空");
    if (!editDraft.wechat.trim()) return setEditError("微信号不能为空");
    if (!editDraft.username.trim()) return setEditError("用户名不能为空");
    if (!editDraft.repoUrl.trim()) return setEditError("GitHub 仓库 URL 不能为空");

    setIsEditing(true);
    try {
      await invokeCommand("order_update", {
        id: selected.id,
        patch: {
          systemName: editDraft.systemName.trim(),
          wechat: editDraft.wechat.trim(),
          username: editDraft.username.trim(),
          repoUrl: editDraft.repoUrl.trim(),
          requirementPath: editDraft.requirementPath.trim(),
          status: editDraft.status,
          techStack: editDraft.techStack.trim(),
          deliverables: editDraft.deliverables.trim(),
          note: editDraft.note.trim(),
          totalBaseCents: centsRes.cents,
        },
      });
      await refreshOrders();
      setIsEditOpen(false);
    } catch (e) {
      const msg = uiError(e, "保存编辑失败");
      setEditError(msg);
      setGlobalError(msg);
    } finally {
      setIsEditing(false);
    }
  }

  function handleSplitterPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (ordersViewportModeRef.current === "mobile") return;
    if (e.button !== 0) return;
    e.preventDefault();

    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;

    const startX = e.clientX;
    const startWidth = leftPaneWidthRef.current;
    setIsPaneResizing(true);
    document.body.classList.add("is-col-resizing");

    const onPointerMove = (ev: PointerEvent) => {
      applyLeftPaneWidth(startWidth + (ev.clientX - startX));
    };

    const finish = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
      setIsPaneResizing(false);
      document.body.classList.remove("is-col-resizing");
      void persistLeftPaneWidth(leftPaneWidthRef.current);
    };

    resizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setIsPaneResizing(false);
      document.body.classList.remove("is-col-resizing");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function handleSplitterDoubleClick() {
    const next = applyLeftPaneWidth(LEFT_PANE_DEFAULT_WIDTH);
    void persistLeftPaneWidth(next);
  }

  function handleSplitterKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (ordersViewportModeRef.current === "mobile") return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home") return;
    e.preventDefault();
    if (e.key === "Home") {
      const next = applyLeftPaneWidth(LEFT_PANE_DEFAULT_WIDTH);
      void persistLeftPaneWidth(next);
      return;
    }
    const step = e.shiftKey ? SPLITTER_STEP_FAST : SPLITTER_STEP;
    const direction = e.key === "ArrowLeft" ? -1 : 1;
    const next = applyLeftPaneWidth(leftPaneWidthRef.current + direction * step);
    void persistLeftPaneWidth(next);
  }

  const isDesktopMode = ordersViewportMode === "desktop";
  const isTabletMode = ordersViewportMode === "tablet";
  const isMobileMode = ordersViewportMode === "mobile";
  const listPaneWidth = !isMobileMode ? leftPaneWidth : undefined;
  const showListPane = !isMobileMode || mobileOrdersView === "list";
  const showDetailPane = !isMobileMode || mobileOrdersView === "detail";
  const filterColsClass = !isMobileMode && leftPaneWidth < 420 ? "grid-cols-1" : !isMobileMode && leftPaneWidth < 640 ? "grid-cols-2" : "grid-cols-4";
  const splitterValueMin = isDesktopMode ? LEFT_PANE_MIN_WIDTH : LEFT_PANE_MIN_WIDTH_TABLET;
  const splitterValueMax = !isMobileMode
    ? Math.max(splitterValueMin, Math.floor(getLeftPaneMaxWidth()))
    : splitterValueMin;

  return (
    <>
      {globalError ? (
        <div className="fixed right-4 top-4 z-[100] max-w-[520px] rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <div className="flex-1 whitespace-pre-wrap">{globalError}</div>
            <button
              type="button"
              className="text-xs text-destructive/80 hover:text-destructive"
              onClick={() => setGlobalError("")}
              aria-label="关闭错误提示"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex h-screen bg-background">
      <aside className="flex w-40 flex-col border-r bg-muted/40 p-2">
        <div className="px-2 py-2">
          <div className="text-base font-semibold text-primary">Orderly</div>
        </div>
        <div className="mt-1 flex flex-col gap-1 px-1">
          <button
            type="button"
            className={[
              "relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              activeMenu === "orders" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
            onClick={() => setActiveMenu("orders")}
          >
            {activeMenu === "orders" ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" /> : null}
            <IconOrders className="h-4 w-4" />
            <span>单子</span>
          </button>
          <button
            type="button"
            className={[
              "relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              activeMenu === "settings" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
            onClick={() => setActiveMenu("settings")}
          >
            {activeMenu === "settings" ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" /> : null}
            <IconSettings className="h-4 w-4" />
            <span>设置</span>
          </button>
          <button
            type="button"
            className={[
              "relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              activeMenu === "stats" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
            onClick={() => setActiveMenu("stats")}
          >
            {activeMenu === "stats" ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" /> : null}
            <IconStats className="h-4 w-4" />
            <span>统计</span>
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-1 p-1">
          <Button size="sm" variant="ghost" onClick={showPaths}>
            数据路径
          </Button>
          <Button size="sm" variant="ghost" onClick={testInvoke}>
            连接测试
          </Button>
          <div className="pt-1">
            <Badge variant={tauriRuntime ? "success" : "warning"} className="w-full justify-center font-medium">
              {tauriRuntime ? "桌面端（Tauri）" : "Web Mock"}
            </Badge>
            {!tauriRuntime && mockPersistLoaded && !mockPersistEnabled ? (
              <div className="mt-1 text-[11px] text-muted-foreground text-center">刷新页面会丢数据</div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {activeMenu === "orders" ? (
          <div
            ref={ordersSplitRef}
            className={[
              "min-h-0 flex-1 p-3",
              isMobileMode ? "flex overflow-hidden" : "flex overflow-x-auto",
              isMobileMode ? "flex-col" : "",
            ].join(" ")}
          >
              {isMobileMode ? (
                <div className="mb-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={mobileOrdersView === "list" ? "secondary" : "outline"}
                    onClick={() => setMobileOrdersView("list")}
                  >
                    列表
                  </Button>
                  <Button
                    size="sm"
                    variant={mobileOrdersView === "detail" ? "secondary" : "outline"}
                    onClick={() => setMobileOrdersView("detail")}
                    disabled={!selected}
                  >
                    详情
                  </Button>
                  <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                    新建单子
                  </Button>
                  <div className="ml-auto text-xs text-muted-foreground">单栏模式</div>
                </div>
              ) : null}
              <section
                className={[
                  "flex flex-col rounded-xl border border-border/70 bg-card shadow-sm",
                  isDesktopMode ? "min-w-[320px] shrink-0" : "",
                  isTabletMode ? "min-w-[260px] shrink-0" : "",
                  isMobileMode ? "min-w-0 flex-1" : "",
                  showListPane ? "" : "hidden",
                ].join(" ")}
                style={listPaneWidth != null ? { width: `${listPaneWidth}px` } : undefined}
              >
                <div className="border-b p-3">
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="搜索微信号 / 用户名 / 系统名称"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="h-10 bg-background pl-9"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="刷新列表"
                      title="刷新列表"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => refreshOrders().catch((e) => showGlobalError(e, "刷新订单列表失败"))}
                    >
                      <IconRefresh className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="border-b p-3 pt-2">
                  <div className="rounded-lg border bg-accent/30 p-2">
                    <div className={["grid gap-2", filterColsClass].join(" ")}>
                      <div className="grid min-w-0 gap-1">
                        <div className="text-xs font-medium text-muted-foreground">状态</div>
                        <Select
                          aria-label="状态筛选"
                          value={statusFilter}
                          className="h-8 w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")}
                        >
                          <option value="all">全部</option>
                          <option value="pending_send">待发送</option>
                          <option value="done">已完成</option>
                          <option value="canceled">已取消</option>
                        </Select>
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <div className="text-xs font-medium text-muted-foreground">视图</div>
                        <Select
                          aria-label="列表视图"
                          value={deletedMode}
                          className="h-8 w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setDeletedMode(e.target.value as "active" | "deleted")}
                        >
                          <option value="active">正常</option>
                          <option value="deleted">已删除</option>
                        </Select>
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <div className="text-xs font-medium text-muted-foreground">时间字段</div>
                        <Select
                          aria-label="时间字段"
                          value={timeField}
                          className="h-8 w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setTimeField(e.target.value as "created" | "updated")}
                        >
                          <option value="updated">最近更新时间</option>
                          <option value="created">创建时间</option>
                        </Select>
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <div className="text-xs font-medium text-muted-foreground">归档月份</div>
                        <Select
                          aria-label="归档月份筛选"
                          value={archiveMonthFilter}
                          className="h-8 w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setArchiveMonthFilter(e.target.value as "all" | "__none__" | string)}
                        >
                          <option value="all">全部月份</option>
                          <option value="__none__">未归档</option>
                          {archiveOverview.map((m) => (
                            <option key={m.month} value={m.month}>
                              {m.month}（{m.orderCount}）
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          aria-label="日期从"
                          type="date"
                          value={dateFrom}
                          className="h-8 w-[156px] max-w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setDateFrom(e.target.value)}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">→</span>
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          aria-label="日期到"
                          type="date"
                          value={dateTo}
                          className="h-8 w-[156px] max-w-full min-w-0 bg-accent/50 text-xs"
                          onChange={(e) => setDateTo(e.target.value)}
                        />
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={resetRecentDateRange}>
                        清空
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-1">
                  {orders.length ? (
                    <>
                      {orders.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          data-testid="order-row"
                          className={[
                            "mb-2 w-full rounded-xl border px-3 py-2 text-left transition-colors",
                            "border-border/70 bg-card hover:border-primary/40 hover:bg-accent/40",
                            row.id === selected?.id ? "border-primary/60 bg-accent shadow-sm" : "",
                          ].join(" ")}
                          onClick={() => selectOrder(row.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{row.systemName}</div>
                            <StatusBadge status={row.status} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{row.wechat}</span>
                            <span>·</span>
                            <span className="truncate">{row.username}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            更新：{new Date(row.updatedAtMs).toLocaleString()}
                          </div>
                        </button>
                      ))}
                      {hasMoreOrders ? (
                        <Button
                          className="mt-2 w-full"
                          variant="outline"
                          onClick={loadMoreOrders}
                          disabled={isLoadingMoreOrders}
                        >
                          {isLoadingMoreOrders ? "加载中..." : "加载更多"}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <div className="mx-2 mt-3 rounded-xl border border-dashed border-primary/20 bg-gradient-to-b from-accent/35 to-transparent p-5 text-center">
                      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-sm">
                        <IconEmpty className="h-10 w-10" />
                      </div>
                      <div className="text-sm font-semibold">{deletedMode === "deleted" ? "暂无已删除单子" : "暂无筛选结果"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {deletedMode === "deleted" ? "删除单子后会出现在这里，可恢复或彻底删除。" : "试试调整筛选条件，或创建第一个单子。"}
                      </div>
                      <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" variant="ghost" onClick={clearFilters}>
                          清空筛选
                        </Button>
                        {deletedMode === "active" ? (
                          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                            创建首个单子
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
            </section>

            {!isMobileMode ? (
              <button
                type="button"
                role="separator"
                aria-label="调整列表与详情宽度"
                aria-orientation="vertical"
                aria-valuemin={splitterValueMin}
                aria-valuemax={splitterValueMax}
                aria-valuenow={Math.round(leftPaneWidth)}
                tabIndex={0}
                className={[
                  "group relative w-[18px] shrink-0 cursor-col-resize rounded-full focus-visible:outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isPaneResizing ? "bg-primary/20" : "hover:bg-primary/10",
                ].join(" ")}
                onPointerDown={handleSplitterPointerDown}
                onDoubleClick={handleSplitterDoubleClick}
                onKeyDown={handleSplitterKeyDown}
              >
                <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-border transition-colors group-hover:bg-primary/60" />
              </button>
            ) : null}

            <section
              className={[
                "flex flex-col rounded-xl border border-border/70 bg-card shadow-sm",
                isDesktopMode ? "min-w-[560px] flex-1" : isTabletMode ? "min-w-[420px] flex-1" : "min-w-0 flex-1",
                showDetailPane ? "" : "hidden",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 border-b bg-card px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <div className="text-base font-semibold">详情</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selected ? selected.systemName : "未选中单子"}
                  </div>
                </div>
                <div className="flex-1" />
                {selected ? (
                  <Button size="sm" variant="ghost" onClick={openOrderFolder}>
                    打开目录
                  </Button>
                ) : null}
                {selected && !selectedDeleted ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={openEditDialog} disabled={selectedArchived}>
                      编辑
                    </Button>
                    <Button size="sm" variant="destructive" onClick={softDeleteSelectedOrder} disabled={selectedArchived}>
                      删除
                    </Button>
                  </>
                ) : null}
                {selected && selectedArchived && !selectedDeleted ? (
                  <Button size="sm" variant="outline" onClick={unarchiveSelectedOrder}>
                    取消归档
                  </Button>
                ) : null}
                {selected && selectedDeleted ? (
                  <>
                    <Button size="sm" variant="outline" onClick={restoreSelectedOrder}>
                      恢复
                    </Button>
                    <Button size="sm" variant="destructive" onClick={hardDeleteSelectedOrder}>
                      彻底删除
                    </Button>
                  </>
                ) : null}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="shadow-sm">新建单子</Button>
                  </DialogTrigger>
                  <DialogContent data-testid="create-order-dialog">
                    <DialogHeader>
                      <DialogTitle>新建单子</DialogTitle>
                      <DialogDescription>填写基础信息后创建单子（金额以“元”输入，内部以“分”存储）。</DialogDescription>
                    </DialogHeader>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="systemName">系统名称</Label>
                        <Input
                          id="systemName"
                          placeholder="例如：官网后台管理"
                          value={createDraft.systemName}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, systemName: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label htmlFor="wechat">微信号</Label>
                        <Input
                          id="wechat"
                          placeholder="wxid_xxx"
                          value={createDraft.wechat}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, wechat: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="username">用户名</Label>
                        <Input
                          id="username"
                          placeholder="客户备注名"
                          value={createDraft.username}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, username: e.target.value }))}
                        />
                      </div>

                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="repoUrl">GitHub 仓库 URL</Label>
                        <Input
                          id="repoUrl"
                          placeholder="https://github.com/user/repo"
                          value={createDraft.repoUrl}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, repoUrl: e.target.value }))}
                        />
                        {createRepoWarning ? <div className="text-xs text-amber-700">{createRepoWarning}</div> : null}
                      </div>

                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="requirementPath">需求文件地址（可选）</Label>
                        <Input
                          id="requirementPath"
                          placeholder="例如：D:\\docs\\需求说明.docx"
                          value={createDraft.requirementPath}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, requirementPath: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label htmlFor="totalBaseYuan">初始总金额（元）</Label>
                        <Input
                          id="totalBaseYuan"
                          placeholder="1999.99"
                          value={createDraft.totalBaseYuan}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, totalBaseYuan: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label>状态</Label>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={createDraft.status === "pending_send" ? "secondary" : "outline"}
                            onClick={() => setCreateDraft((s) => ({ ...s, status: "pending_send" }))}
                          >
                            待发送
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={createDraft.status === "done" ? "secondary" : "outline"}
                            onClick={() => setCreateDraft((s) => ({ ...s, status: "done" }))}
                          >
                            已完成
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={createDraft.status === "canceled" ? "secondary" : "outline"}
                            onClick={() => setCreateDraft((s) => ({ ...s, status: "canceled" }))}
                          >
                            已取消
                          </Button>
                        </div>
                      </div>

                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="techStack">技术栈</Label>
                        <Input
                          id="techStack"
                          placeholder="例如：Tauri, Rust, SQLite"
                          value={createDraft.techStack}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, techStack: e.target.value }))}
                        />
                      </div>

                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="deliverables">交付物</Label>
                        <Input
                          id="deliverables"
                          placeholder="例如：源码、安装包、部署文档"
                          value={createDraft.deliverables}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, deliverables: e.target.value }))}
                        />
                      </div>

                      <div className="col-span-2 grid gap-1.5">
                        <Label htmlFor="note">备注</Label>
                        <Textarea
                          id="note"
                          placeholder="补充信息（可选）"
                          value={createDraft.note}
                          onChange={(e) => setCreateDraft((s) => ({ ...s, note: e.target.value }))}
                        />
                      </div>

                      {createError ? <div className="col-span-2 text-xs text-destructive">{createError}</div> : null}
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" type="button" disabled={isCreating}>
                          取消
                        </Button>
                      </DialogClose>
                      <Button type="button" onClick={createOrder} disabled={isCreating}>
                        {isCreating ? "创建中..." : "创建"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {selected ? (
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {selectedDeleted
                        ? "当前为已删除单子（只读）"
                        : selectedArchived
                          ? `已归档到 ${selected?.archiveMonth ?? "-"}，需先取消归档后才可修改`
                          : "可直接修改状态（自动更新最近更新时间）"}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">状态</div>
                      <Select
                        aria-label="详情状态"
                        value={selected.status}
                        onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                        disabled={selectedLocked}
                        className="w-32"
                      >
                        <option value="pending_send">待发送</option>
                        <option value="done">已完成</option>
                        <option value="canceled">已取消</option>
                      </Select>
                    </div>
                  </div>
                  {selected.archiveMonth ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="text-xs text-muted-foreground">归档月份</div>
                      <Badge variant="outline" className="font-mono">{selected.archiveMonth}</Badge>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
                    <div className="text-xs text-muted-foreground">订单 ID</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate font-mono text-xs">{selected.id}</div>
                      <Button size="sm" variant="outline" onClick={() => copyText("订单 ID", selected.id)}>
                        复制
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">系统名称</div>
                    <div className="font-medium">{selected.systemName}</div>

                    <div className="text-xs text-muted-foreground">微信号</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="font-mono">{selected.wechat}</div>
                      <Button size="sm" variant="outline" onClick={() => copyText("微信号", selected.wechat)}>
                        复制
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">用户名</div>
                    <div>{selected.username}</div>

                    <div className="text-xs text-muted-foreground">GitHub</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        className="truncate text-left font-mono text-xs text-blue-600 hover:underline"
                        onClick={openRepo}
                        title="用默认浏览器打开"
                      >
                        {selected.repoUrl}
                      </button>
                      <Button size="sm" variant="outline" onClick={() => copyText("仓库 URL", selected.repoUrl)}>
                        复制
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">需求文件</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        className={[
                          "truncate text-left font-mono text-xs",
                          selected.requirementPath ? "text-blue-600 hover:underline" : "text-muted-foreground",
                        ].join(" ")}
                        onClick={openRequirementPath}
                        disabled={!selected.requirementPath}
                        title={selected.requirementPath || "未填写"}
                      >
                        {selected.requirementPath || "-"}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText("需求文件地址", selected.requirementPath)}
                        disabled={!selected.requirementPath}
                      >
                        复制
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">技术栈</div>
                    <div className="flex flex-wrap gap-1.5">
                      {techTags.length ? (
                        techTags.map((t) => (
                          <Badge key={t} variant="outline" className="rounded-md">
                            {t}
                          </Badge>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground">-</div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">交付物</div>
                    <div className="text-xs text-muted-foreground">{selected.deliverables || "-"}</div>

                    <div className="text-xs text-muted-foreground">备注</div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{selected.note || "-"}</div>

                    <div className="text-xs text-muted-foreground">总金额</div>
                    <div className="font-mono" data-testid="summary-total-current">{formatCentsToYuan(selected.totalCurrentCents)}</div>

                    <div className="text-xs text-muted-foreground">定金</div>
                    <div className="font-mono" data-testid="summary-deposit">{formatCentsToYuan(selected.depositSumCents)}</div>

                    <div className="text-xs text-muted-foreground">已收</div>
                    <div className="font-mono" data-testid="summary-paid">{formatCentsToYuan(selected.paidSumCents)}</div>

                    <div className="text-xs text-muted-foreground">尾款/多收</div>
                    <div className="font-mono" data-testid="summary-outstanding">
                      {selected.outstandingCents >= 0
                        ? formatCentsToYuan(selected.outstandingCents)
                        : `多收款 ${formatCentsToYuan(-selected.outstandingCents)}`}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">收款流水</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selected && refreshMoney(selected.id).catch((e) => showGlobalError(e, "刷新收款流水失败"))}
                          disabled={selectedDeleted}
                        >
                          刷新
                        </Button>
                        <Button size="sm" onClick={openAddPaymentDialog} disabled={selectedLocked}>
                          新增收款
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border">
                      {payments.length ? (
                        <div className="divide-y">
                          {payments.map((p) => (
                            <div key={p.id} className="flex items-start justify-between gap-3 p-2 text-sm">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-xs text-muted-foreground">{formatDateShort(p.paidAtMs)}</div>
                                  <Badge variant="secondary">{labelPaymentType(p.type)}</Badge>
                                  <div className="font-mono">{formatCentsToYuan(p.amountCents)}</div>
                                </div>
                                {p.note ? (
                                  <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.note}</div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEditPaymentDialog(p)} disabled={selectedLocked}>
                                  编辑
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deletePayment(p)} disabled={selectedLocked}>
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">暂无收款记录</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">金额支持负数（退款）。</div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">金额调整</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selected && refreshMoney(selected.id).catch((e) => showGlobalError(e, "刷新金额调整失败"))}
                          disabled={selectedDeleted}
                        >
                          刷新
                        </Button>
                        <Button size="sm" onClick={openAddAdjustmentDialog} disabled={selectedLocked}>
                          新增调整
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border">
                      {adjustments.length ? (
                        <div className="divide-y">
                          {adjustments.map((a) => (
                            <div key={a.id} className="flex items-start justify-between gap-3 p-2 text-sm">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-xs text-muted-foreground">{formatDateShort(a.atMs)}</div>
                                  <div className="font-mono">{formatCentsToYuan(a.deltaCents)}</div>
                                  {a.reason ? (
                                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{a.reason}</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => deleteAdjustment(a)} disabled={selectedLocked}>
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">暂无金额调整</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">用于记录改价/优惠/补差价等历史。</div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">附件（树状）</div>
                      {selected ? (
                      <Button size="sm" variant="outline" onClick={() => refreshFiles(selected.id)}>
                        刷新
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-md border p-2">
                    {tree.length ? (
                      renderTree(tree)
                    ) : (
                      <div className="text-sm text-muted-foreground">该单子目录暂无文件</div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">点击文件将用系统默认程序打开。</div>
                </div>

                  {debugBox ? (
                    <pre className="mt-4 whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
                      {debugBox}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                  <div className="w-full max-w-md rounded-xl border border-dashed border-primary/20 bg-gradient-to-b from-accent/30 to-transparent p-8 text-center">
                    <div className="text-3xl font-light text-primary/70">←</div>
                    <div className="mt-2 text-base font-semibold">从左侧列表选择一个单子</div>
                    <div className="mt-2 text-sm text-muted-foreground">选中后可查看详情、收款流水、金额调整和附件信息。</div>
                    <div className="mt-4 flex justify-center">
                      <Button variant="ghost" onClick={clearFilters}>
                        清空筛选
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : activeMenu === "stats" ? (
          <div className="p-4">
            <div className="text-sm font-semibold">统计</div>
            <div className="mt-2 text-sm text-muted-foreground">按月份查看归档与净收入，并可一键跳转到单子列表筛选。</div>

            <div className="mt-4 max-w-[900px] rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="statsMonth">月份</Label>
                <Input
                  id="statsMonth"
                  type="month"
                  className="w-[180px]"
                  value={statsMonth}
                  onChange={(e) => setStatsMonth(e.target.value)}
                />
                <Button variant="outline" onClick={() => refreshMonthlySummary(statsMonth).catch((e) => showGlobalError(e, "加载月度收入失败"))}>
                  刷新统计
                </Button>
                <Button variant="ghost" onClick={() => jumpToArchiveMonth(statsMonth)}>
                  打开该月归档单
                </Button>
              </div>

              {monthlySummary ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">归档单数</div>
                    <div className="font-mono">{monthlySummary.archivedOrders}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">当月净收入</div>
                    <div className="font-mono">{formatCentsToYuan(monthlySummary.paidSumCents)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">当月定金</div>
                    <div className="font-mono">{formatCentsToYuan(monthlySummary.depositSumCents)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">该月归档单未结</div>
                    <div className="font-mono">{formatCentsToYuan(monthlySummary.outstandingSumCents)}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">暂未加载月度统计。</div>
              )}

              <div className="mt-2 text-xs text-muted-foreground">
                统计口径：净收入按收款日期分月汇总（含退款冲减）；归档单数按归档月份统计。
              </div>
            </div>

            <div className="mt-4 max-w-[900px] rounded-md border bg-background p-3">
              <div className="text-sm font-semibold">月份归档</div>
              {archiveOverview.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {archiveOverview.map((m) => (
                    <button
                      key={m.month}
                      type="button"
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-accent/40"
                      onClick={() => jumpToArchiveMonth(m.month)}
                    >
                      <div>
                        <div className="font-mono text-sm">{m.month}</div>
                        <div className="text-xs text-muted-foreground">归档 {m.orderCount} 单</div>
                      </div>
                      <span className="text-xs text-muted-foreground">查看</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">暂无归档月份。</div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-sm font-semibold">设置</div>
            <div className="mt-2 text-sm text-muted-foreground">
              运行模式：{tauriRuntime ? "桌面端（Tauri + SQLite）" : "Web Mock（开发演示）"}
            </div>

            {!tauriRuntime ? (
              <div className="mt-4 max-w-[720px] rounded-md border bg-background p-3">
                <div className="text-sm font-semibold">Web Mock 数据</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="mockPersist"
                    type="checkbox"
                    className="h-4 w-4 accent-black"
                    checked={mockPersistEnabled}
                    onChange={(e) => toggleMockPersist(e.target.checked)}
                  />
                  <Label htmlFor="mockPersist">刷新页面仍保留数据（localStorage）</Label>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  关闭后，浏览器刷新/重载会回到示例数据；桌面端不会受影响。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={clearMockState}>
                    清空 Web Mock 数据
                  </Button>
                </div>
              </div>
            ) : null}

            {tauriRuntime ? <div className="mt-4 text-sm text-muted-foreground">备份/恢复（zip）</div> : null}

            {tauriRuntime ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={openBackupsDir}>
                  打开备份目录
                </Button>
                <Button onClick={exportBackup} disabled={isBackupExporting}>
                  {isBackupExporting ? "导出中..." : "导出备份"}
                </Button>
              </div>
            ) : (
              <div className="mt-4 text-xs text-muted-foreground">备份/恢复仅桌面端可用（Web Mock 不生成真实 zip）。</div>
            )}

            {tauriRuntime ? (
              <div className="mt-4 grid max-w-[720px] gap-2">
                <Label htmlFor="backupZipPath">恢复 zip 路径</Label>
                <Input
                  id="backupZipPath"
                  placeholder="例如：D:\\backups\\orderly.backup.123.zip"
                  value={backupZipPath}
                  onChange={(e) => setBackupZipPath(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={importBackup} disabled={isBackupImporting}>
                    {isBackupImporting ? "恢复中..." : "恢复备份"}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  恢复会先把当前 `data/` 重命名为 `data.bak.&lt;ts&gt;/`。
                </div>
                {backupError ? <div className="text-xs text-destructive">{backupError}</div> : null}
              </div>
            ) : null}
            {debugBox ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
                {debugBox}
              </pre>
            ) : null}
          </div>
        )}
      </main>
      </div>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPaymentId ? "编辑收款" : "新增收款"}</DialogTitle>
            <DialogDescription>金额以“元”输入，内部以“分”存储；支持负数（退款）。</DialogDescription>
          </DialogHeader>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="paymentType">类型</Label>
              <Select
                id="paymentType"
                value={paymentDraft.type}
                onChange={(e) => setPaymentDraft((s) => ({ ...s, type: e.target.value as PaymentType }))}
              >
                <option value="deposit">定金</option>
                <option value="final">尾款</option>
                <option value="other">其他</option>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="paymentAmount">金额（元）</Label>
              <Input
                id="paymentAmount"
                value={paymentDraft.amountYuan}
                onChange={(e) => setPaymentDraft((s) => ({ ...s, amountYuan: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="paymentDate">收款日期</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDraft.paidDate}
                onChange={(e) => setPaymentDraft((s) => ({ ...s, paidDate: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="paymentNote">备注（可选）</Label>
              <Textarea
                id="paymentNote"
                value={paymentDraft.note}
                onChange={(e) => setPaymentDraft((s) => ({ ...s, note: e.target.value }))}
              />
            </div>

            {paymentError ? <div className="col-span-2 text-xs text-destructive">{paymentError}</div> : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={isPaymentSaving}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" onClick={savePayment} disabled={isPaymentSaving}>
              {isPaymentSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增金额调整</DialogTitle>
            <DialogDescription>用于记录改价/优惠/补差价等；支持负数。</DialogDescription>
          </DialogHeader>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="adjDelta">调整金额（元）</Label>
              <Input
                id="adjDelta"
                value={adjustmentDraft.deltaYuan}
                onChange={(e) => setAdjustmentDraft((s) => ({ ...s, deltaYuan: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="adjDate">调整日期</Label>
              <Input
                id="adjDate"
                type="date"
                value={adjustmentDraft.atDate}
                onChange={(e) => setAdjustmentDraft((s) => ({ ...s, atDate: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="adjReason">原因（可选）</Label>
              <Textarea
                id="adjReason"
                value={adjustmentDraft.reason}
                onChange={(e) => setAdjustmentDraft((s) => ({ ...s, reason: e.target.value }))}
              />
            </div>

            {adjustmentError ? <div className="col-span-2 text-xs text-destructive">{adjustmentError}</div> : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={isAdjustmentSaving}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" onClick={saveAdjustment} disabled={isAdjustmentSaving}>
              {isAdjustmentSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑单子</DialogTitle>
            <DialogDescription>修改后会更新“最近更新时间”。金额以“元”输入，内部以“分”存储。</DialogDescription>
          </DialogHeader>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editSystemName">系统名称</Label>
              <Input
                id="editSystemName"
                value={editDraft.systemName}
                onChange={(e) => setEditDraft((s) => ({ ...s, systemName: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editWechat">微信号</Label>
              <Input
                id="editWechat"
                value={editDraft.wechat}
                onChange={(e) => setEditDraft((s) => ({ ...s, wechat: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="editUsername">用户名</Label>
              <Input
                id="editUsername"
                value={editDraft.username}
                onChange={(e) => setEditDraft((s) => ({ ...s, username: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editRepoUrl">GitHub 仓库 URL</Label>
              <Input
                id="editRepoUrl"
                value={editDraft.repoUrl}
                onChange={(e) => setEditDraft((s) => ({ ...s, repoUrl: e.target.value }))}
              />
              {editRepoWarning ? <div className="text-xs text-amber-700">{editRepoWarning}</div> : null}
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editRequirementPath">需求文件地址（可选）</Label>
              <Input
                id="editRequirementPath"
                value={editDraft.requirementPath}
                onChange={(e) => setEditDraft((s) => ({ ...s, requirementPath: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editTotalBaseYuan">初始总金额（元）</Label>
              <Input
                id="editTotalBaseYuan"
                value={editDraft.totalBaseYuan}
                onChange={(e) => setEditDraft((s) => ({ ...s, totalBaseYuan: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>状态</Label>
              <Select
                value={editDraft.status}
                onChange={(e) => setEditDraft((s) => ({ ...s, status: e.target.value as OrderStatus }))}
              >
                <option value="pending_send">待发送</option>
                <option value="done">已完成</option>
                <option value="canceled">已取消</option>
              </Select>
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editTechStack">技术栈</Label>
              <Input
                id="editTechStack"
                value={editDraft.techStack}
                onChange={(e) => setEditDraft((s) => ({ ...s, techStack: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editDeliverables">交付物</Label>
              <Input
                id="editDeliverables"
                value={editDraft.deliverables}
                onChange={(e) => setEditDraft((s) => ({ ...s, deliverables: e.target.value }))}
              />
            </div>

            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="editNote">备注</Label>
              <Textarea
                id="editNote"
                value={editDraft.note}
                onChange={(e) => setEditDraft((s) => ({ ...s, note: e.target.value }))}
              />
            </div>

            {editError ? <div className="col-span-2 text-xs text-destructive">{editError}</div> : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={isEditing}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" onClick={saveEdit} disabled={isEditing}>
              {isEditing ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {AgentationToolbar ? (
        <Suspense fallback={null}>
          <AgentationToolbar />
        </Suspense>
      ) : null}
    </>
  );
}
