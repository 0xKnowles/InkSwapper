/**
 * Web Serial is only exposed in a secure context (https:// or localhost).
 * On a plain http:// LAN address — exactly how CrossSwap is typically
 * reached from a phone during local testing — `navigator.serial` is
 * undefined on every browser, desktop included, regardless of platform.
 * This distinguishes that case from a genuine platform/browser gap (e.g.
 * Android's still-limited native USB serial support) so the warning shown
 * to the user points at the right fix.
 */
export function getSerialUnsupportedReason(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return (
      "Web Serial requires a secure context (https:// or localhost) — this page is loaded over plain http://, " +
      "so the browser hides the API entirely, on any device. Use Wireless mode here, or open CrossSwap via " +
      "https:// or localhost to use USB Serial."
    );
  }
  return (
    "Web Serial isn't supported in this browser. On Android, native USB serial support is very new " +
    "(Chrome 148+, a limited set of devices) — try Wireless mode instead."
  );
}
