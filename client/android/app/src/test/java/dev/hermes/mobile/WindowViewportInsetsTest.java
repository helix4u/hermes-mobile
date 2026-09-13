package dev.hermes.mobile;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class WindowViewportInsetsTest {
    @Test public void resizedWindowDoesNotReserveKeyboardTwice() {
        assertEquals(0, WindowViewportInsets.remainingInset(897, 897));
        assertEquals(0, WindowViewportInsets.remainingInset(144, 144));
    }
    @Test public void edgeToEdgeAndPartialResizeReserveOnlyUncoveredPixels() {
        assertEquals(897, WindowViewportInsets.remainingInset(897, 0));
        assertEquals(753, WindowViewportInsets.remainingInset(897, 144));
        assertEquals(0, WindowViewportInsets.remainingInset(0, 144));
    }
}
