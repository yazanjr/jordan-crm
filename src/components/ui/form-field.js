'use strict';

/**
 * FormField — generates labelled form field HTML strings
 *
 * Every method returns an HTML string. Inject into a form with innerHTML
 * or insertAdjacentHTML, then query the input by [name] or #ff-<name>.
 *
 * Usage:
 *   form.innerHTML = `
 *     <div class="ui-form-grid ui-form-grid--2">
 *       ${FormField.text({ label: 'Project Name', name: 'name', required: true })}
 *       ${FormField.select({ label: 'Stage', name: 'stage', options: STAGES })}
 *     </div>
 *     ${FormField.currency({ label: 'Value', name: 'value', currency: 'JOD' })}
 *     ${FormField.textarea({ label: 'Notes', name: 'notes', rows: 4 })}
 *   `;
 */
const FormField = (() => {

  function _wrap(label, name, inputHtml, required = false, hint = '') {
    return `
      <div class="ui-field">
        ${label
          ? `<label class="ui-field-label" for="ff-${name}">
               ${label}${required ? '<span class="ui-field-required">*</span>' : ''}
             </label>`
          : ''}
        ${inputHtml}
        ${hint ? `<span class="ui-field-hint">${hint}</span>` : ''}
      </div>`;
  }

  function _attrs({ required, disabled, id, name } = {}) {
    return [
      id        ? `id="${id}"` : '',
      name      ? `name="${name}"` : '',
      required  ? 'required' : '',
      disabled  ? 'disabled' : '',
    ].filter(Boolean).join(' ');
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {

    text({
      label, name,
      value = '', placeholder = '',
      required = false, disabled = false, hint = '',
      type = 'text',
    } = {}) {
      return _wrap(label, name, `
        <input class="ui-input" type="${type}"
               ${_attrs({ required, disabled, id: `ff-${name}`, name })}
               value="${value}" placeholder="${placeholder}" />
      `, required, hint);
    },

    email(opts) {
      return this.text({ ...opts, type: 'email' });
    },

    phone(opts) {
      return this.text({ ...opts, type: 'tel' });
    },

    number({
      label, name,
      value = '', placeholder = '',
      min, max, step,
      required = false, disabled = false, hint = '',
    } = {}) {
      return _wrap(label, name, `
        <input class="ui-input" type="number"
               ${_attrs({ required, disabled, id: `ff-${name}`, name })}
               value="${value}" placeholder="${placeholder}"
               ${min !== undefined ? `min="${min}"` : ''}
               ${max !== undefined ? `max="${max}"` : ''}
               ${step !== undefined ? `step="${step}"` : ''} />
      `, required, hint);
    },

    textarea({
      label, name,
      value = '', placeholder = '',
      rows = 3,
      required = false, disabled = false, hint = '',
    } = {}) {
      return _wrap(label, name, `
        <textarea class="ui-input ui-textarea"
                  ${_attrs({ required, disabled, id: `ff-${name}`, name })}
                  rows="${rows}"
                  placeholder="${placeholder}">${value}</textarea>
      `, required, hint);
    },

    /**
     * options: array of strings  OR  array of { value, label } objects
     *          OR  array of { group, items: [...] } for optgroup
     */
    select({
      label, name,
      options = [], value = '',
      placeholder = 'Select…',
      required = false, disabled = false, hint = '',
    } = {}) {
      const renderOptions = (opts) =>
        opts.map(o => {
          if (o && typeof o === 'object' && o.group) {
            return `<optgroup label="${o.group}">${renderOptions(o.items)}</optgroup>`;
          }
          const v = (o && typeof o === 'object') ? o.value : o;
          const l = (o && typeof o === 'object') ? o.label : o;
          return `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${l}</option>`;
        }).join('');

      const placeholderOpt = placeholder
        ? `<option value="" disabled${!value ? ' selected' : ''} hidden>${placeholder}</option>`
        : '';

      return _wrap(label, name, `
        <div class="ui-select-wrap">
          <select class="ui-input ui-select"
                  ${_attrs({ required, disabled, id: `ff-${name}`, name })}>
            ${placeholderOpt}
            ${renderOptions(options)}
          </select>
          <svg class="ui-select-arrow" width="12" height="12" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      `, required, hint);
    },

    date({
      label, name,
      value = '',
      min, max,
      required = false, disabled = false, hint = '',
    } = {}) {
      return _wrap(label, name, `
        <input class="ui-input ui-date" type="date"
               ${_attrs({ required, disabled, id: `ff-${name}`, name })}
               value="${value}"
               ${min ? `min="${min}"` : ''}
               ${max ? `max="${max}"` : ''} />
      `, required, hint);
    },

    /** Number input with currency suffix badge */
    currency({
      label, name,
      value = '', placeholder = '0',
      currency = 'JOD',
      required = false, disabled = false, hint = '',
    } = {}) {
      return _wrap(label, name, `
        <div class="ui-input-group">
          <input class="ui-input ui-input--grouped" type="number"
                 ${_attrs({ required, disabled, id: `ff-${name}`, name })}
                 value="${value}" placeholder="${placeholder}"
                 min="0" step="0.01" />
          <span class="ui-input-addon">${currency}</span>
        </div>
      `, required, hint);
    },
  };

})();

window.FormField = FormField;
