package dev.hermes.mobile;

/** Window resize and IME padding must not reserve the same pixels twice. */
final class WindowViewportInsets {
    static int remainingInset(int inset, int alreadyExcluded) {
        return Math.max(0, inset - Math.max(0, alreadyExcluded));
    }
    private WindowViewportInsets() {}
}
