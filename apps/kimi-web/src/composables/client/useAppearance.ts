// apps/kimi-web/src/composables/client/useAppearance.ts
// Appearance preferences (theme / color scheme / accent / UI font size) and
// the streaming "fast moon" spinner state. Pure local UI state: only touches
// storage + the DOM, never rawState or the API. The values are module-level
// singletons so the whole app shares one instance.

import { ref, watch } from 'vue';
import { safeGetString, safeSetString, STORAGE_KEYS } from '../../lib/storage';

/** UI theme: 'terminal' = dense line look, 'modern' = bubbles everywhere,
    'kimi' = the official Kimi design language. */
export type Theme = 'terminal' | 'modern' | 'kimi';

/** Color scheme: 'light', 'dark', or follow the OS preference ('system'). */
export type ColorScheme = 'light' | 'dark' | 'system';

/** Accent: 'blue' (Kimi blue, default) or 'mono' (black/white). */
export type Accent = 'blue' | 'mono';

/** Preset accent swatches shown in settings. The hex value is applied directly
    to --blue (and derived shades) on :root. */
export const ACCENT_PRESETS: ReadonlyArray<{ id: string; labelKey: string; hex: string }> = [
  { id: 'blue', labelKey: 'settings.accentBlue', hex: '#1783ff' },
  { id: 'green', labelKey: 'settings.accentGreen', hex: '#22c55e' },
  { id: 'purple', labelKey: 'settings.accentPurple', hex: '#8b5cf6' },
  { id: 'orange', labelKey: 'settings.accentOrange', hex: '#f97316' },
  { id: 'pink', labelKey: 'settings.accentPink', hex: '#ec4899' },
  { id: 'teal', labelKey: 'settings.accentTeal', hex: '#14b8a6' },
  { id: 'red', labelKey: 'settings.accentRed', hex: '#ef4444' },
];

const ACCENT_VALUES: readonly string[] = ['blue', 'mono'];
const COLOR_SCHEME_VALUES: readonly string[] = ['light', 'dark', 'system'];
const UI_FONT_SIZE_DEFAULT = 15;
const UI_FONT_SIZE_MIN = 12;
const UI_FONT_SIZE_MAX = 20;

function loadAccent(): Accent {
  const v = safeGetString(STORAGE_KEYS.accent);
  if (v && ACCENT_VALUES.includes(v)) return v as Accent;
  return 'blue';
}

function applyAccent(a: Accent): void {
  if (typeof document === undefined || !document.documentElement) return;
  document.documentElement.dataset.accent = a;
}

// ---------------------------------------------------------------------------
// Custom accent color: when the user picks a specific hex colour, we override
// the --blue / --blue2 / --soft / --bd CSS custom properties directly on
// :root (inline style beats the stylesheet [data-accent] rules).  Pass null
// (or an empty string) to clear the override and fall back to blue/mono.
// ---------------------------------------------------------------------------

/** Validate a hex colour string to #RRGGBB (or #RGB shorthand). Returns
    the canonical 6-digit form, or null when the input is invalid / empty. */
function normalizeHex(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  return null;
}

function loadCustomAccent(): string | null {
  return normalizeHex(safeGetString(STORAGE_KEYS.customAccent));
}

function applyCustomAccent(hex: string | null): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty('--blue');
    root.style.removeProperty('--blue2');
    root.style.removeProperty('--soft');
    root.style.removeProperty('--bd');
    root.style.removeProperty('--bluebg');
    root.style.removeProperty('--accent');
    return;
  }
  // Derive shades with color-mix so derived tokens (hover, fill, border)
  // stay perceptually consistent regardless of the chosen hue.
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--blue', hex);
  root.style.setProperty('--blue2', `color-mix(in srgb, ${hex} 80%, black)`);
  root.style.setProperty('--soft', `color-mix(in srgb, ${hex} 12%, var(--bg))`);
  root.style.setProperty('--bd', `color-mix(in srgb, ${hex} 30%, transparent)`);
  root.style.setProperty('--bluebg', `color-mix(in srgb, ${hex} 8%, var(--bg))`);
}

function loadColorScheme(): ColorScheme {
  const v = safeGetString(STORAGE_KEYS.colorScheme);
  if (v && COLOR_SCHEME_VALUES.includes(v)) return v as ColorScheme;
  return 'system';
}

function applyColorScheme(c: ColorScheme): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.dataset.colorScheme = c;

  // Mobile browser chrome (status/address bar) follows <meta name=theme-color>.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) return;
  const pinned = c === 'dark' ? '#0d1117' : c === 'light' ? '#ffffff' : null;
  metas.forEach((meta) => {
    const media = meta.getAttribute('media') ?? '';
    const systemValue = media.includes('dark') ? '#0d1117' : '#ffffff';
    meta.setAttribute('content', pinned ?? systemValue);
  });
}

function loadTheme(): Theme {
  const v = safeGetString(STORAGE_KEYS.theme);
  if (v === 'terminal' || v === 'modern' || v === 'kimi') return v;
  return 'modern';
}

function applyTheme(t: Theme): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.dataset.theme = t;
}

function clampUiFontSize(value: number): number {
  if (!Number.isFinite(value)) return UI_FONT_SIZE_DEFAULT;
  return Math.min(UI_FONT_SIZE_MAX, Math.max(UI_FONT_SIZE_MIN, Math.round(value)));
}

