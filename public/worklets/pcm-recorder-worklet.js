/**
 * Raw-PCM capture worklet for /voice — AudioWorklet path, so no ScriptProcessor
 * deprecation and no MediaRecorder re-encoding: the exact Float32 samples the
 * mel pipeline wants, at the microphone's native sample rate (resampling to
 * 16 kHz happens later, in an OfflineAudioContext on the main thread).
 *
 * Loaded by components/voice/useVoiceRecorder.ts from /worklets/ (public, so
 * the AudioWorkletNode can fetch it without a bundler round-trip). Buffers
 * 4096 samples per message to keep the postMessage rate trivial.
 */
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    // Mono capture: use channel 0 only — the mel pipeline is mono.
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset === this._buffer.length) {
        // Copy: the worklet reuses its buffer on the next block.
        this.port.postMessage(this._buffer.slice(0));
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);