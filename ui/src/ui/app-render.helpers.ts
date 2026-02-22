import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { t } from "../i18n/index.ts";
import { refreshChat } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import type { AppViewState } from "./app-view-state.ts";
import { OpenClawApp } from "./app.ts";
import { ChatState, loadChatHistory } from "./controllers/chat.ts";
import { icons } from "./icons.ts";
import { iconForTab, pathForTab, titleForTab, type Tab } from "./navigation.ts";
import type { ThemeTransitionContext } from "./theme-transition.ts";
import type { ThemeMode } from "./theme.ts";
import type { SessionsListResult } from "./types.ts";

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

function resolveSidebarChatSessionKey(state: AppViewState): string {
  const snapshot = state.hello?.snapshot as
    | { sessionDefaults?: SessionDefaultsSnapshot }
    | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  return "main";
}

function resetChatStateForSessionSwitch(state: AppViewState, sessionKey: string) {
  state.sessionKey = sessionKey;
  state.chatMessage = "";
  state.chatStream = null;
  (state as unknown as OpenClawApp).chatStreamStartedAt = null;
  state.chatRunId = null;
  (state as unknown as OpenClawApp).resetToolStream();
  (state as unknown as OpenClawApp).resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey,
    lastActiveSessionKey: sessionKey,
  });
}

export function renderTab(state: AppViewState, tab: Tab) {
  const href = pathForTab(tab, state.basePath);
  const isActive = state.tab === tab;
  const collapsed = state.settings.navCollapsed;
  return html`
    <a
      href=${href}
      class="nav-item ${isActive ? "nav-item--active" : ""}"
      @click=${(event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        if (tab === "chat") {
          const mainSessionKey = resolveSidebarChatSessionKey(state);
          if (state.sessionKey !== mainSessionKey) {
            resetChatStateForSessionSwitch(state, mainSessionKey);
            void state.loadAssistantIdentity();
          }
        }
        state.setTab(tab);
      }}
      title=${titleForTab(tab)}
    >
      <span class="nav-item__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
      ${!collapsed ? html`<span class="nav-item__text">${titleForTab(tab)}</span>` : nothing}
    </a>
  `;
}

export function renderChatSessionSelect(state: AppViewState) {
  const mainSessionKey = resolveMainSessionKey(state.hello, state.sessionsResult);
  const sessionOptions = resolveSessionOptions(
    state.sessionKey,
    state.sessionsResult,
    mainSessionKey,
  );
  return html`
    <label class="field chat-controls__session">
      <select
        .value=${state.sessionKey}
        ?disabled=${!state.connected}
        @change=${(e: Event) => {
          const next = (e.target as HTMLSelectElement).value;
          state.sessionKey = next;
          state.chatMessage = "";
          state.chatStream = null;
          (state as unknown as OpenClawApp).chatStreamStartedAt = null;
          state.chatRunId = null;
          (state as unknown as OpenClawApp).resetToolStream();
          (state as unknown as OpenClawApp).resetChatScroll();
          state.applySettings({
            ...state.settings,
            sessionKey: next,
            lastActiveSessionKey: next,
          });
          void state.loadAssistantIdentity();
          syncUrlWithSessionKey(
            state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
            next,
            true,
          );
          void loadChatHistory(state as unknown as ChatState);
        }}
      >
        ${repeat(
          sessionOptions,
          (entry) => entry.key,
          (entry) =>
            html`<option value=${entry.key} title=${entry.key}>
              ${entry.displayName ?? entry.key}
            </option>`,
        )}
      </select>
    </label>
  `;
}

