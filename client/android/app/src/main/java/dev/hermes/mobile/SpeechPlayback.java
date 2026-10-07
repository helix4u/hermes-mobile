package dev.hermes.mobile;

/** One TTS clip owner. Never changes the communication route or requests audio focus. */
final class SpeechPlayback {
    interface Backend {
        void prepare(byte[] audio, Runnable ready, Runnable ended, Runnable failed) throws Exception;
        void start(float rate);
        void pause();
        int durationMs();
        void release();
    }

    interface Factory { Backend create(); }
    interface Listener { void changed(String id, String state, int durationMs); }
    interface Retention { void changed(boolean active); }

    private final Factory factory;
    private final Listener listener;
    private final Retention retention;
    private boolean retained;
    private Backend player;
    private String id = "";
    private boolean prepared;
    private boolean playingRequested;
    private float rate = 1;
    private boolean destroyed;

    SpeechPlayback(Factory factory, Listener listener) {
        this(factory, listener, active -> {});
    }

    SpeechPlayback(Factory factory, Listener listener, Retention retention) {
        this.factory = factory;
        this.listener = listener;
        this.retention = retention;
    }

    void play(String nextId, byte[] audio, float nextRate) throws Exception {
        if (destroyed || nextId == null || nextId.isEmpty() || !Float.isFinite(nextRate)) {
            throw new IllegalArgumentException("Invalid speech playback options");
        }
        rate = Math.max(0.7f, Math.min(1.5f, nextRate));
        if (nextId.equals(id) && player != null) {
            retain(true);
            playingRequested = true;
            if (prepared) start(player);
            return;
        }
        close();
        id = nextId;
        playingRequested = true;
        Backend owner = factory.create();
        player = owner;
        try {
            retain(true);
            owner.prepare(audio, () -> {
                if (player != owner) return;
                prepared = true;
                if (playingRequested) start(owner);
            }, () -> finish(owner, "ended"), () -> finish(owner, "error"));
        } catch (Exception error) {
            close();
            throw error;
        }
    }

    private void start(Backend owner) {
        try {
            owner.start(rate);
            listener.changed(id, "playing", owner.durationMs());
        } catch (RuntimeException error) {
            finish(owner, "error");
        }
    }

    void pause(String playbackId) {
        if (!id.equals(playbackId) || player == null) return;
        playingRequested = false;
        if (prepared) player.pause();
        retain(false);
    }

    void stop(String playbackId) {
        if (id.equals(playbackId)) close();
    }

    private void finish(Backend owner, String state) {
        if (player != owner) return;
        String completedId = id;
        try {
            close();
        } catch (RuntimeException error) {
            state = "error";
        }
        listener.changed(completedId, state, 0);
    }

    void close() {
        Backend old = player;
        player = null;
        id = "";
        prepared = false;
        playingRequested = false;
        try {
            if (old != null) old.release();
        } finally {
            retain(false);
        }
    }

    private void retain(boolean active) {
        if (retained == active) return;
        retention.changed(active);
        retained = active;
    }

    void destroy() {
        destroyed = true;
        close();
    }
}
