export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __tintalataInstallPrompt?: BeforeInstallPromptEvent | null;
    __tintalataInstalled?: boolean;
  }
}

let listenersInitialized = false;

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(window.__tintalataInstalled) ||
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    Boolean((window.navigator as { standalone?: boolean }).standalone)
  );
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__tintalataInstallPrompt || null;
}

export function initPwaInstallListeners(): void {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Ignore service worker registration errors in unsupported contexts
    });
  }

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    window.__tintalataInstallPrompt = ev as BeforeInstallPromptEvent;
    window.__tintalataInstalled = false;
    window.dispatchEvent(new Event('tintalata:install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    window.__tintalataInstallPrompt = null;
    window.__tintalataInstalled = true;
    window.dispatchEvent(new Event('tintalata:app-installed'));
  });
}

function waitForInstallPrompt(timeoutMs = 1800): Promise<BeforeInstallPromptEvent | null> {
  const existing = getDeferredInstallPrompt();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (prompt: BeforeInstallPromptEvent | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('tintalata:install-ready', onReady);
      window.removeEventListener('beforeinstallprompt', onNative);
      resolve(prompt);
    };

    const onReady = () => {
      const prompt = getDeferredInstallPrompt();
      if (prompt) finish(prompt);
    };
    const onNative = (ev: Event) => {
      ev.preventDefault();
      window.__tintalataInstallPrompt = ev as BeforeInstallPromptEvent;
      finish(ev as BeforeInstallPromptEvent);
    };

    const timer = window.setTimeout(() => finish(getDeferredInstallPrompt()), timeoutMs);
    window.addEventListener('tintalata:install-ready', onReady);
    window.addEventListener('beforeinstallprompt', onNative);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.catch(() => {});
    }
  });
}

export type DirectInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export async function promptDirectInstall(): Promise<DirectInstallOutcome> {
  if (isPwaStandalone()) {
    return 'accepted';
  }

  let promptEvent = getDeferredInstallPrompt();
  if (!promptEvent) {
    promptEvent = await waitForInstallPrompt(1800);
  }
  if (!promptEvent) {
    return 'unavailable';
  }

  window.__tintalataInstallPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      window.__tintalataInstalled = true;
      window.dispatchEvent(new Event('tintalata:app-installed'));
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'dismissed';
  }
}
