package dev.hermes.mobile;

import android.media.AudioAttributes;
import android.media.MediaDataSource;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.content.Context;
import android.os.PowerManager;
import java.io.IOException;

/** Native synthesis playback intentionally mixes with the existing media stream. */
final class AndroidSpeechBackend implements SpeechPlayback.Backend {
    private final MediaPlayer player = new MediaPlayer();
    private MediaDataSource source;

    AndroidSpeechBackend(Context context) {
        // The player owns this CPU lease only while audio is actually playing.
        player.setWakeMode(context.getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
    }

    @Override
    public void prepare(byte[] audio, Runnable ready, Runnable ended, Runnable failed) throws IOException {
        source = new MediaDataSource() {
            private byte[] bytes = audio;
            @Override
            public synchronized int readAt(long position, byte[] buffer, int offset, int size) {
                if (size == 0) return 0;
                if (bytes == null || position < 0 || position >= bytes.length) return -1;
                int count = Math.min(size, bytes.length - (int) position);
                System.arraycopy(bytes, (int) position, buffer, offset, count);
                return count;
            }
            @Override
            public synchronized long getSize() { return bytes == null ? 0 : bytes.length; }
            @Override
            public synchronized void close() { bytes = null; }
        };
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build());
        player.setOnPreparedListener(ignored -> ready.run());
        player.setOnCompletionListener(ignored -> ended.run());
        player.setOnErrorListener((ignored, what, extra) -> {
            android.util.Log.w("HermesSpeech", "Speech decoder failed: " + what + "/" + extra);
            failed.run();
            return true;
        });
        player.setDataSource(source);
        player.prepareAsync();
    }

    @Override
    public void start(float rate) {
        player.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1));
        player.start();
    }
    @Override
    public void pause() {
        player.pause();
    }
    @Override
    public int durationMs() { return player.getDuration(); }
    @Override
    public void release() {
        try {
            player.release();
        } catch (RuntimeException error) {
            android.util.Log.w("HermesSpeech", "Speech player cleanup failed", error);
            throw error;
        } finally {
            if (source != null) {
                try { source.close(); }
                catch (IOException error) { android.util.Log.w("HermesSpeech", "Speech buffer cleanup failed", error); }
                source = null;
            }
        }
    }
}
