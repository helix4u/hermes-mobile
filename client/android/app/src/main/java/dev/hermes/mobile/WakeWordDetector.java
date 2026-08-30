package dev.hermes.mobile;

interface WakeWordDetector extends AutoCloseable {
    int sampleRate();

    int frameSamples();

    void reset() throws Exception;

    boolean process(short[] samples) throws Exception;
}
