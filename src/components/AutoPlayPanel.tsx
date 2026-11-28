import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

type EngineStatus = {
  [key: string]: unknown;
  account?: { username?: string; balance?: number | string; connected?: boolean };
  online?: boolean;
  status?: string;
  username?: string;
  balance?: number | string;
  connected?: boolean;
  authenticated?: boolean;
  loggedIn?: boolean;
  running?: boolean;
  mode?: string;
  engineMode?: string;
  step?: number | string;
  currentStep?: number | string;
  group?: number | string;
  currentGroup?: number | string;
  logs?: Array<string | { message?: string; time?: string; timestamp?: string }>;
};

type AutoPlaySettings = {
  betSteps: string;
  groups: Array<{ startLayer: string; slLimit: string }>;
  takeProfit: string;
  stopLoss: string;
};

type Account = { username: string; balance?: number | string };

const DEFAULT_ENDPOINT = "http://155.94.246.104:3005";
const ENDPOINT_KEY = "autoyield.vps-endpoint.v1";
const SETTINGS_KEY = "autoyield.autoplay-settings.v1";
const DEFAULT_SETTINGS: AutoPlaySettings = {
  betSteps: "100, 200, 400, 800, 1600, 3200, 6400, 12800",
  groups: [
    { startLayer: "1", slLimit: "3" },
    { startLayer: "2", slLimit: "3" },
    { startLayer: "3", slLimit: "2" },
  ],
  takeProfit: "5000",
  stopLoss: "20000",
};

function readSettings(): AutoPlaySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "null",
    ) as Partial<AutoPlaySettings> | null;
    if (!value) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      groups:
        Array.isArray(value.groups) && value.groups.length === 3
          ? value.groups.map((group, index) => ({ ...DEFAULT_SETTINGS.groups[index], ...group }))
          : DEFAULT_SETTINGS.groups,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function validateEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Use an HTTP or HTTPS URL.");
  if (url.username || url.password)
    throw new Error("Do not include credentials in the endpoint URL.");
  if (url.search || url.hash)
    throw new Error("Enter the endpoint base URL without a query or fragment.");
  return value.trim().replace(/\/+$/, "");
}

function responseMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested =
    record["data"] && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : null;
  const message = record["error"] ?? record["message"] ?? nested?.["error"] ?? nested?.["message"];
  return typeof message === "string" ? message : null;
}

