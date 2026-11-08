const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loading = null;

/** Lazy-load Razorpay Checkout only when the user clicks upgrade. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not load Razorpay Checkout'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}

/**
 * Open Checkout for a server-created order. Resolves with Razorpay's
 * { razorpay_order_id, razorpay_payment_id, razorpay_signature } on success,
 * or null if the user closes the modal. The server must verify the signature.
 */
export async function openCheckout(order, { description }) {
  const Razorpay = await loadRazorpay();
  // payment.failed is not treated as final: Checkout shows the error and lets
  // the user retry inside the same modal, so we settle only on success or close.
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'System Design Interviewer',
      description,
      handler: resolve,
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.open();
  });
}
