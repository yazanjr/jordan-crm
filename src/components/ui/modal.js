'use strict';

/**
 * Modal — reusable overlay container
 *
 * Usage:
 *   const m = new Modal({ title: 'Edit Deal', size: 'md' });
 *   m.setBody('<p>content</p>');
 *   m.setFooter('<button class="ui-btn ui-btn--primary">Save</button>');
 *   m.open();
 *
 * Options:
 *   title           {string}   — header title (HTML allowed)
 *   body            {string}   — body HTML
 *   footer          {string}   — footer HTML (buttons)
 *   size            {string}   — 'sm' | 'md' (default) | 'lg' | 'xl'
 *   closeOnBackdrop {boolean}  — default true
 *   onClose         {function} — called after modal closes
 */
class Modal {
  constructor({
    title = '',
    body = '',
    footer = '',
    size = 'md',
    closeOnBackdrop = true,
    onClose,
  } = {}) {
    this._onClose        = onClose;
    this._closeOnBackdrop = closeOnBackdrop;
    this._el             = null;
    this._keyHandler     = (e) => { if (e.key === 'Escape') this.close(); };
    this._build(title, body, footer, size);
  }

  _build(title, body, footer, size) {
    const el = document.createElement('div');
    el.className = 'ui-modal-wrap';
    el.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal ui-modal--${size}" role="dialog" aria-modal="true">
        <div class="ui-modal-header">
          <span class="ui-modal-title">${title}</span>
          <button class="ui-modal-close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="ui-modal-body">${body}</div>
        ${footer ? `<div class="ui-modal-footer">${footer}</div>` : ''}
      </div>
    `;

    el.querySelector('.ui-modal-close')
      .addEventListener('click', () => this.close());

    if (this._closeOnBackdrop) {
      el.querySelector('.ui-modal-backdrop')
        .addEventListener('click', () => this.close());
    }

    this._el = el;
  }

  open() {
    document.body.appendChild(this._el);
    document.addEventListener('keydown', this._keyHandler);
    requestAnimationFrame(() => this._el.classList.add('ui-modal-wrap--open'));
    return this;
  }

  close() {
    this._el.classList.remove('ui-modal-wrap--open');
    document.removeEventListener('keydown', this._keyHandler);
    setTimeout(() => {
      this._el.remove();
      if (this._onClose) this._onClose();
    }, 180);
  }

  setTitle(html) {
    this._el.querySelector('.ui-modal-title').innerHTML = html;
    return this;
  }

  setBody(html) {
    this._el.querySelector('.ui-modal-body').innerHTML = html;
    return this;
  }

  setFooter(html) {
    let footer = this._el.querySelector('.ui-modal-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'ui-modal-footer';
      this._el.querySelector('.ui-modal').appendChild(footer);
    }
    footer.innerHTML = html;
    return this;
  }

  /* Returns the live DOM node so callers can query/bind inside it */
  getBody()   { return this._el.querySelector('.ui-modal-body'); }
  getFooter() { return this._el.querySelector('.ui-modal-footer'); }
  getEl()     { return this._el; }
}

window.Modal = Modal;