async function callVps(endpoint: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    credentials: "omit",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok)
    throw new Error(responseMessage(payload) ?? `VPS request failed (${response.status})`);
  if (
    payload &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>)["success"] === false
  ) {
    throw new Error(responseMessage(payload) ?? "The VPS rejected the request.");
  }
  return payload;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-white/70">
      <span>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-white/15 bg-[#0A0A0C] px-3 text-sm text-[#FFFFFF] outline-none transition focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/25"
      />
    </label>
  );
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#141418] p-4 shadow-[0_12px_30px_-24px_rgba(255,85,0,0.6)] sm:p-5">
      {eyebrow && (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#FF5500]">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-base font-bold uppercase tracking-[0.12em] text-white">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function AutoPlayPanel() {
  const queryClient = useQueryClient();
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [endpointDraft, setEndpointDraft] = useState(DEFAULT_ENDPOINT);
  const [endpointReady, setEndpointReady] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AutoPlaySettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [engineMessage, setEngineMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedEndpoint = window.localStorage.getItem(ENDPOINT_KEY);
      if (savedEndpoint) {
        const validEndpoint = validateEndpoint(savedEndpoint);
        setEndpoint(validEndpoint);
        setEndpointDraft(validEndpoint);
      } else {
        window.localStorage.setItem(ENDPOINT_KEY, DEFAULT_ENDPOINT);
      }
    } catch {
      setEndpointError("Saved endpoint is invalid. Enter a valid URL to continue.");
    }
    setEndpointReady(true);
    setSettings(readSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Settings remain usable for the current session if storage is unavailable.
    }
  }, [settings, settingsReady]);

  const endpointIsHttps = useMemo(() => {
    try {
      return new URL(endpoint).protocol === "https:";
    } catch {
      return false;
    }
  }, [endpoint]);
  const browserOriginIsHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const canPollEndpoint = endpointIsHttps || !browserOriginIsHttps;

  const statusQuery = useQuery<EngineStatus>({
    queryKey: ["vps-status", endpoint],
    queryFn: async ({ signal }) => {
      const payload = await callVps(endpoint, "/api/status", { signal });
      const record =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      return (
        record["data"] && typeof record["data"] === "object" ? record["data"] : record
      ) as EngineStatus;
    },
    enabled: endpointReady && canPollEndpoint,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!endpointIsHttps)
        throw new Error("HTTPS is required before sending account credentials.");
      if (!username.trim() || !password) throw new Error("Enter both game username and password.");
      const payload = await callVps(endpoint, "/api/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const record =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const nested =
        record["data"] && typeof record["data"] === "object"
          ? (record["data"] as Record<string, unknown>)
          : record;
      const balance = nested["balance"];
      return {
        username: String(nested["username"] ?? nested["gameUsername"] ?? username.trim()),
        ...(typeof balance === "number" || typeof balance === "string" ? { balance } : {}),
      } satisfies Account;
    },
    onSuccess: (connectedAccount) => {
      setAccount(connectedAccount);
      setPassword("");
      setAccountMessage("Account connected.");
      void queryClient.invalidateQueries({ queryKey: ["vps-status", endpoint] });
    },
    onError: (error) =>
      setAccountMessage(error instanceof Error ? error.message : "Unable to connect account."),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (!endpointIsHttps) throw new Error("HTTPS is required for account controls.");
      await callVps(endpoint, "/api/logout", { method: "POST", body: JSON.stringify({}) });
    },
    onSuccess: () => {
      setAccount(null);
      setUsername("");
      setPassword("");
      setAccountMessage("Account logged out.");
      void queryClient.invalidateQueries({ queryKey: ["vps-status", endpoint] });
    },
    onError: (error) =>
      setAccountMessage(error instanceof Error ? error.message : "Unable to log out."),
  });

  const engineMutation = useMutation({
    mutationFn: async (action: "start" | "stop") => {
      if (!endpointIsHttps) throw new Error("HTTPS is required for engine controls.");
      let body: Record<string, unknown> = {};
      if (action === "start") {
        const rawBetSteps = settings.betSteps.split(",").map((value) => value.trim());
        const betSteps = rawBetSteps.map(Number);
        const groups = settings.groups.map((group, index) => ({
          group: index + 1,
          startLayer: Number(group.startLayer),
          slLimit: Number(group.slLimit),
        }));
        const takeProfit = Number(settings.takeProfit);
        const stopLoss = Number(settings.stopLoss);
        const validNumbers = [
          ...betSteps,
          ...groups.flatMap((group) => [group.startLayer, group.slLimit]),
          takeProfit,
          stopLoss,
        ];
        if (
          rawBetSteps.length === 0 ||
          rawBetSteps.some((value) => value === "") ||
          validNumbers.some((value) => !Number.isFinite(value) || value <= 0)
        ) {
          throw new Error(
            "Enter positive numeric bet steps, group limits, take profit, and stop loss.",
          );
        }
        body = { betSteps, groups, takeProfit, stopLoss };
      }
      return callVps(endpoint, `/api/${action}`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (_, action) => {
      setEngineMessage(action === "start" ? "Auto play started." : "Auto play stopped.");
      void queryClient.invalidateQueries({ queryKey: ["vps-status", endpoint] });
    },
    onError: (error) =>
      setEngineMessage(error instanceof Error ? error.message : "Engine request failed."),
  });

  const status = statusQuery.data;
  const statusAccount = status?.account;
  const vpsOnline =
    statusQuery.isSuccess &&
    status?.online !== false &&
    String(status?.status ?? "").toUpperCase() !== "OFFLINE";
  const accountConnected = Boolean(
    account ||
    status?.authenticated ||
    status?.loggedIn ||
    statusAccount?.connected ||
    statusAccount?.username ||
    status?.username,
  );
  const shownUsername = account?.username ?? statusAccount?.username ?? status?.username;
  const shownBalance = statusAccount?.balance ?? status?.balance ?? account?.balance;
  const mode = String(
    status?.engineMode ?? status?.mode ?? (status?.running ? "BETTING" : "IDLE"),
  ).toUpperCase();
  const isRunning =
    Boolean(status?.running) || (mode !== "IDLE" && mode !== "STOPPED" && mode !== "OFFLINE");
  const step = status?.currentStep ?? status?.step ?? "—";
  const group = status?.currentGroup ?? status?.group ?? "—";
  const logs = Array.isArray(status?.logs) ? status.logs.slice(-60) : [];

  const saveEndpoint = () => {
    try {
      const validEndpoint = validateEndpoint(endpointDraft);
      setEndpoint(validEndpoint);
      setEndpointDraft(validEndpoint);
      window.localStorage.setItem(ENDPOINT_KEY, validEndpoint);
      setEndpointError(null);
      setEditingEndpoint(false);
    } catch (error) {
      setEndpointError(error instanceof Error ? error.message : "Enter a valid HTTP or HTTPS URL.");
    }
  };

  const updateGroup = (index: number, key: "startLayer" | "slLimit", value: string) => {
    setSettings((current) => ({
      ...current,
      groups: current.groups.map((groupSetting, groupIndex) =>
        groupIndex === index ? { ...groupSetting, [key]: value } : groupSetting,
      ),
    }));
  };

  return (
    <div className="flex flex-col gap-4 pb-5">
      <Card title="VPS connection" eyebrow="Auto play">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${vpsOnline ? "border-[#FF5500]/40 bg-[#FF5500]/10 text-[#FF5500]" : "border-white/15 bg-[#0A0A0C] text-white/60"}`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`size-2 rounded-full ${vpsOnline ? "bg-[#FF5500]" : "bg-white/40"}`}
              aria-hidden="true"
            />
            VPS: {vpsOnline ? "ONLINE" : "OFFLINE"}
          </span>
          <button
            type="button"
            onClick={() => {
              setEndpointDraft(endpoint);
              setEditingEndpoint((value) => !value);
              setEndpointError(null);
            }}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#FF5500] hover:text-[#FF5500]"
          >
            {editingEndpoint ? "Cancel" : "Edit URL"}
          </button>
        </div>
        <p className="break-all font-mono text-xs text-white/60">{endpoint}</p>
        <p className="text-[11px] text-white/60">
          The VPS must serve the requested API routes and allow CORS from this app&apos;s origin.
        </p>
        {!endpointIsHttps && (
          <p className="rounded-lg border border-[#FF5500]/35 bg-[#FF5500]/10 p-3 text-xs leading-relaxed text-white/80">
            Secure browsers block HTTP VPS requests from this HTTPS app. Use an HTTPS tunnel for
            status polling and controls. Credentials and betting commands are never sent over plain
            HTTP.
          </p>
        )}
        {editingEndpoint && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="vps-endpoint">
              VPS endpoint URL
            </label>
            <input
              id="vps-endpoint"
              value={endpointDraft}
              onChange={(event) => setEndpointDraft(event.target.value)}
              placeholder="https://your-tunnel.example"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0A0A0C] px-3 text-sm text-white outline-none focus:border-[#FF5500]"
            />
            <button
              type="button"
              onClick={saveEndpoint}
              className="min-h-11 rounded-lg bg-[#FF5500] px-4 text-xs font-bold uppercase tracking-wider text-white"
            >
              Save URL
            </button>
          </div>
        )}
        {endpointError && (
          <p className="text-xs font-semibold text-[#FF5500]" role="alert">
            {endpointError}
          </p>
        )}
        {statusQuery.isError && (
          <p className="text-xs text-white/60">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : "Status request failed. Check the URL and VPS CORS settings."}
          </p>
        )}
      </Card>

      <Card title="Game account" eyebrow="Secure sign-in">
        {accountConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0A0A0C] p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                Logged in as
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {shownUsername || "Connected account"}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#FF5500]">
                Account balance
              </p>
              <p className="font-mono text-xl font-bold tabular-nums text-white">
                {shownBalance ?? "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={!endpointIsHttps || logoutMutation.isPending}
              className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
            >
              {logoutMutation.isPending ? "Logging out…" : "Switch / Logout"}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              loginMutation.mutate();
            }}
            className="flex flex-col gap-3"
          >
            <Field label="Game Username" value={username} onChange={setUsername} />
            <Field label="Game Password" value={password} onChange={setPassword} type="password" />
            <button
              type="submit"
              disabled={
                !endpointIsHttps || !username.trim() || !password || loginMutation.isPending
              }
              className="min-h-12 rounded-xl bg-[#FF5500] px-4 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#FF5500]/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loginMutation.isPending ? "Connecting…" : "Connect Account"}
            </button>
          </form>
        )}
        {accountMessage && (
          <p className="text-xs text-white/70" role="status">
            {accountMessage}
          </p>
        )}
      </Card>

      <Card title="Bet amount & risk management" eyebrow="Martingale configuration">
        <Field
          label="Bet steps — comma separated"
          value={settings.betSteps}
          onChange={(value) => setSettings((current) => ({ ...current, betSteps: value }))}
        />
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-white/70">
            Multi-group layer & SL settings
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {settings.groups.map((groupSetting, index) => (
              <fieldset
                key={index}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-[#0A0A0C] p-2"
              >
                <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-[#FF5500]">
                  Group {index + 1}
                </legend>
                <Field
                  label="Start layer"
                  type="number"
                  min="1"
                  step="1"
                  value={groupSetting.startLayer}
                  onChange={(value) => updateGroup(index, "startLayer", value)}
                />
                <Field
                  label="SL limit"
                  type="number"
                  min="1"
                  step="1"
                  value={groupSetting.slLimit}
                  onChange={(value) => updateGroup(index, "slLimit", value)}
                />
              </fieldset>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Take profit"
            type="number"
            min="1"
            step="1"
            value={settings.takeProfit}
            onChange={(value) => setSettings((current) => ({ ...current, takeProfit: value }))}
          />
          <Field
            label="Stop loss"
            type="number"
            min="1"
            step="1"
            value={settings.stopLoss}
            onChange={(value) => setSettings((current) => ({ ...current, stopLoss: value }))}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-white/60">
          Betting can lose funds quickly, especially with progressive stakes. Set limits you can
          afford to lose and verify the VPS engine behavior before enabling it.
        </p>
      </Card>

      <Card title="Engine control" eyebrow="Live VPS logs">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-[#0A0A0C] p-3">
            <p className="text-[10px] font-bold uppercase text-white/60">Mode</p>
            <p className="mt-1 truncate font-display text-sm font-bold text-[#FF5500]">{mode}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0A0A0C] p-3">
            <p className="text-[10px] font-bold uppercase text-white/60">Step</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{step}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0A0A0C] p-3">
            <p className="text-[10px] font-bold uppercase text-white/60">Group</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{group}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => engineMutation.mutate(isRunning ? "stop" : "start")}
          disabled={!endpointIsHttps || !accountConnected || !vpsOnline || engineMutation.isPending}
          className={`min-h-14 w-full rounded-xl px-4 font-display text-sm font-black uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40 ${isRunning ? "bg-white text-[#0A0A0C] hover:bg-white/90" : "bg-[#FF5500] text-white hover:bg-[#FF5500]/90"}`}
        >
          {engineMutation.isPending ? "Sending…" : isRunning ? "Stop Auto Play" : "Start Auto Play"}
        </button>
        {engineMessage && (
          <p className="text-xs text-white/70" role="status">
            {engineMessage}
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0A0A0C]">
          <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            VPS execution logs
          </div>
          <div
            className="max-h-56 min-h-24 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-white/70"
            role="log"
            aria-live="polite"
          >
            {logs.length ? (
              logs.map((entry, index) => {
                const line =
                  typeof entry === "string"
                    ? entry
                    : `${entry.time ?? entry.timestamp ?? ""} ${entry.message ?? JSON.stringify(entry)}`;
                return (
                  <p key={`${index}-${line}`} className="break-words">
                    {line}
                  </p>
                );
              })
            ) : (
              <p className="text-white/50">
                {statusQuery.isSuccess ? "No execution logs reported." : "Waiting for VPS status…"}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
