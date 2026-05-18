/**
 * Button Helper Functions
 * Fungsi-fungsi untuk menambahkan interaksi pada button
 */

class ButtonHelper {
  constructor() {
    this.loadingButtons = new Map();
  }

  /**
   * Set button ke loading state
   * @param {HTMLElement} button - Element button
   * @param {string} loadingText - Text saat loading (default: "Loading...")
   */
  setLoading(button, loadingText = "Loading...") {
    if (!button) return;

    // Simpan state original
    const originalText = button.innerHTML;
    const originalDisabled = button.disabled;

    this.loadingButtons.set(button, {
      originalText,
      originalDisabled
    });

    // Set loading state
    button.disabled = true;
    button.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"/>
        </svg>
        ${loadingText}
      </span>
    `;

    // Add spin animation if not exists
    if (!document.getElementById('btn-spin-animation')) {
      const style = document.createElement('style');
      style.id = 'btn-spin-animation';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Remove loading state dari button
   * @param {HTMLElement} button - Element button
   */
  removeLoading(button) {
    if (!button) return;

    const originalState = this.loadingButtons.get(button);
    if (!originalState) return;

    button.innerHTML = originalState.originalText;
    button.disabled = originalState.originalDisabled;

    this.loadingButtons.delete(button);
  }

  /**
   * Show success state (hijau dengan checkmark)
   * @param {HTMLElement} button - Element button
   * @param {string} successText - Text saat success
   * @param {number} duration - Durasi tampil (ms)
   */
  showSuccess(button, successText = "Berhasil!", duration = 2000) {
    if (!button) return;

    const originalClass = button.className;
    const originalText = button.innerHTML;

    // Set success state
    button.className = button.className.replace(/btn-(primary|danger|success|outline-\w+)/g, 'btn-success');
    button.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        ${successText}
      </span>
    `;

    // Reset setelah duration
    setTimeout(() => {
      button.className = originalClass;
      button.innerHTML = originalText;
    }, duration);
  }

  /**
   * Show error state (merah dengan X)
   * @param {HTMLElement} button - Element button
   * @param {string} errorText - Text saat error
   * @param {number} duration - Durasi tampil (ms)
   */
  showError(button, errorText = "Gagal!", duration = 2000) {
    if (!button) return;

    const originalClass = button.className;
    const originalText = button.innerHTML;

    // Set error state
    button.className = button.className.replace(/btn-(primary|danger|success|outline-\w+)/g, 'btn-danger');
    button.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        ${errorText}
      </span>
    `;

    // Reset setelah duration
    setTimeout(() => {
      button.className = originalClass;
      button.innerHTML = originalText;
    }, duration);
  }

  /**
   * Confirm action dengan dialog
   * @param {string} message - Pesan konfirmasi
   * @param {Function} onConfirm - Callback jika confirm
   * @param {Function} onCancel - Callback jika cancel
   */
  confirm(message, onConfirm, onCancel) {
    if (confirm(message)) {
      if (typeof onConfirm === 'function') onConfirm();
    } else {
      if (typeof onCancel === 'function') onCancel();
    }
  }

  /**
   * Async button handler dengan loading state
   * @param {HTMLElement} button - Element button
   * @param {Function} asyncFunction - Async function yang akan dijalankan
   * @param {Object} options - Options (loadingText, successText, errorText)
   */
  async handleAsync(button, asyncFunction, options = {}) {
    const {
      loadingText = "Loading...",
      successText = "Berhasil!",
      errorText = "Gagal!",
      showSuccess = true,
      showError = true
    } = options;

    try {
      this.setLoading(button, loadingText);
      const result = await asyncFunction();
      this.removeLoading(button);

      if (showSuccess) {
        this.showSuccess(button, successText);
      }

      return result;
    } catch (error) {
      this.removeLoading(button);

      if (showError) {
        this.showError(button, errorText);
      }

      throw error;
    }
  }

  /**
   * Disable button untuk durasi tertentu (cooldown)
   * @param {HTMLElement} button - Element button
   * @param {number} duration - Durasi dalam ms
   */
  cooldown(button, duration = 3000) {
    if (!button) return;

    const originalText = button.innerHTML;
    button.disabled = true;

    let remaining = Math.ceil(duration / 1000);
    button.innerHTML = `${originalText} (${remaining}s)`;

    const interval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        button.innerHTML = `${originalText} (${remaining}s)`;
      } else {
        clearInterval(interval);
        button.disabled = false;
        button.innerHTML = originalText;
      }
    }, 1000);
  }
}

// Export class sebagai default
export default ButtonHelper;

// Contoh penggunaan:
/*

// 1. Loading State
const btn = document.querySelector('.btn-primary');
buttonHelper.setLoading(btn, "Memproses...");
setTimeout(() => buttonHelper.removeLoading(btn), 2000);

// 2. Success State
buttonHelper.showSuccess(btn, "Berhasil disimpan!");

// 3. Error State
buttonHelper.showError(btn, "Gagal menyimpan!");

// 4. Async Handler
const saveButton = document.querySelector('#save-btn');
saveButton.addEventListener('click', async () => {
  await buttonHelper.handleAsync(saveButton, async () => {
    // Simulasi API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true };
  }, {
    loadingText: "Menyimpan...",
    successText: "Tersimpan!",
    errorText: "Gagal menyimpan!"
  });
});

// 5. Confirm Dialog
const deleteButton = document.querySelector('#delete-btn');
deleteButton.addEventListener('click', () => {
  buttonHelper.confirm(
    "Apakah Anda yakin ingin menghapus?",
    () => console.log("Deleted"),
    () => console.log("Cancelled")
  );
});

// 6. Cooldown
const submitButton = document.querySelector('#submit-btn');
submitButton.addEventListener('click', () => {
  buttonHelper.cooldown(submitButton, 5000);
});

*/
