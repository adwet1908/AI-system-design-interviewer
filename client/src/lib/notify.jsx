import { toast } from 'react-toastify';

/**
 * Error toast. Pass a stable `id` for errors that can repeat (e.g. autosave),
 * so they replace each other instead of stacking.
 */
export function notifyError(errOrMessage, id) {
  const message =
    typeof errOrMessage === 'string' ? errOrMessage : errOrMessage?.message || 'Something went wrong';
  toast.error(message, id ? { toastId: id } : undefined);
}

export function notifySuccess(message, id) {
  toast.success(message, id ? { toastId: id } : undefined);
}

export function notifyInfo(message, id) {
  toast.info(message, id ? { toastId: id } : undefined);
}

/**
 * In-app replacement for window.confirm. Resolves true on confirm, false on
 * cancel or if the toast is dismissed any other way.
 */
export function confirmToast(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    toast(
      ({ closeToast }) => (
        <div className="text-sm">
          <p>{message}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                settle(false);
                closeToast();
              }}
              className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                settle(true);
                closeToast();
              }}
              className={`rounded-md px-3 py-1 font-medium text-white ${
                danger ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
        position: 'top-center',
        onClose: () => settle(false),
      }
    );
  });
}
