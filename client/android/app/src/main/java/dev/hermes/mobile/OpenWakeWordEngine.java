package dev.hermes.mobile;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Small, app-owned openWakeWord inference pipeline.
 *
 * The three ONNX assets are the exact feature and "hey_hermes" models used by
 * Hermes Desktop on Windows. Keeping inference in-process lets Mobile own the
 * microphone with AudioRecord instead of repeatedly starting Android's speech
 * recognition service, which can emit OEM recognition cues.
 */
final class OpenWakeWordEngine implements AutoCloseable {
    static final int SAMPLE_RATE = 16_000;
    static final int FRAME_SAMPLES = 1_280;
    static final float DETECTION_THRESHOLD = 0.60f;
    static final int CONFIRMATION_FRAMES = 3;

    private static final int MEL_CONTEXT_FRAMES = 76;
    private static final int MEL_BINS = 32;
    private static final int EMBEDDING_FRAMES = 16;
    private static final int EMBEDDING_SIZE = 96;
    private static final int RAW_OVERLAP_SAMPLES = 160 * 3;
    private static final int WARMUP_PREDICTIONS = 5;

    private final OrtEnvironment environment;
    private final OrtSession melSession;
    private final OrtSession embeddingSession;
    private final OrtSession wakeSession;
    private final String melInputName;
    private final String embeddingInputName;
    private final String wakeInputName;
    private final short[] rawHistory =
        new short[FRAME_SAMPLES + RAW_OVERLAP_SAMPLES];
    private final float[][] melHistory =
        new float[MEL_CONTEXT_FRAMES][MEL_BINS];
    private final float[][] featureHistory =
        new float[EMBEDDING_FRAMES][EMBEDDING_SIZE];

    private int rawHistorySize;
    private int predictionCount;
    private int confirmationStreak;
    private boolean closed;

    OpenWakeWordEngine(Context context) throws IOException, OrtException {
        environment = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setInterOpNumThreads(1);
        options.setIntraOpNumThreads(1);
        try {
            melSession = environment.createSession(
                readAsset(context, "wakeword/melspectrogram.onnx"),
                options
            );
            embeddingSession = environment.createSession(
                readAsset(context, "wakeword/embedding_model.onnx"),
                options
            );
            wakeSession = environment.createSession(
                readAsset(context, "wakeword/hey_hermes.onnx"),
                options
            );
        } finally {
            options.close();
        }
        melInputName = firstInputName(melSession);
        embeddingInputName = firstInputName(embeddingSession);
        wakeInputName = firstInputName(wakeSession);
        reset();
    }

    synchronized void reset() {
        rawHistorySize = 0;
        predictionCount = 0;
        confirmationStreak = 0;
        Arrays.fill(rawHistory, (short) 0);
        for (float[] row : melHistory) {
            Arrays.fill(row, 1.0f);
        }
        for (float[] row : featureHistory) {
            Arrays.fill(row, 0.0f);
        }
    }

    synchronized boolean process(short[] samples)
        throws OrtException {
        if (closed) {
            return false;
        }
        if (samples.length != FRAME_SAMPLES) {
            throw new IllegalArgumentException(
                "openWakeWord requires 1280-sample PCM frames"
            );
        }

        appendRaw(samples);
        appendMelFrames(runMelModel());
        appendFeature(runEmbeddingModel());
        float score = runWakeModel();

        predictionCount++;
        if (
            predictionCount <= WARMUP_PREDICTIONS ||
            score < DETECTION_THRESHOLD
        ) {
            confirmationStreak = 0;
            return false;
        }
        confirmationStreak++;
        if (confirmationStreak < CONFIRMATION_FRAMES) {
            return false;
        }
        confirmationStreak = 0;
        return true;
    }

    private void appendRaw(short[] samples) {
        int keep = Math.min(
            rawHistorySize,
            rawHistory.length - samples.length
        );
        if (keep > 0) {
            System.arraycopy(
                rawHistory,
                rawHistorySize - keep,
                rawHistory,
                0,
                keep
            );
        }
        System.arraycopy(samples, 0, rawHistory, keep, samples.length);
        rawHistorySize = keep + samples.length;
    }

