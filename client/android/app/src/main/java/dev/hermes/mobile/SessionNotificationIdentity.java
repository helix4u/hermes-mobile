package dev.hermes.mobile;

/** Profile is explicit. An old notification without it stays unidentified, never default. */
final class SessionNotificationIdentity {
    static String profile(String value) {
        return value == null ? "" : value.trim();
    }

    static String key(String connectionId, String profile, String storedId, String runtimeId) {
        StringBuilder key = new StringBuilder();
        for (String value : new String[] { connectionId, profile, storedId, runtimeId }) {
            String part = value == null ? "" : value;
            key.append(part.length()).append(':').append(part);
        }
        return key.toString();
    }
}
