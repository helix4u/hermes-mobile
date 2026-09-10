package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import org.junit.Test;

public class SessionNotificationIdentityTest {
    @Test public void missingProfileNeverBecomesDefault() {
        assertEquals("", SessionNotificationIdentity.profile(null));
        assertEquals("", SessionNotificationIdentity.profile("  "));
        assertEquals("writer", SessionNotificationIdentity.profile(" writer "));
    }

    @Test public void notificationIdentityIncludesProfileAndUnambiguousFields() {
        assertNotEquals(SessionNotificationIdentity.key("host", "writer", "same", "runtime"),
            SessionNotificationIdentity.key("host", "default", "same", "runtime"));
        assertNotEquals(SessionNotificationIdentity.key("host:writer", "default", "same", "runtime"),
            SessionNotificationIdentity.key("host", "writer:default", "same", "runtime"));
    }
}
