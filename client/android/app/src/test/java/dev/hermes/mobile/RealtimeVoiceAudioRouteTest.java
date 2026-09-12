package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

public class RealtimeVoiceAudioRouteTest {
    @Test
    public void replacesTheEarpieceWithTheSpeakerAndRestoresAndroidState() {
        FakeBackend backend = new FakeBackend(true);
        backend.mode = 0;
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        backend.available.addAll(Arrays.asList(
            RealtimeVoiceAudioRoute.DeviceKind.EARPIECE,
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER
        ));
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);

        assertEquals(
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER,
            route.retain("gpt-live")
        );
        assertEquals(3, backend.mode);
        assertEquals(RealtimeVoiceAudioRoute.DeviceKind.SPEAKER, backend.current);
        assertTrue(backend.selected);

        route.release("gpt-live");
        assertTrue(backend.cleared);
        assertEquals(0, backend.mode);
    }

    @Test
    public void keepsAnActiveBluetoothRouteInsteadOfForcingThePhoneSpeaker() {
        FakeBackend backend = new FakeBackend(true);
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH;
        backend.available.addAll(Arrays.asList(
            RealtimeVoiceAudioRoute.DeviceKind.EARPIECE,
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER,
            RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH
        ));
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);

        assertEquals(
            RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH,
            route.retain("gpt-live")
        );
        assertFalse(backend.selected);
        route.release("gpt-live");
        assertFalse(backend.cleared);
    }

    @Test
    public void dormantBluetoothDoesNotStealTheDefaultSpeakerphoneRoute() {
        FakeBackend backend = new FakeBackend(true);
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        backend.available.addAll(Arrays.asList(
            RealtimeVoiceAudioRoute.DeviceKind.EARPIECE,
            RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH,
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER
        ));
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);

        assertEquals(
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER,
            route.retain("gpt-live")
        );
        assertEquals(RealtimeVoiceAudioRoute.DeviceKind.SPEAKER, backend.current);
    }

    @Test
    public void reassertsTheSpeakerAfterWebRtcFallsBackToTheEarpiece() {
        FakeBackend backend = new FakeBackend(true);
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        backend.available.addAll(Arrays.asList(
            RealtimeVoiceAudioRoute.DeviceKind.EARPIECE,
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER
        ));
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);
        route.retain("gpt-live");

        backend.selected = false;
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        assertEquals(
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER,
            route.ensure("gpt-live")
        );
        assertTrue(backend.selected);
    }

    @Test
    public void keepsTheRouteUntilTheLastLiveVoiceLeaseEnds() {
        FakeBackend backend = new FakeBackend(true);
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        backend.available.add(RealtimeVoiceAudioRoute.DeviceKind.SPEAKER);
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);
        route.retain("first");
        route.retain("second");

        route.release("first");
        assertFalse(backend.cleared);
        route.release("second");
        assertTrue(backend.cleared);
    }

    @Test
    public void legacyAndroidUsesSpeakerphoneAndRestoresItsPriorValue() {
        FakeBackend backend = new FakeBackend(false);
        backend.speakerphoneOn = false;
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);

        assertEquals(
            RealtimeVoiceAudioRoute.DeviceKind.SPEAKER,
            route.retain("realtime")
        );
        assertTrue(backend.speakerphoneOn);
        route.release("realtime");
        assertFalse(backend.speakerphoneOn);
    }

    @Test
    public void refusesToStartWhenAndroidOffersOnlyTheEarpiece() {
        FakeBackend backend = new FakeBackend(true);
        backend.current = RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        backend.available.add(RealtimeVoiceAudioRoute.DeviceKind.EARPIECE);
        RealtimeVoiceAudioRoute route = new RealtimeVoiceAudioRoute(backend);

        assertThrows(IllegalStateException.class, () -> route.retain("gpt-live"));
        assertEquals(0, backend.mode);
    }

    private static final class FakeBackend
        implements RealtimeVoiceAudioRoute.Backend {
        final boolean modern;
        final List<RealtimeVoiceAudioRoute.DeviceKind> available = new ArrayList<>();
        int mode;
        RealtimeVoiceAudioRoute.DeviceKind current =
            RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
        boolean selected;
        boolean cleared;
        boolean speakerphoneOn;
        boolean legacyExternalRoute;

        FakeBackend(boolean modern) {
            this.modern = modern;
        }

        @Override public boolean usesCommunicationDeviceApi() { return modern; }
        @Override public int currentMode() { return mode; }
        @Override public void enterCommunicationMode() { mode = 3; }
        @Override public void restoreModeIfStillCommunication(int previousMode) {
            if (mode == 3) mode = previousMode;
        }
        @Override public RealtimeVoiceAudioRoute.DeviceKind currentCommunicationDevice() {
            return current;
        }
        @Override public List<RealtimeVoiceAudioRoute.DeviceKind> availableCommunicationDevices() {
            return available;
        }
        @Override public boolean selectCommunicationDevice(RealtimeVoiceAudioRoute.DeviceKind kind) {
            selected = true;
            current = kind;
            return true;
        }
        @Override public void clearCommunicationDevice() { cleared = true; }
        @Override public boolean isSpeakerphoneOn() { return speakerphoneOn; }
        @Override public void setSpeakerphoneOn(boolean enabled) { speakerphoneOn = enabled; }
        @Override public boolean hasActiveLegacyExternalRoute() { return legacyExternalRoute; }
    }
}
