use std::path::Path;

use sherpa_rs::silero_vad::{SileroVad, SileroVadConfig};

/// Default window size expected by Silero VAD (512 samples at 16kHz = 32ms).
const VAD_WINDOW_SIZE: usize = 512;

/// Default buffer size in seconds for the underlying sherpa VAD detector.
const VAD_BUFFER_SECS: f32 = 60.0;

/// A speech segment detected by VAD, containing the raw audio and timing info.
#[derive(Debug, Clone)]
pub struct SpeechSegment {
    /// Raw f32 PCM samples of the speech segment (16kHz mono).
    pub samples: Vec<f32>,
    /// Start time of the segment in seconds (relative to the first sample fed).
    pub start_secs: f64,
    /// End time of the segment in seconds.
    pub end_secs: f64,
}

/// Wraps sherpa-rs `SileroVad` to accumulate incoming audio, feed it in
/// fixed-size windows, and emit completed `SpeechSegment`s.
pub struct VadProcessor {
    vad: SileroVad,
    sample_rate: u32,
    /// Leftover samples not yet forming a complete window.
    pending: Vec<f32>,
    /// Total number of samples fed into the VAD (including pending).
    total_samples_fed: u64,
}

impl VadProcessor {
    /// Create a new VAD processor.
    ///
    /// `model_path` must point to the Silero VAD ONNX model file.
    /// `sample_rate` is typically 16000.
    pub fn new(model_path: &Path, sample_rate: u32) -> Result<Self, crate::Error> {
        let config = SileroVadConfig {
            model: model_path.to_string_lossy().into_owned(),
            sample_rate,
            window_size: VAD_WINDOW_SIZE as i32,
            threshold: 0.5,
            min_silence_duration: 0.5,
            min_speech_duration: 0.25,
            // 29s rather than 30s to stay within sherpa-onnx Whisper's 30s input limit.
            max_speech_duration: 29.0,
            ..Default::default()
        };

        let vad = SileroVad::new(config, VAD_BUFFER_SECS).map_err(|e| {
            crate::Error::VadInit(e.to_string())
        })?;

        Ok(Self {
            vad,
            sample_rate,
            pending: Vec::with_capacity(VAD_WINDOW_SIZE),
            total_samples_fed: 0,
        })
    }

    /// Feed PCM samples (16kHz mono f32) into the VAD.
    ///
    /// Returns any fully-detected speech segments. Segments are only returned
    /// once the VAD has detected a silence boundary after speech.
    pub fn process(&mut self, samples: &[f32]) -> Vec<SpeechSegment> {
        self.pending.extend_from_slice(samples);

        // Feed complete windows to the VAD.
        while self.pending.len() >= VAD_WINDOW_SIZE {
            let window: Vec<f32> = self.pending.drain(..VAD_WINDOW_SIZE).collect();
            self.vad.accept_waveform(window);
            self.total_samples_fed += VAD_WINDOW_SIZE as u64;
        }

        self.drain_segments()
    }

    /// Flush any remaining audio through the VAD. Call this at session end
    /// to retrieve any in-progress speech segments.
    pub fn flush(&mut self) -> Vec<SpeechSegment> {
        // Pad the remaining pending samples to a full window with silence.
        if !self.pending.is_empty() {
            let remaining = self.pending.len();
            self.pending.resize(VAD_WINDOW_SIZE, 0.0);
            let window: Vec<f32> = self.pending.drain(..).collect();
            self.vad.accept_waveform(window);
            self.total_samples_fed += remaining as u64;
        }

        self.vad.flush();

        self.drain_segments()
    }

    /// Drain all completed segments from the VAD's internal queue.
    fn drain_segments(&mut self) -> Vec<SpeechSegment> {
        let mut segments = Vec::new();
        let sr = self.sample_rate as f64;

        while !self.vad.is_empty() {
            let raw = self.vad.front();
            self.vad.pop();

            let start_sample = raw.start as f64;
            let end_sample = start_sample + raw.samples.len() as f64;

            segments.push(SpeechSegment {
                samples: raw.samples,
                start_secs: start_sample / sr,
                end_secs: end_sample / sr,
            });
        }

        segments
    }
}