    private float[][][][] runMelModel() throws OrtException {
        float[][] input = new float[1][rawHistorySize];
        for (int i = 0; i < rawHistorySize; i++) {
            input[0][i] = rawHistory[i];
        }
        try (
            OnnxTensor tensor = OnnxTensor.createTensor(environment, input);
            OrtSession.Result result = melSession.run(
                Collections.singletonMap(melInputName, tensor)
            )
        ) {
            return (float[][][][]) result.get(0).getValue();
        }
    }

    private void appendMelFrames(float[][][][] output) {
        float[][] frames = output[0][0];
        int count = Math.min(frames.length, MEL_CONTEXT_FRAMES);
        if (count < MEL_CONTEXT_FRAMES) {
            for (
                int frame = 0;
                frame < MEL_CONTEXT_FRAMES - count;
                frame++
            ) {
                System.arraycopy(
                    melHistory[frame + count],
                    0,
                    melHistory[frame],
                    0,
                    MEL_BINS
                );
            }
        }
        int sourceStart = frames.length - count;
        int targetStart = MEL_CONTEXT_FRAMES - count;
        for (int frame = 0; frame < count; frame++) {
            for (int bin = 0; bin < MEL_BINS; bin++) {
                // Match openWakeWord's shared preprocessing transform.
                melHistory[targetStart + frame][bin] =
                    frames[sourceStart + frame][bin] / 10.0f + 2.0f;
            }
        }
    }

    private float[] runEmbeddingModel() throws OrtException {
        float[][][][] input =
            new float[1][MEL_CONTEXT_FRAMES][MEL_BINS][1];
        for (int frame = 0; frame < MEL_CONTEXT_FRAMES; frame++) {
            for (int bin = 0; bin < MEL_BINS; bin++) {
                input[0][frame][bin][0] = melHistory[frame][bin];
            }
        }
        try (
            OnnxTensor tensor = OnnxTensor.createTensor(environment, input);
            OrtSession.Result result = embeddingSession.run(
                Collections.singletonMap(embeddingInputName, tensor)
            )
        ) {
            float[][][][] output =
                (float[][][][]) result.get(0).getValue();
            return output[0][0][0];
        }
    }

    private void appendFeature(float[] feature) {
        for (int frame = 0; frame < EMBEDDING_FRAMES - 1; frame++) {
            System.arraycopy(
                featureHistory[frame + 1],
                0,
                featureHistory[frame],
                0,
                EMBEDDING_SIZE
            );
        }
        System.arraycopy(
            feature,
            0,
            featureHistory[EMBEDDING_FRAMES - 1],
            0,
            EMBEDDING_SIZE
        );
    }

    private float runWakeModel() throws OrtException {
        float[][][] input =
            new float[1][EMBEDDING_FRAMES][EMBEDDING_SIZE];
        for (int frame = 0; frame < EMBEDDING_FRAMES; frame++) {
            System.arraycopy(
                featureHistory[frame],
                0,
                input[0][frame],
                0,
                EMBEDDING_SIZE
            );
        }
        try (
            OnnxTensor tensor = OnnxTensor.createTensor(environment, input);
            OrtSession.Result result = wakeSession.run(
                Collections.singletonMap(wakeInputName, tensor)
            )
        ) {
            float[][] output = (float[][]) result.get(0).getValue();
            return output[0][0];
        }
    }

    private static String firstInputName(OrtSession session) {
        return session.getInputNames().iterator().next();
    }

    private static byte[] readAsset(Context context, String path)
        throws IOException {
        try (
            InputStream input = context.getAssets().open(path);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    @Override
    public synchronized void close() throws OrtException {
        if (closed) {
            return;
        }
        closed = true;
        wakeSession.close();
        embeddingSession.close();
        melSession.close();
    }
}