function loadUiFontSize(): number {
  const v = safeGetString(STORAGE_KEYS.uiFontSize);
  return v === null ? UI_FONT_SIZE_DEFAULT : clampUiFontSize(Number(v));
}

function applyUiFontSize(value: number): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.style.setProperty('--ui-font-size', `${clampUiFontSize(value)}px`);
}

const theme = ref<Theme>(loadTheme());
const colorScheme = ref<ColorScheme>(loadColorScheme());
const accent = ref<Accent>(loadAccent());
const customAccent = ref<string | null>(loadCustomAccent());
const uiFontSize = ref<number>(loadUiFontSize());

watch(theme, applyTheme, { immediate: true });
watch(colorScheme, applyColorScheme, { immediate: true });
watch(accent, applyAccent, { immediate: true });
watch(customAccent, applyCustomAccent, { immediate: true });
watch(uiFontSize, applyUiFontSize, { immediate: true });

function setTheme(t: Theme): void {
  if (t !== 'terminal' && t !== 'modern' && t !== 'kimi') return;
  theme.value = t;
  safeSetString(STORAGE_KEYS.theme, t);
}

function toggleTheme(): void {
  setTheme(theme.value === 'modern' ? 'terminal' : 'modern');
}

function setColorScheme(c: ColorScheme): void {
  if (!COLOR_SCHEME_VALUES.includes(c)) return;
  colorScheme.value = c;
  safeSetString(STORAGE_KEYS.colorScheme, c);
}

function setAccent(a: Accent): void {
  if (!ACCENT_VALUES.includes(a)) return;
  accent.value = a;
  safeSetString(STORAGE_KEYS.accent, a);
}

/** Set a custom accent hex colour. Pass null/empty to clear and revert to the
    built-in blue/mono accent. Invalid values are silently rejected. */
function setCustomAccent(hex: string | null): void {
  const normalized = normalizeHex(hex);
  if (hex !== null && hex !== '' && normalized === null) return; // invalid — ignore
  customAccent.value = normalized;
  if (normalized) safeSetString(STORAGE_KEYS.customAccent, normalized);
  else {
    try { globalThis.localStorage.removeItem(STORAGE_KEYS.customAccent); } catch { /* ignore */ }
  }
}

function setUiFontSize(value: number): void {
  const next = clampUiFontSize(value);
  uiFontSize.value = next;
  safeSetString(STORAGE_KEYS.uiFontSize, String(next));
}

// CSS handles the moon frames; this only flips the spinner between normal and
// fast classes when the active session is visibly producing content quickly.
const MOON_FAST_WINDOW_MS = 600;
const MOON_FAST_MIN_ELAPSED_MS = 250;
const MOON_FAST_CHECK_INTERVAL_MS = 250;
const MOON_FAST_HOLD_MS = 1000;
const MOON_FAST_CHARS_PER_SECOND = 160;

type MoonSpeedSample = { time: number; chars: number };

const fastMoon = ref(false);
let moonSpeedSamples: MoonSpeedSample[] = [];
let moonFastResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastMoonFastCheckAt = -MOON_FAST_CHECK_INTERVAL_MS;

function resetFastMoon(): void {
  moonSpeedSamples = [];
  lastMoonFastCheckAt = -MOON_FAST_CHECK_INTERVAL_MS;
  fastMoon.value = false;
  if (moonFastResetTimer !== null) {
    clearTimeout(moonFastResetTimer);
    moonFastResetTimer = null;
  }
}

function holdFastMoon(): void {
  fastMoon.value = true;
  if (moonFastResetTimer !== null) clearTimeout(moonFastResetTimer);
  moonFastResetTimer = setTimeout(() => {
    moonFastResetTimer = null;
    moonSpeedSamples = [];
    lastMoonFastCheckAt = -MOON_FAST_CHECK_INTERVAL_MS;
    fastMoon.value = false;
  }, MOON_FAST_HOLD_MS);
}

function recordMoonDelta(chars: number): void {
  if (chars <= 0) return;
  const now = Date.now();
  moonSpeedSamples.push({ time: now, chars });
  const cutoff = now - MOON_FAST_WINDOW_MS;
  moonSpeedSamples = moonSpeedSamples.filter((s) => s.time >= cutoff);

  if (now - lastMoonFastCheckAt < MOON_FAST_CHECK_INTERVAL_MS) return;
  lastMoonFastCheckAt = now;

  const oldest = moonSpeedSamples[0]?.time ?? now;
  const elapsed = Math.max(now - oldest, MOON_FAST_MIN_ELAPSED_MS);
  const totalChars = moonSpeedSamples.reduce((sum, s) => sum + s.chars, 0);
  const charsPerSecond = (totalChars / elapsed) * 1000;
  if (charsPerSecond >= MOON_FAST_CHARS_PER_SECOND) holdFastMoon();
}

export function useAppearance() {
  return {
    theme,
    colorScheme,
    accent,
    customAccent,
    uiFontSize,
    fastMoon,
    setTheme,
    toggleTheme,
    setColorScheme,
    setAccent,
    setCustomAccent,
    setUiFontSize,
    resetFastMoon,
    recordMoonDelta,
  };
}