export function renderChatControls(state: AppViewState) {
  const disableThinkingToggle = state.onboarding;
  const disableFocusToggle = state.onboarding;
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const focusActive = state.onboarding ? true : state.settings.chatFocusMode;
  const refreshIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
    </svg>
  `;
  const focusIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 7V4h3"></path>
      <path d="M20 7V4h-3"></path>
      <path d="M4 17v3h3"></path>
      <path d="M20 17v3h-3"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
  return html`
    <div class="chat-controls">
      <button
        class="btn btn--sm btn--icon"
        ?disabled=${state.chatLoading || !state.connected}
        @click=${async () => {
          const app = state as unknown as OpenClawApp;
          app.chatManualRefreshInFlight = true;
          app.chatNewMessagesBelow = false;
          await app.updateComplete;
          app.resetToolStream();
          try {
            await refreshChat(state as unknown as Parameters<typeof refreshChat>[0], {
              scheduleScroll: false,
            });
            app.scrollToBottom({ smooth: true });
          } finally {
            requestAnimationFrame(() => {
              app.chatManualRefreshInFlight = false;
              app.chatNewMessagesBelow = false;
            });
          }
        }}
        title=${t("chat.refreshTitle")}
      >
        ${refreshIcon}
      </button>
      <span class="chat-controls__separator">|</span>
      <button
        class="btn btn--sm btn--icon ${showThinking ? "active" : ""}"
        ?disabled=${disableThinkingToggle}
        @click=${() => {
          if (disableThinkingToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatShowThinking: !state.settings.chatShowThinking,
          });
        }}
        aria-pressed=${showThinking}
        title=${disableThinkingToggle ? t("chat.onboardingDisabled") : t("chat.thinkingToggle")}
      >
        ${icons.brain}
      </button>
      <button
        class="btn btn--sm btn--icon ${focusActive ? "active" : ""}"
        ?disabled=${disableFocusToggle}
        @click=${() => {
          if (disableFocusToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatFocusMode: !state.settings.chatFocusMode,
          });
        }}
        aria-pressed=${focusActive}
        title=${disableFocusToggle ? t("chat.onboardingDisabled") : t("chat.focusToggle")}
      >
        ${focusIcon}
      </button>
    </div>
  `;
}

function resolveMainSessionKey(
  hello: AppViewState["hello"],
  sessions: SessionsListResult | null,
): string | null {
  const snapshot = hello?.snapshot as { sessionDefaults?: SessionDefaultsSnapshot } | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  if (sessions?.sessions?.some((row) => row.key === "main")) {
    return "main";
  }
  return null;
}

/* ── Channel display labels ────────────────────────────── */
const CHANNEL_LABELS: Record<string, string> = {
  bluebubbles: "iMessage",
  telegram: "Telegram",
  discord: "Discord",
  signal: "Signal",
  slack: "Slack",
  whatsapp: "WhatsApp",
  matrix: "Matrix",
  email: "Email",
  sms: "SMS",
};

const KNOWN_CHANNEL_KEYS = Object.keys(CHANNEL_LABELS);

/** Parsed type / context extracted from a session key. */
export type SessionKeyInfo = {
  /** Prefix for typed sessions (Subagent:/Cron:). Empty for others. */
  prefix: string;
  /** Human-readable fallback when no label / displayName is available. */
  fallbackName: string;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse a session key to extract type information and a human-readable
 * fallback display name.  Exported for testing.
 */
export function parseSessionKey(key: string): SessionKeyInfo {
  // ── Main session ─────────────────────────────────
  if (key === "main" || key === "agent:main:main") {
    return { prefix: "", fallbackName: "Main Session" };
  }

  // ── Subagent ─────────────────────────────────────
  if (key.includes(":subagent:")) {
    return { prefix: "Subagent:", fallbackName: "Subagent:" };
  }

  // ── Cron job ─────────────────────────────────────
  if (key.includes(":cron:")) {
    return { prefix: "Cron:", fallbackName: "Cron Job:" };
  }

  // ── Direct chat  (agent:<x>:<channel>:direct:<id>) ──
  const directMatch = key.match(/^agent:[^:]+:([^:]+):direct:(.+)$/);
  if (directMatch) {
    const channel = directMatch[1];
    const identifier = directMatch[2];
    const channelLabel = CHANNEL_LABELS[channel] ?? capitalize(channel);
    return { prefix: "", fallbackName: `${channelLabel} · ${identifier}` };
  }

  // ── Group chat  (agent:<x>:<channel>:group:<id>) ────
  const groupMatch = key.match(/^agent:[^:]+:([^:]+):group:(.+)$/);
  if (groupMatch) {
    const channel = groupMatch[1];
    const channelLabel = CHANNEL_LABELS[channel] ?? capitalize(channel);
    return { prefix: "", fallbackName: `${channelLabel} Group` };
  }

  // ── Channel-prefixed legacy keys (e.g. "bluebubbles:g-…") ──
  for (const ch of KNOWN_CHANNEL_KEYS) {
    if (key === ch || key.startsWith(`${ch}:`)) {
      return { prefix: "", fallbackName: `${CHANNEL_LABELS[ch]} Session` };
    }
  }

  // ── Unknown — return key as-is ───────────────────
  return { prefix: "", fallbackName: key };
}

export function resolveSessionDisplayName(
  key: string,
  row?: SessionsListResult["sessions"][number],
): string {
  const label = row?.label?.trim() || "";
  const displayName = row?.displayName?.trim() || "";
  const { prefix, fallbackName } = parseSessionKey(key);

  const applyTypedPrefix = (name: string): string => {
    if (!prefix) {
      return name;
    }
    const prefixPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*`, "i");
    return prefixPattern.test(name) ? name : `${prefix} ${name}`;
  };

  if (label && label !== key) {
    return applyTypedPrefix(label);
  }
  if (displayName && displayName !== key) {
    return applyTypedPrefix(displayName);
  }
  return fallbackName;
}

