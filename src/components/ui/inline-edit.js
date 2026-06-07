'use strict';

/**
 * InlineEdit — click-to-edit text field
 *
 * Wraps any element: clicking switches it to an <input> or <textarea>,
 * blurring or pressing Enter commits, Escape cancels.
 *
 * Usage:
 *   const ie = new InlineEdit(el, {
 *     value:    deal.name,
 *     onSave:   async (newVal) => { await api.patch(...); },
 *     type:     'text',        // 'text' | 'number' | 'textarea'
 *     placeholder: 'Add name…',
 *     emptyText:   '—',       // shown when value is empty
 *   });
 *
 *   // Update value programmatically:
 *   ie.setValue('New name');
 *
 *   // Read current value:
 *   ie.getValue();
 */
class InlineEdit {
  constructor(el, {
    value,
    onSave,
    type        = 'text',
    placeholder = 'Click to edit',
    emptyText   = '—',
  } = {}) {
    this._el          = el;
    this._value       = value !== undefined ? String(value) : el.textContent.trim();
    this._onSave      = onSave;
    this._type        = type;
    this._placeholder = placeholder;
    this._emptyText   = emptyText;
    this._editing     = false;

    this._render();
    this._el.addEventListener('click', () => this._startEdit());
  }

  /* ── Public ─────────────────────────────────────────────── */

  getValue() { return this._value; }

  setValue(val) {
    this._value = val !== undefined ? String(val) : '';
    if (!this._editing) this._render();
  }

  /* ── Private ────────────────────────────────────────────── */

  _render() {
    this._el.classList.add('ui-inline-edit');
    if (this._value) {
      this._el.innerHTML =
        `<span class="ui-inline-edit-text">${this._value}</span>`;
    } else {
      this._el.innerHTML =
        `<span class="ui-inline-edit-text ui-inline-edit-empty">${this._emptyText}</span>`;
    }
  }

  _startEdit() {
    if (this._editing) return;
    this._editing = true;
    this._el.classList.add('ui-inline-edit--active');

    const input = this._type === 'textarea'
      ? document.createElement('textarea')
      : document.createElement('input');

    input.className   = 'ui-inline-edit-input';
    input.value       = this._value;
    input.placeholder = this._placeholder;
    if (this._type !== 'textarea') input.type = this._type;

    this._el.innerHTML = '';
    this._el.appendChild(input);

    input.focus();
    /* Move cursor to end */
    const len = input.value.length;
    input.setSelectionRange(len, len);

    const commit = async () => {
      if (!this._editing) return;
      const newVal = input.value.trim();
      this._editing = false;
      this._el.classList.remove('ui-inline-edit--active');

      if (newVal === this._value) { this._render(); return; }

      const prev    = this._value;
      this._value   = newVal;
      this._render();

      if (this._onSave) {
        try {
          await this._onSave(newVal);
        } catch (err) {
          /* Roll back on failure */
          this._value = prev;
          this._render();
          if (window.Toast) Toast.error('Could not save — ' + (err.message || 'please try again'));
        }
      }
    };

    const cancel = () => {
      if (!this._editing) return;
      this._editing = false;
      this._el.classList.remove('ui-inline-edit--active');
      this._render();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this._type !== 'textarea') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
  }
}

window.InlineEdit = InlineEdit;
