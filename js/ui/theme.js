/**
 * DEVNET — Apple Theme Manager
 * Dark / Light mode switching, system preference detection & localStorage persistence.
 */

export class ThemeManager {
  constructor() {
    this.html = document.documentElement;
    this.toggleBtn = document.getElementById('theme-toggle-btn');
    this.storageKey = 'devnet_theme_preference';

    this._initTheme();
    this._bindEvents();
  }

  _initTheme() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved === 'dark' || saved === 'light') {
      this.setTheme(saved);
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light');
    }
  }

  _bindEvents() {
    this.toggleBtn?.addEventListener('click', () => {
      const current = this.html.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      this.setTheme(next);
      localStorage.setItem(this.storageKey, next);
    });

    // Listen to OS theme changes if user hasn't explicitly overridden
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.storageKey)) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  setTheme(theme) {
    this.html.setAttribute('data-theme', theme);
  }
}