function resolveSessionOptions(
  sessionKey: string,
  sessions: SessionsListResult | null,
  mainSessionKey?: string | null,
) {
  const seen = new Set<string>();
  const options: Array<{ key: string; displayName?: string }> = [];

  const resolvedMain = mainSessionKey && sessions?.sessions?.find((s) => s.key === mainSessionKey);
  const resolvedCurrent = sessions?.sessions?.find((s) => s.key === sessionKey);

  // Add main session key first
  if (mainSessionKey) {
    seen.add(mainSessionKey);
    options.push({
      key: mainSessionKey,
      displayName: resolveSessionDisplayName(mainSessionKey, resolvedMain || undefined),
    });
  }

  // Add current session key next
  if (!seen.has(sessionKey)) {
    seen.add(sessionKey);
    options.push({
      key: sessionKey,
      displayName: resolveSessionDisplayName(sessionKey, resolvedCurrent),
    });
  }

  // Add sessions from the result
  if (sessions?.sessions) {
    for (const s of sessions.sessions) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        options.push({
          key: s.key,
          displayName: resolveSessionDisplayName(s.key, s),
        });
      }
    }
  }

  return options;
}

type ThemeOption = { id: ThemeMode; label: string; icon: string };
const THEME_OPTIONS: ThemeOption[] = [
  { id: "dark", label: "Claw", icon: "🦀" },
  { id: "light", label: "Light", icon: "☀️" },
  { id: "openknot", label: "Knot", icon: "🪢" },
  { id: "fieldmanual", label: "Field", icon: "🏕️" },
  { id: "clawdash", label: "Chrome", icon: "💎" },
];

function currentThemeIcon(theme: ThemeMode): string {
  return THEME_OPTIONS.find((o) => o.id === theme)?.icon ?? "🎨";
}

export function renderThemeToggle(state: AppViewState) {
  const toggleOpen = (e: Event) => {
    const orb = (e.currentTarget as HTMLElement).closest(".theme-orb");
    if (!orb) {
      return;
    }
    const isOpen = orb.classList.contains("theme-orb--open");
    if (isOpen) {
      orb.classList.remove("theme-orb--open");
    } else {
      orb.classList.add("theme-orb--open");
      const close = (ev: MouseEvent) => {
        if (!orb.contains(ev.target as Node)) {
          orb.classList.remove("theme-orb--open");
          document.removeEventListener("click", close);
        }
      };
      requestAnimationFrame(() => document.addEventListener("click", close));
    }
  };

  const pick = (opt: ThemeOption, e: Event) => {
    const orb = (e.currentTarget as HTMLElement).closest(".theme-orb");
    orb?.classList.remove("theme-orb--open");
    if (opt.id !== state.theme) {
      const context: ThemeTransitionContext = { element: orb ?? undefined };
      state.setTheme(opt.id, context);
    }
  };

  return html`
    <div class="theme-orb" aria-label="Theme">
      <button
        class="theme-orb__trigger"
        title="Theme"
        @click=${toggleOpen}
      >${currentThemeIcon(state.theme)}</button>
      <div class="theme-orb__menu">
        ${THEME_OPTIONS.map(
          (opt) => html`
            <button
              class="theme-orb__option ${opt.id === state.theme ? "theme-orb__option--active" : ""}"
              title=${opt.label}
              @click=${(e: Event) => pick(opt, e)}
            >${opt.icon}</button>`,
        )}
      </div>
    </div>
  `;
}

