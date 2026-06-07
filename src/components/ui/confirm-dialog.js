'use strict';

/**
 * ConfirmDialog — yes/no confirmation built on top of Modal
 * Requires: modal.js loaded first
 *
 * Usage:
 *   ConfirmDialog.show({
 *     title:       'Archive deal?',
 *     message:     'This will move the deal to the archive.',
 *     confirmText: 'Archive',
 *     onConfirm:   () => archiveDeal(id),
 *   });
 *
 *   // Shorthand for delete confirmations:
 *   ConfirmDialog.delete({
 *     itemName: deal.name,
 *     onConfirm: () => deleteDeal(id),
 *   });
 */
const ConfirmDialog = (() => {

  function show({
    title       = 'Are you sure?',
    message     = '',
    confirmText = 'Confirm',
    cancelText  = 'Cancel',
    danger      = false,
    onConfirm,
    onCancel,
  } = {}) {
    const modal = new Modal({
      title,
      body: message ? `<p class="ui-confirm-msg">${message}</p>` : '',
      footer: `
        <button class="ui-btn ui-btn--ghost"  data-action="cancel">${cancelText}</button>
        <button class="ui-btn ${danger ? 'ui-btn--danger' : 'ui-btn--primary'}" data-action="confirm">
          ${confirmText}
        </button>
      `,
      size: 'sm',
      closeOnBackdrop: false,
    });

    modal.open();

    const footer = modal.getFooter();

    footer.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      modal.close();
      if (onCancel) onCancel();
    });

    footer.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      modal.close();
      if (onConfirm) onConfirm();
    });

    return modal;
  }

  function del({ itemName, onConfirm, onCancel } = {}) {
    return show({
      title:       `Delete${itemName ? ' "' + itemName + '"' : ' item'}?`,
      message:     'This action is permanent and cannot be undone.',
      confirmText: 'Delete',
      danger:      true,
      onConfirm,
      onCancel,
    });
  }

  return { show, delete: del };

})();

window.ConfirmDialog = ConfirmDialog;
