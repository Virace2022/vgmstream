const STORAGE_KEY = 'vgmstream-pages-locale';
const DEFAULT_LOCALE = 'zh-CN';

export function normalizeLocale(value) {
  const locale = String(value ?? '').trim().toLowerCase();
  if (locale.startsWith('en')) {
    return 'en';
  }
  return DEFAULT_LOCALE;
}

export function getPreferredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function savePreferredLocale(locale) {
  const normalized = normalizeLocale(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures and keep the page functional.
  }
  return normalized;
}

export function applyTextTranslations(locale, dictionary) {
  const messages = dictionary[normalizeLocale(locale)] ?? dictionary[DEFAULT_LOCALE] ?? {};

  if (messages.__title) {
    document.title = messages.__title;
  }

  for (const element of document.querySelectorAll('[data-locale-key]')) {
    const key = element.dataset.localeKey;
    const value = messages[key];
    if (typeof value !== 'string') {
      continue;
    }

    if (element.dataset.localeHtml === 'true') {
      element.innerHTML = value;
      continue;
    }

    element.textContent = value;
  }
}

export function syncLocalePanels(locale) {
  const normalized = normalizeLocale(locale);

  for (const element of document.querySelectorAll('[data-locale-panel]')) {
    element.hidden = element.dataset.localePanel !== normalized;
  }
}

function updateLocaleButtons(buttons, locale) {
  for (const button of buttons) {
    const active = normalizeLocale(button.dataset.locale) === locale;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-active', active);
  }
}

export function createLocaleController({ onChange } = {}) {
  const buttons = Array.from(document.querySelectorAll('[data-role="locale-switcher"] [data-locale]'));
  let currentLocale = getPreferredLocale();

  const controller = {
    apply(locale = currentLocale) {
      currentLocale = savePreferredLocale(locale);
      document.documentElement.lang = currentLocale;
      updateLocaleButtons(buttons, currentLocale);
      onChange?.(currentLocale);
      return currentLocale;
    },
    getLocale() {
      return currentLocale;
    },
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      controller.apply(button.dataset.locale);
    });
  }

  controller.apply(currentLocale);
  return controller;
}
