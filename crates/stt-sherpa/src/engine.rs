use owhisper_interface::stream::StreamResponse;

use crate::config::SherpaEngineConfig;
use crate::speaker::SpeakerIdentifier;
use crate::transcriber::Transcriber;
use crate::vad::VadProcessor;
use crate::Error;

/// High-level STT engine that combines VAD, Whisper transcription, and speaker
/// identification into a single processing pipeline.
///
/// Feed raw PCM audio via [`process_audio`](Self::process_audio) and receive
/// transcript responses whenever the VAD detects completed speech segments.
/// Call [`flush`](Self::flush) at session end to retrieve any in-progress segment.
pub struct SherpaEngine {
    vad: VadProcessor,
    transcriber: Transcriber,
    speaker: Option<SpeakerIdentifier>,
    /// Total number of raw samples fed into the engine, used to compute the
    /// absolute time offset for VAD-relative timestamps.
    samples_processed: u64,
}

impl SherpaEngine {
    /// Create a new engine from the given configuration.
    ///
    /// Validates that all model files exist, then initialises the VAD,
    /// Whisper transcriber, and speaker identifier.
    pub fn new(config: SherpaEngineConfig) -> Result<Self, Error> {
        config.validate()?;

        let vad = VadProcessor::new(&config.vad_model, config.sample_rate)?;

        let transcriber = Transcriber::new(
            &config.whisper_encoder,
            &config.whisper_decoder,
            &config.whisper_tokens,
            &config.whisper_language,
            config.sample_rate,
        )?;

        let speaker = match config.speaker_model {
            Some(ref model_path) => Some(SpeakerIdentifier::new(
                model_path,
                config.speaker_threshold.unwrap_or(0.5),
                config.sample_rate,
            )?),
            None => None,
        };

        Ok(Self {
            vad,
            transcriber,
            speaker,
            samples_processed: 0,
        })
    }

    /// Feed raw PCM samples (mono f32, at the configured sample rate) into the
    /// engine.
    ///
    /// Returns a (usually empty) list of transcript responses — one for each
    /// speech segment that the VAD has finalised since the last call.
    pub fn process_audio(&mut self, samples: &[f32]) -> Vec<StreamResponse> {
        // The VAD produces segment timestamps relative to its own internal
        // sample counter (which starts at 0 and never resets). Because we
        // never reset the VAD within a session these timestamps are already
        // absolute relative to the session start, so no additional offset
        // adjustment is needed here.
        let segments = self.vad.process(samples);
        self.samples_processed += samples.len() as u64;

        let mut responses = Vec::new();

        for segment in segments {
            tracing::debug!(
                start_secs = segment.start_secs,
                end_secs = segment.end_secs,
                duration_secs = segment.end_secs - segment.start_secs,
                samples = segment.samples.len(),
                "processing VAD segment"
            );

            let speaker = self.speaker.as_mut().and_then(|s| s.identify(&segment.samples));

            if let Some(speaker_id) = speaker {
                tracing::debug!(speaker_id, "speaker identified for segment");
            }

            match self.transcriber.transcribe(
                &segment.samples,
                segment.start_secs,
                speaker,
            ) {
                Ok(response) => {
                    if !is_empty_transcript(&response) {
                        responses.push(response);
                    }
                }
                Err(e) => {
                    tracing::warn!("transcription failed for segment at {:.2}s: {e}", segment.start_secs);
                }
            }
        }

        responses
    }

    /// Flush any remaining audio through the VAD and return a final transcript
    /// response if speech was in progress.
    ///
    /// Call this when the recording session ends. The returned responses will
    /// have `from_finalize` set to `true` so the frontend can distinguish them
    /// from normal mid-session results.
    pub fn flush(&mut self) -> Vec<StreamResponse> {
        let mut responses = Vec::new();

        for segment in self.vad.flush() {
            let speaker = self.speaker.as_mut().and_then(|s| s.identify(&segment.samples));

            match self.transcriber.transcribe(
                &segment.samples,
                segment.start_secs,
                speaker,
            ) {
                Ok(mut response) => {
                    // Mark the response so downstream consumers know this came
                    // from a flush (session end) rather than a natural silence
                    // boundary.
                    if let StreamResponse::TranscriptResponse {
                        ref mut from_finalize,
                        ..
                    } = response
                    {
                        *from_finalize = true;
                    }

                    if !is_empty_transcript(&response) {
                        responses.push(response);
                    }
                }
                Err(e) => {
                    tracing::warn!("transcription failed during flush: {e}");
                }
            }
        }

        responses
    }

    /// Reset the speaker registry and sample counter.
    ///
    /// Call this at the start of a new session so speaker IDs begin from 0
    /// again.
    pub fn reset_speakers(&mut self) {
        if let Some(ref mut speaker) = self.speaker {
            speaker.reset();
        }
        self.samples_processed = 0;
    }
}

/// Returns `true` if the response is a transcript with an empty text.
fn is_empty_transcript(response: &StreamResponse) -> bool {
    match response {
        StreamResponse::TranscriptResponse { channel, .. } => {
            channel.alternatives.iter().all(|a| a.transcript.is_empty())
        }
        _ => false,
    }
}
