package dev.hermes.mobile;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

final class WakeWordAudioLoop implements AutoCloseable {
    private static final int PRE_ROLL_FRAMES = 18;

    interface Listener {
        void onListening();
        void onDetected();
        void onUtterance(
            byte[] wavBytes,
            long durationMs,
            String endReason
        );
        void onError(Exception error);
    }

    private final OpenWakeWordEngine engine;
    private final Listener listener;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Object lifecycleLock = new Object();

    private AudioRecord recorder;
    private Thread thread;

    WakeWordAudioLoop(
        OpenWakeWordEngine engine,
        Listener listener
    ) {
        this.engine = engine;
        this.listener = listener;
    }

    void start() {
        synchronized (lifecycleLock) {
            if (closed.get()) {
                throw new IllegalStateException(
                    "Wake-word audio was already stopped"
                );
            }
            if (running.get()) {
                return;
            }
            int minimumBytes = AudioRecord.getMinBufferSize(
                OpenWakeWordEngine.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            if (minimumBytes <= 0) {
                throw new IllegalStateException(
                    "Android did not provide a wake-word audio buffer"
                );
            }
            int bufferBytes = Math.max(
                minimumBytes,
                OpenWakeWordEngine.FRAME_SAMPLES * 2 * 4
            );
            AudioRecord nextRecorder = new AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(OpenWakeWordEngine.SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferBytes)
                .build();
            if (
                nextRecorder.getState() !=
                AudioRecord.STATE_INITIALIZED
            ) {
                nextRecorder.release();
                throw new IllegalStateException(
                    "Android could not initialize wake-word audio"
                );
            }
            engine.reset();
            nextRecorder.startRecording();
            if (
                nextRecorder.getRecordingState() !=
                AudioRecord.RECORDSTATE_RECORDING
            ) {
                nextRecorder.release();
                throw new IllegalStateException(
                    "Android could not start wake-word audio"
                );
            }
            recorder = nextRecorder;
            running.set(true);
            thread = new Thread(this::run, "hermes-openwakeword");
            thread.setDaemon(true);
            thread.start();
        }
        listener.onListening();
    }

    private void run() {
        short[] frame = new short[OpenWakeWordEngine.FRAME_SAMPLES];
        ArrayDeque<short[]> preRoll = new ArrayDeque<>();
        ByteArrayOutputStream utterancePcm = null;
        WakeWordEndDetector endDetector = null;
        int utteranceSamples = 0;
        boolean detected = false;
        int filled = 0;
        try {
            while (running.get()) {
                AudioRecord activeRecorder;
                synchronized (lifecycleLock) {
                    activeRecorder = recorder;
                }
                if (activeRecorder == null) {
                    return;
                }
                int read = activeRecorder.read(
                    frame,
                    filled,
                    frame.length - filled,
                    AudioRecord.READ_BLOCKING
                );
                if (read > 0) {
                    filled += read;
                    if (filled == frame.length) {
                        short[] completedFrame = frame.clone();
                        if (!detected) {
                            preRoll.addLast(completedFrame);
                            while (preRoll.size() > PRE_ROLL_FRAMES) {
                                preRoll.removeFirst();
                            }
                            if (engine.process(completedFrame)) {
                                detected = true;
                                utterancePcm = new ByteArrayOutputStream();
                                endDetector = new WakeWordEndDetector(
                                    estimateNoiseFloor(preRoll)
                                );
                                for (short[] bufferedFrame : preRoll) {
                                    writePcm16(utterancePcm, bufferedFrame);
                                    utteranceSamples += bufferedFrame.length;
                                }
                                preRoll.clear();
                                listener.onDetected();
                            }
                        } else {
                            writePcm16(utterancePcm, completedFrame);
                            utteranceSamples += completedFrame.length;
                            WakeWordEndDetector.Result result =
                                endDetector.accept(completedFrame);
                            if (result != null) {
                                running.set(false);
                                byte[] pcm = utterancePcm.toByteArray();
                                listener.onUtterance(
                                    toWave(pcm, utteranceSamples),
                                    Math.round(
                                        utteranceSamples * 1_000.0 /
                                        OpenWakeWordEngine.SAMPLE_RATE
                                    ),
                                    result.value
                                );
                                return;
                            }
                        }
                        filled = 0;
                    }
                    continue;
                }
                if (!running.get()) {
                    return;
                }
                throw new IllegalStateException(
                    "Wake-word audio stopped (" + read + ")"
                );
            }
        } catch (Exception error) {
            if (running.getAndSet(false)) {
                listener.onError(error);
            }
        } finally {
            releaseRecorder();
        }
    }

    private static double estimateNoiseFloor(ArrayDeque<short[]> frames) {
        if (frames.isEmpty()) {
            return 220.0;
        }
        double[] levels = new double[frames.size()];
        int index = 0;
        for (short[] bufferedFrame : frames) {
            levels[index] = WakeWordEndDetector.rootMeanSquare(bufferedFrame);
            index += 1;
        }
        Arrays.sort(levels);
        return levels[Math.min(levels.length - 1, levels.length / 4)];
    }

    private static void writePcm16(
        ByteArrayOutputStream output,
        short[] samples
    ) {
        for (short sample : samples) {
            output.write(sample & 0xff);
            output.write((sample >>> 8) & 0xff);
        }
    }

    private static byte[] toWave(byte[] pcm, int sampleCount) {
        ByteArrayOutputStream output =
            new ByteArrayOutputStream(44 + pcm.length);
        writeAscii(output, "RIFF");
        writeInt32(output, 36 + pcm.length);
        writeAscii(output, "WAVE");
        writeAscii(output, "fmt ");
        writeInt32(output, 16);
        writeInt16(output, 1);
        writeInt16(output, 1);
        writeInt32(output, OpenWakeWordEngine.SAMPLE_RATE);
        writeInt32(output, OpenWakeWordEngine.SAMPLE_RATE * 2);
        writeInt16(output, 2);
        writeInt16(output, 16);
        writeAscii(output, "data");
        writeInt32(output, sampleCount * 2);
        output.write(pcm, 0, pcm.length);
        return output.toByteArray();
    }

    private static void writeAscii(
        ByteArrayOutputStream output,
        String value
    ) {
        for (int index = 0; index < value.length(); index += 1) {
            output.write(value.charAt(index));
        }
    }

    private static void writeInt16(
        ByteArrayOutputStream output,
        int value
    ) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
    }

    private static void writeInt32(
        ByteArrayOutputStream output,
        int value
    ) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
        output.write((value >>> 16) & 0xff);
        output.write((value >>> 24) & 0xff);
    }

    private void releaseRecorder() {
        AudioRecord activeRecorder;
        synchronized (lifecycleLock) {
            activeRecorder = recorder;
            recorder = null;
        }
        if (activeRecorder == null) {
            return;
        }
        try {
            if (
                activeRecorder.getRecordingState() ==
                AudioRecord.RECORDSTATE_RECORDING
            ) {
                activeRecorder.stop();
            }
        } catch (RuntimeException ignored) {
        }
        activeRecorder.release();
    }

    @Override
    public void close() {
        closed.set(true);
        running.set(false);
        releaseRecorder();
        Thread activeThread;
        synchronized (lifecycleLock) {
            activeThread = thread;
            thread = null;
        }
        if (
            activeThread == null ||
            activeThread == Thread.currentThread()
        ) {
            return;
        }
        activeThread.interrupt();
        try {
            activeThread.join(1_500);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
