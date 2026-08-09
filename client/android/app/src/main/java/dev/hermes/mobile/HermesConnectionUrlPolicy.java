package dev.hermes.mobile;

import java.net.URI;

final class HermesConnectionUrlPolicy {
    private HermesConnectionUrlPolicy() {}

    static URI requireAllowed(String value, boolean websocket) {
        final URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException(
                "The Hermes connection URL is invalid"
            );
        }

        String scheme = lower(uri.getScheme());
        String secureScheme = websocket ? "wss" : "https";
        String loopbackScheme = websocket ? "ws" : "http";
        if (
            uri.getHost() == null ||
            uri.getHost().isBlank() ||
            uri.getUserInfo() != null
        ) {
            throw new IllegalArgumentException(
                "The Hermes connection URL is invalid"
            );
        }
        if (secureScheme.equals(scheme)) {
            return uri;
        }
        if (
            loopbackScheme.equals(scheme) &&
            isLoopbackHost(uri.getHost())
        ) {
            return uri;
        }
        throw new IllegalArgumentException(
            "Native Hermes connections require " +
            secureScheme.toUpperCase() +
            ", except " +
            loopbackScheme.toUpperCase() +
            " for a same-device Termux server"
        );
    }

    static String websocketToHttp(String value) {
        URI uri = requireAllowed(value, true);
        return replaceScheme(
            value,
            "wss".equalsIgnoreCase(uri.getScheme()) ? "https" : "http"
        );
    }

    static String httpToWebsocket(String value) {
        URI uri = requireAllowed(value, false);
        return replaceScheme(
            value,
            "https".equalsIgnoreCase(uri.getScheme()) ? "wss" : "ws"
        );
    }

    private static String replaceScheme(String value, String replacement) {
        int colon = value.indexOf(':');
        if (colon <= 0) {
            throw new IllegalArgumentException(
                "The Hermes connection URL is invalid"
            );
        }
        return replacement + value.substring(colon);
    }

    private static boolean isLoopbackHost(String value) {
        String host = lower(value);
        return (
            "localhost".equals(host) ||
            "127.0.0.1".equals(host) ||
            "::1".equals(host) ||
            "[::1]".equals(host)
        );
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT);
    }
}