/* ── Sidebar Theme Selector ── */

type ThemePreview = {
  id: ThemeMode;
  label: string;
  bg: string;
  sidebar: string;
  accent: string;
  glow: string;
};

const SIDEBAR_THEMES: ThemePreview[] = [
  {
    id: "dark",
    label: "Claw",
    bg: "#040810",
    sidebar: "#06090f",
    accent: "#ca3a29",
    glow: "#00d4aa",
  },
  {
    id: "light",
    label: "Light",
    bg: "#f5f2eb",
    sidebar: "#ddd7cc",
    accent: "#c73526",
    glow: "#1a9e7e",
  },
  {
    id: "openknot",
    label: "Knot",
    bg: "#000000",
    sidebar: "#080808",
    accent: "#a78bfa",
    glow: "#c4b5fd",
  },
  {
    id: "fieldmanual",
    label: "Field",
    bg: "#0e0e0e",
    sidebar: "#121212",
    accent: "#ca3a29",
    glow: "#61d6ff",
  },
  {
    id: "clawdash",
    label: "Chrome",
    bg: "#050507",
    sidebar: "#08080c",
    accent: "#ca3a29",
    glow: "#c0c8d4",
  },
];

function themeSwatchPick(state: AppViewState, theme: ThemePreview, e: Event) {
  if (theme.id !== state.theme) {
    const el = e.currentTarget as HTMLElement;
    state.setTheme(theme.id, { element: el });
  }
}

export function renderSidebarThemeSelector(state: AppViewState) {
  const isCollapsed = state.settings.navCollapsed;
  const current = SIDEBAR_THEMES.find((tp) => tp.id === state.theme) ?? SIDEBAR_THEMES[0];

  if (isCollapsed) {
    const toggleOpen = (e: Event) => {
      const selector = (e.currentTarget as HTMLElement).closest(".theme-selector");
      if (!selector) {
        return;
      }
      const isOpen = selector.classList.contains("theme-selector--open");
      if (isOpen) {
        selector.classList.remove("theme-selector--open");
      } else {
        selector.classList.add("theme-selector--open");
        const close = (ev: MouseEvent) => {
          if (!selector.contains(ev.target as Node)) {
            selector.classList.remove("theme-selector--open");
            document.removeEventListener("click", close);
          }
        };
        requestAnimationFrame(() => document.addEventListener("click", close));
      }
    };

    return html`
      <div class="theme-selector theme-selector--collapsed">
        <button
          class="theme-swatch theme-swatch--current"
          title="${t("common.theme")}: ${current.label}"
          style="--sw-bg:${current.bg};--sw-sidebar:${current.sidebar};--sw-accent:${current.accent};--sw-glow:${current.glow}"
          @click=${toggleOpen}
        ></button>
        <div class="theme-selector__popover">
          ${SIDEBAR_THEMES.map(
            (tp) => html`
              <button
                class="theme-swatch ${tp.id === state.theme ? "theme-swatch--active" : ""}"
                title=${tp.label}
                style="--sw-bg:${tp.bg};--sw-sidebar:${tp.sidebar};--sw-accent:${tp.accent};--sw-glow:${tp.glow}"
                @click=${(e: Event) => {
                  themeSwatchPick(state, tp, e);
                  const sel = (e.currentTarget as HTMLElement).closest(".theme-selector");
                  sel?.classList.remove("theme-selector--open");
                }}
              ></button>
            `,
          )}
        </div>
      </div>
    `;
  }

  return html`
    <div class="theme-selector">
      <div class="theme-selector__swatches">
        ${SIDEBAR_THEMES.map(
          (tp) => html`
            <button
              class="theme-swatch ${tp.id === state.theme ? "theme-swatch--active" : ""}"
              title=${tp.label}
              aria-label="${t("common.theme")}: ${tp.label}"
              aria-pressed=${tp.id === state.theme}
              style="--sw-bg:${tp.bg};--sw-sidebar:${tp.sidebar};--sw-accent:${tp.accent};--sw-glow:${tp.glow}"
              @click=${(e: Event) => themeSwatchPick(state, tp, e)}
            ></button>
          `,
        )}
      </div>
      <span class="theme-selector__current">${current.label}</span>
    </div>
  `;
}
