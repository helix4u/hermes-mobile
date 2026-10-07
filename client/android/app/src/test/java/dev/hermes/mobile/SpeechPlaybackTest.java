package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class SpeechPlaybackTest {
    @Test public void cleanupFailureStillReleasesTheLeaseAndReportsAnError() throws Exception {
        FakeBackend backend = new FakeBackend() {
            public void release() { throw new IllegalStateException("Release failed"); }
        };
        List<Boolean> leases = new ArrayList<>();
        List<String> states = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> backend, (id, state, duration) -> states.add(state), leases::add);
        player.play("clip", new byte[] {1}, 1);
        backend.ready.run();
        backend.ended.run();
        assertEquals(java.util.Arrays.asList(true, false), leases);
        assertEquals(java.util.Arrays.asList("playing", "error"), states);
    }

    @Test public void foregroundLeaseFollowsPreparationPauseResumeAndCompletion() throws Exception {
        FakeBackend backend = new FakeBackend();
        List<Boolean> leases = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> backend, (id, state, duration) -> {}, leases::add);
        player.play("clip", new byte[] {1}, 1);
        player.pause("clip");
        backend.ready.run();
        assertEquals(0, backend.starts);
        assertEquals(java.util.Arrays.asList(true, false), leases);
        player.play("clip", new byte[] {1}, 1);
        backend.ended.run();
        assertEquals(java.util.Arrays.asList(true, false, true, false), leases);
        player.destroy();
        assertEquals(4, leases.size());
    }

    @Test public void failedPreparationReleasesForegroundLease() {
        FakeBackend backend = new FakeBackend() {
            public void prepare(byte[] audio, Runnable ready, Runnable ended, Runnable failed) {
                throw new IllegalStateException("Decoder unavailable");
            }
        };
        List<Boolean> leases = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> backend, (id, state, duration) -> {}, leases::add);
        assertThrows(IllegalStateException.class, () -> player.play("clip", new byte[] {1}, 1));
        assertEquals(java.util.Arrays.asList(true, false), leases);
        assertEquals(1, backend.releases);
    }

    static class FakeBackend implements SpeechPlayback.Backend {
        Runnable ready, ended, failed;
        int starts, pauses, releases;
        float rate;
        public void prepare(byte[] audio, Runnable ready, Runnable ended, Runnable failed) {
            this.ready = ready;
            this.ended = ended;
            this.failed = failed;
        }
        public void start(float rate) { starts++; this.rate = rate; }
        public void pause() { pauses++; }
        public int durationMs() { return 2500; }
        public void release() { releases++; }
    }

    @Test public void pauseDuringPreparationAndResumeKeepsTheSameClip() throws Exception {
        FakeBackend backend = new FakeBackend();
        List<String> events = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> backend,
            (id, state, duration) -> events.add(id + ":" + state + ":" + duration));
        player.play("clip", new byte[] {1}, 1.2f);
        player.pause("clip");
        backend.ready.run();
        assertEquals(0, backend.starts);
        player.play("clip", new byte[] {1}, 1.2f);
        assertEquals(1, backend.starts);
        assertEquals(1.2f, backend.rate, 0.001f);
        assertEquals("clip:playing:2500", events.get(0));
        backend.ended.run();
        assertEquals(1, backend.releases);
        assertEquals("clip:ended:0", events.get(1));
    }

    @Test public void oldCallbacksAndStopCannotAffectTheReplacement() throws Exception {
        List<FakeBackend> backends = new ArrayList<>();
        List<String> events = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> {
            FakeBackend backend = new FakeBackend(); backends.add(backend); return backend;
        }, (id, state, duration) -> events.add(id + ":" + state));
        player.play("old", new byte[] {1}, 1);
        player.play("new", new byte[] {1}, 1);
        backends.get(0).ready.run();
        backends.get(0).ended.run();
        backends.get(0).failed.run();
        player.stop("old");
        assertEquals(0, backends.get(0).starts);
        assertTrue(events.isEmpty());
        backends.get(1).ready.run();
        assertEquals(1, backends.get(1).starts);
        assertEquals(0, backends.get(1).releases);
        player.stop("new");
        assertEquals(1, backends.get(1).releases);
    }

    @Test public void decoderAndStartFailuresReleaseTheOwner() throws Exception {
        FakeBackend backend = new FakeBackend() {
            public void start(float rate) { throw new IllegalStateException("decode failure"); }
        };
        List<String> states = new ArrayList<>();
        SpeechPlayback player = new SpeechPlayback(() -> backend,
            (id, state, duration) -> states.add(state));
        player.play("clip", new byte[] {1}, 1);
        backend.ready.run();
        assertEquals(1, backend.releases);
        assertEquals("error", states.get(0));
        backend.failed.run();
        assertEquals(1, states.size());
    }

    @Test public void destroyedActivityCannotStartLateSpeech() throws Exception {
        FakeBackend backend = new FakeBackend();
        SpeechPlayback player = new SpeechPlayback(() -> backend, (id, state, duration) -> {});
        player.play("clip", new byte[] {1}, 1);
        player.destroy();
        backend.ready.run();
        assertEquals(0, backend.starts);
        assertEquals(1, backend.releases);
        assertThrows(IllegalArgumentException.class,
            () -> player.play("late", new byte[] {1}, 1));
    }
}
