"""Reference mel-spectrogram implementations for the parity fixtures.

Two paths matter, and they are NOT the same (see
docs/notes/voice-cloning-architecture.md §1):

- encoder mel — plain power mel: sr 16000, n_fft 400 (25 ms), hop 160 (10 ms),
  40 bins, librosa defaults (fmin 0, fmax 8000, slaney scale/norm, power 2),
  no log, no normalisation. Frames time-major (T, 40).
- synthesizer mel (what the vocoder consumes): sr 16000, n_fft 800, hop 200,
  win 800, 80 bins, fmin 55, fmax 7600, pre-emphasis 0.97, dB (−100 floor,
  20 ref) then symmetric normalisation to ±4. Frames (80, T).

Both are implemented here against librosa with keyword arguments so this file
is independent of the reference repo's pinned librosa version.
"""

from __future__ import annotations

import numpy as np
import scipy.signal
import librosa
import librosa.filters

# ---- encoder side (encoder/params_data.py) -------------------------------
ENCODER_SR = 16000
ENCODER_N_FFT = 400  # 25 ms
ENCODER_HOP = 160  # 10 ms
ENCODER_MELS = 40

# ---- synthesizer side (synthesizer/hparams.py) ---------------------------
SYNTH_SR = 16000
SYNTH_N_FFT = 800
SYNTH_HOP = 200
SYNTH_WIN = 800
SYNTH_MELS = 80
SYNTH_FMIN = 55
SYNTH_FMAX = 7600
PREEMPHASIS = 0.97
MIN_LEVEL_DB = -100
REF_LEVEL_DB = 20
MAX_ABS_VALUE = 4.0
GRIFFIN_LIM_ITERS = 60


def encoder_mel(wav: np.ndarray) -> np.ndarray:
    """encoder.audio.wav_to_mel_spectrogram — power mel, frames time-major."""
    frames = librosa.feature.melspectrogram(
        y=wav,
        sr=ENCODER_SR,
        n_fft=ENCODER_N_FFT,
        hop_length=ENCODER_HOP,
        n_mels=ENCODER_MELS,
    )
    return frames.astype(np.float32).T


def _synth_mel_basis() -> np.ndarray:
    return librosa.filters.mel(
        sr=SYNTH_SR,
        n_fft=SYNTH_N_FFT,
        n_mels=SYNTH_MELS,
        fmin=SYNTH_FMIN,
        fmax=SYNTH_FMAX,
    )


def _amp_to_db(x: np.ndarray) -> np.ndarray:
    min_level = np.exp(MIN_LEVEL_DB / 20 * np.log(10))
    return 20 * np.log10(np.maximum(min_level, x))


def _normalize(s: np.ndarray) -> np.ndarray:
    """synthesizer.audio._normalize, symmetric + clipping variant."""
    clipped = np.clip(
        (2 * MAX_ABS_VALUE) * ((s - MIN_LEVEL_DB) / (-MIN_LEVEL_DB)) - MAX_ABS_VALUE,
        -MAX_ABS_VALUE,
        MAX_ABS_VALUE,
    )
    return clipped


def synth_mel(wav: np.ndarray) -> np.ndarray:
    """synthesizer.audio.melspectrogram — preemphasised, dB, ±4-normalised."""
    preemphasized = scipy.signal.lfilter([1, -PREEMPHASIS], [1], wav)
    stft = librosa.stft(
        y=preemphasized, n_fft=SYNTH_N_FFT, hop_length=SYNTH_HOP, win_length=SYNTH_WIN
    )
    mel = _synth_mel_basis() @ np.abs(stft)
    s_db = _amp_to_db(mel) - REF_LEVEL_DB
    return _normalize(s_db).astype(np.float32)


def synth_denormalize(mel: np.ndarray) -> np.ndarray:
    """synthesizer.audio._denormalize, symmetric + clipping variant."""
    return (
        (np.clip(mel, -MAX_ABS_VALUE, MAX_ABS_VALUE) + MAX_ABS_VALUE)
        * -MIN_LEVEL_DB
        / (2 * MAX_ABS_VALUE)
        + MIN_LEVEL_DB
    )


def synth_griffin_lim(mel: np.ndarray, iters: int = GRIFFIN_LIM_ITERS) -> np.ndarray:
    """synthesizer.audio.inv_mel_spectrogram (use_lws=False path) — the
    Griffin-Lim fallback's Python reference. Expects a ±4-normalised mel."""
    d = synth_denormalize(mel)
    s = np.power(10.0, (d + REF_LEVEL_DB) * 0.05)  # db_to_amp
    s = np.maximum(1e-10, np.linalg.pinv(_synth_mel_basis()) @ s)
    s = s ** 1.5  # hparams.power
    angles = np.exp(2j * np.pi * np.random.rand(*s.shape))
    y = librosa.istft(s * angles, hop_length=SYNTH_HOP, win_length=SYNTH_WIN)
    for _ in range(iters):
        angles = np.exp(1j * np.angle(
            librosa.stft(
                y=y, n_fft=SYNTH_N_FFT, hop_length=SYNTH_HOP, win_length=SYNTH_WIN
            )
        ))
        y = librosa.istft(s * angles, hop_length=SYNTH_HOP, win_length=SYNTH_WIN)
    return scipy.signal.lfilter([1], [1, -PREEMPHASIS], y)  # de-emphasis