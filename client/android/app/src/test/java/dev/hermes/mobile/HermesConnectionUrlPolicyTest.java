package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class HermesConnectionUrlPolicyTest {
    @Test
    public void allowsSecureRemoteAndCleartextLoopbackHttp() {
        assertEquals(
            "https",
            HermesConnectionUrlPolicy
                .requireAllowed("https://workstation.example", false)
                .getScheme()
        );
        assertEquals(
            "http",
            HermesConnectionUrlPolicy
                .requireAllowed("http://127.0.0.1:9129", false)
                .getScheme()
        );
        assertEquals(
            "http",
            HermesConnectionUrlPolicy
                .requireAllowed("http://localhost:9129", false)
                .getScheme()
        );
    }

    @Test
    public void rejectsCleartextRemoteHostsAndEmbeddedCredentials() {
        assertThrows(
            IllegalArgumentException.class,
            () -> HermesConnectionUrlPolicy.requireAllowed(
                "http://192.168.1.50:9129",
                false
            )
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> HermesConnectionUrlPolicy.requireAllowed(
                "https://user:password@workstation.example",
                false
            )
        );
    }

    @Test
    public void convertsBothSecureAndLoopbackWebsocketSchemes() {
        assertEquals(
            "https://workstation.example/api/ws",
            HermesConnectionUrlPolicy.websocketToHttp(
                "wss://workstation.example/api/ws"
            )
        );
        assertEquals(
            "http://127.0.0.1:9129/api/ws",
            HermesConnectionUrlPolicy.websocketToHttp(
                "ws://127.0.0.1:9129/api/ws"
            )
        );
        assertEquals(
            "ws://127.0.0.1:9129/api/ws?ticket=one",
            HermesConnectionUrlPolicy.httpToWebsocket(
                "http://127.0.0.1:9129/api/ws?ticket=one"
            )
        );
    }
}
