package dev.hermes.mobile;

import android.content.Context;

import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.KeywordSpotter;
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig;
import com.k2fsa.sherpa.onnx.KeywordSpotterResult;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;

/**
 * App-owned sherpa-onnx open-vocabulary keyword spotter.
 *
 * Model paths are fixed Android assets. The caller supplies only one bounded,
 * pre-tokenized keyword definition generated from the bundled BPE model.
 */
final class SherpaWakeWordEngine implements WakeWordDetector {
    static final int SAMPLE_RATE = 16_000;
    static final int FRAME_SAMPLES = 1_280;
    static final String MODEL_ID = "gigaspeech-3.3m-en";

    private static final String MODEL_DIR =
        "wakeword/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01";
    private static final String ENCODER = MODEL_DIR +
        "/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx";
    private static final String DECODER = MODEL_DIR +
        "/decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx";
    private static final String JOINER = MODEL_DIR +
        "/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx";
    private static final String TOKENS = MODEL_DIR + "/tokens.txt";
    private static final String KEYWORDS = MODEL_DIR + "/keywords.txt";

    private final KeywordSpotter spotter;
    private final String keywords;
    private OnlineStream stream;
    private boolean closed;

    SherpaWakeWordEngine(Context context, String keywords) {
        if (!isValidKeywords(keywords)) {
            throw new IllegalArgumentException("Invalid sherpa wake phrase");
        }
        this.keywords = keywords.trim();

        FeatureConfig features = new FeatureConfig();
        features.setSampleRate(SAMPLE_RATE);
        features.setFeatureDim(80);
        features.setDither(0.0f);

        OnlineTransducerModelConfig transducer =
            new OnlineTransducerModelConfig();
        transducer.setEncoder(ENCODER);
        transducer.setDecoder(DECODER);
        transducer.setJoiner(JOINER);

        OnlineModelConfig model = new OnlineModelConfig();
        model.setTransducer(transducer);
        model.setTokens(TOKENS);
        model.setNumThreads(1);
        model.setProvider("cpu");
        model.setModelType("zipformer2");

        KeywordSpotterConfig config = new KeywordSpotterConfig();
        config.setFeatConfig(features);
        config.setModelConfig(model);
        // The native constructor always loads a seed keyword file, even when
        // createStream(String) supplies the operator's phrase immediately
        // afterward. An empty path is fatal inside sherpa-onnx rather than a
        // recoverable Java exception.
        config.setKeywordsFile(KEYWORDS);
        config.setKeywordsScore(1.5f);
        config.setKeywordsThreshold(0.25f);
        config.setNumTrailingBlanks(2);

        spotter = new KeywordSpotter(context.getAssets(), config);
        stream = createStream();
    }

    static boolean isValidKeywords(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim();
        if (
            normalized.isEmpty() ||
            normalized.length() > 512 ||
            normalized.indexOf('\n') >= 0 ||
            normalized.indexOf('\r') >= 0
        ) {
            return false;
        }
        int displayStart = normalized.lastIndexOf(" @");
        if (displayStart <= 0) {
            return false;
        }
        String display = normalized.substring(displayStart + 2);
        if (!display.matches("[A-Z0-9_'-]{1,64}")) {
            return false;
        }
        for (int index = 0; index < normalized.length(); index++) {
            if (Character.isISOControl(normalized.charAt(index))) {
                return false;
            }
        }
        return true;
    }

    @Override
    public int sampleRate() {
        return SAMPLE_RATE;
    }

    @Override
    public int frameSamples() {
        return FRAME_SAMPLES;
    }

    @Override
    public synchronized void reset() {
        if (closed) {
            return;
        }
        replaceStream();
    }

    @Override
    public synchronized boolean process(short[] samples) {
        if (closed) {
            return false;
        }
        if (samples.length != FRAME_SAMPLES) {
            throw new IllegalArgumentException(
                "sherpa requires 1280-sample PCM frames"
            );
        }
        float[] waveform = new float[samples.length];
        for (int index = 0; index < samples.length; index++) {
            waveform[index] = samples[index] / 32768.0f;
        }
        stream.acceptWaveform(waveform, SAMPLE_RATE);
        while (spotter.isReady(stream)) {
            spotter.decode(stream);
            KeywordSpotterResult result = spotter.getResult(stream);
            if (result != null && !result.getKeyword().trim().isEmpty()) {
                spotter.reset(stream);
                return true;
            }
        }
        return false;
    }

    private OnlineStream createStream() {
        OnlineStream next = spotter.createStream(keywords);
        if (next.getPtr() == 0L) {
            next.release();
            throw new IllegalArgumentException("Sherpa rejected the wake phrase");
        }
        return next;
    }

    private void replaceStream() {
        OnlineStream previous = stream;
        stream = createStream();
        if (previous != null) {
            previous.release();
        }
    }

    @Override
    public synchronized void close() {
        if (closed) {
            return;
        }
        closed = true;
        if (stream != null) {
            stream.release();
            stream = null;
        }
        spotter.release();
    }
}
