'use strict';

/**
 * Toast — lightweight notification stack
 *
 * Usage:
 *   Toast.success('Deal saved!');
 *   Toast.error('Something went wrong.');
 *   Toast.warning('Connection slow.');
 *   Toast.info('Filters applied.');
 *
 * Options (second arg):
 *   duration  {number}  ms before auto-dismiss (default varies by type)
 */
const Toast = (() => {

  let _container = null;

  const ICONS = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>`,
  };

  const CLOSE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>`;

  function _getContainer() {
    if (!_container || !document.body.contains(_container)) {
      _container = document.createElement('div');
      _container.className = 'ui-toast-container';
      document.body.appendChild(_container);
    }
    return _container;
  }

  function _show(message, type, duration) {
    const c = _getContainer();

    const toast = document.createElement('div');
    toast.className = `ui-toast ui-toast--${type}`;
    toast.innerHTML = `
      <span class="ui-toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="ui-toast-msg">${message}</span>
      <button class="ui-toast-close" aria-label="Dismiss">${CLOSE_ICON}</button>
    `;
    c.appendChild(toast);

    /* Animate in */
    requestAnimationFrame(() => toast.classList.add('ui-toast--visible'));

    let timer;

    const dismiss = () => {
      clearTimeout(timer);
      toast.classList.remove('ui-toast--visible');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.ui-toast-close').addEventListener('click', dismiss);

    /* Pause on hover, resume on leave */
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1400); });

    timer = setTimeout(dismiss, duration);

    return { dismiss };
  }

  return {
    success: (msg, duration = 3000)  => _show(msg, 'success', duration),
    error:   (msg, duration = 4500)  => _show(msg, 'error',   duration),
    warning: (msg, duration = 3500)  => _show(msg, 'warning', duration),
    info:    (msg, duration = 3000)  => _show(msg, 'info',    duration),
  };

})();

window.Toast = Toast;
