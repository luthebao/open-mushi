use std::path::Path;

use owhisper_interface::stream::{
    Alternatives, Channel, Metadata, ModelInfo, StreamResponse, Word,
};
use sherpa_rs::whisper::{WhisperConfig, WhisperRecognizer};

/// Wraps a sherpa-rs `WhisperRecognizer` to transcribe speech segments
/// and return results in the `StreamResponse` format expected by the
/// transcript pipeline.
pub struct Transcriber {
    recognizer: WhisperRecognizer,
    sample_rate: u32,
    language: String,
}

impl Transcriber {
    /// Create a new Whisper transcriber.
    ///
    /// * `encoder` - Path to the Whisper encoder ONNX model.
    /// * `decoder` - Path to the Whisper decoder ONNX model.
    /// * `tokens` - Path to the tokens file.
    /// * `language` - Language code (e.g. "en").
    /// * `sample_rate` - Audio sample rate, typically 16000.
    pub fn new(
        encoder: &Path,
        decoder: &Path,
        tokens: &Path,
        language: &str,
        sample_rate: u32,
    ) -> Result<Self, crate::Error> {
        let config = WhisperConfig {
            encoder: encoder.to_string_lossy().into_owned(),
            decoder: decoder.to_string_lossy().into_owned(),
            tokens: tokens.to_string_lossy().into_owned(),
            language: language.to_string(),
            num_threads: Some(2),
            ..Default::default()
        };

        let recognizer = WhisperRecognizer::new(config)
            .map_err(|e| crate::Error::WhisperInit(e.to_string()))?;

        Ok(Self {
            recognizer,
            sample_rate,
            language: language.to_string(),
        })
    }

    /// Transcribe a speech segment.
    ///
    /// * `samples` - Raw f32 PCM samples (mono, at `self.sample_rate`).
    /// * `segment_start_secs` - Absolute start time of this segment in the session.
    /// * `speaker` - Optional speaker index from diarization.
    ///
    /// Returns a `StreamResponse::TranscriptResponse` with word-level timestamps.
    pub fn transcribe(
        &mut self,
        samples: &[f32],
        segment_start_secs: f64,
        speaker: Option<i32>,
    ) -> Result<StreamResponse, crate::Error> {
        let segment_duration = samples.len() as f64 / self.sample_rate as f64;

        let result = self.recognizer.transcribe(self.sample_rate, samples);

        let text = result.text.trim().to_string();
        if text.is_empty() {
            return Ok(self.build_empty_response(segment_start_secs, segment_duration));
        }

        let words = build_words(
            &result.tokens,
            &result.timestamps,
            segment_start_secs,
            segment_start_secs + segment_duration,
            speaker,
        );

        let transcript = words
            .iter()
            .map(|w| w.word.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        let response = StreamResponse::TranscriptResponse {
            start: segment_start_secs,
            duration: segment_duration,
            is_final: true,
            speech_final: true,
            from_finalize: false,
            channel: Channel {
                alternatives: vec![Alternatives {
                    transcript,
                    words,
                    confidence: 1.0,
                    languages: vec![self.language.clone()],
                }],
            },
            metadata: Metadata {
                request_id: uuid::Uuid::new_v4().to_string(),
                model_uuid: uuid::Uuid::new_v4().to_string(),
                model_info: ModelInfo {
                    name: "sherpa-whisper".to_string(),
                    version: "0.6.8".to_string(),
                    arch: "whisper".to_string(),
                },
                extra: None,
            },
            channel_index: vec![0, 1],
        };

        Ok(response)
    }

    /// Build an empty transcript response for segments with no detected speech text.
    fn build_empty_response(&self, start: f64, duration: f64) -> StreamResponse {
        StreamResponse::TranscriptResponse {
            start,
            duration,
            is_final: true,
            speech_final: true,
            from_finalize: false,
            channel: Channel {
                alternatives: vec![Alternatives {
                    transcript: String::new(),
                    words: Vec::new(),
                    confidence: 0.0,
                    languages: vec![self.language.clone()],
                }],
            },
            metadata: Metadata::default(),
            channel_index: vec![0, 1],
        }
    }
}

/// Build word-level entries from Whisper token-level results.
///
/// Whisper returns a flat list of tokens with per-token timestamps. Tokens that
/// begin with a space (or the BPE space character U+0120 'Ġ') mark the start
/// of a new word. We group consecutive tokens into words, using the first
/// token's timestamp as the word start and the next word's first token
/// timestamp (or `segment_end_secs` for the last word) as the word end.
fn build_words(
    tokens: &[String],
    timestamps: &[f32],
    segment_start_secs: f64,
    segment_end_secs: f64,
    speaker: Option<i32>,
) -> Vec<Word> {
    if tokens.is_empty() {
        return Vec::new();
    }

    // Group tokens into words. Each group is (first_token_index, accumulated_text).
    let mut groups: Vec<(usize, String)> = Vec::new();

    for (i, token) in tokens.iter().enumerate() {
        let text = token.as_str();

        // Skip special tokens (e.g. <|startoftranscript|>, <|en|>, <|transcribe|>, etc.)
        if text.starts_with("<|") && text.ends_with("|>") {
            continue;
        }

        // Replace the BPE space character with a regular space for boundary detection.
        let normalized = text.replace('\u{0120}', " ");

        let is_word_boundary = normalized.starts_with(' ') || groups.is_empty();

        if is_word_boundary {
            // Start a new word group.
            groups.push((i, normalized.trim_start().to_string()));
        } else if let Some(last) = groups.last_mut() {
            // Append to current word group.
            last.1.push_str(&normalized);
        }
    }

    // Convert groups to Word entries with timestamps.
    let mut words = Vec::with_capacity(groups.len());

    for (group_idx, (token_idx, text)) in groups.iter().enumerate() {
        if text.is_empty() {
            continue;
        }

        let token_time = timestamps
            .get(*token_idx)
            .copied()
            .unwrap_or(0.0) as f64;

        let word_start = segment_start_secs + token_time;

        // End time: use next word's start, or segment end for the last word.
        let word_end = if group_idx + 1 < groups.len() {
            let next_token_idx = groups[group_idx + 1].0;
            let next_time = timestamps
                .get(next_token_idx)
                .copied()
                .unwrap_or(0.0) as f64;
            segment_start_secs + next_time
        } else {
            segment_end_secs
        };

        words.push(Word {
            word: text.clone(),
            start: word_start,
            end: word_end,
            confidence: 1.0,
            speaker,
            punctuated_word: Some(text.clone()),
            language: None,
        });
    }

    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_words_empty() {
        let words = build_words(&[], &[], 0.0, 1.0, None);
        assert!(words.is_empty());
    }

    #[test]
    fn test_build_words_basic() {
        // Simulate Whisper tokens: " Hello", " world"
        let tokens = vec![
            " Hello".to_string(),
            " world".to_string(),
        ];
        let timestamps = vec![0.0, 0.5];

        let words = build_words(&tokens, &timestamps, 10.0, 11.0, Some(0));

        assert_eq!(words.len(), 2);
        assert_eq!(words[0].word, "Hello");
        assert_eq!(words[0].start, 10.0);
        assert_eq!(words[0].end, 10.5);
        assert_eq!(words[0].speaker, Some(0));

        assert_eq!(words[1].word, "world");
        assert_eq!(words[1].start, 10.5);
        assert_eq!(words[1].end, 11.0);
    }

    #[test]
    fn test_build_words_multi_token() {
        // "un" + "believ" + "able" form one word, " stuff" is a new word
        let tokens = vec![
            " un".to_string(),
            "believ".to_string(),
            "able".to_string(),
            " stuff".to_string(),
        ];
        let timestamps = vec![0.0, 0.1, 0.2, 0.5];

        let words = build_words(&tokens, &timestamps, 0.0, 1.0, None);

        assert_eq!(words.len(), 2);
        assert_eq!(words[0].word, "unbelievable");
        assert_eq!(words[0].start, 0.0);
        assert_eq!(words[0].end, 0.5);

        assert_eq!(words[1].word, "stuff");
        assert_eq!(words[1].start, 0.5);
        assert_eq!(words[1].end, 1.0);
    }

    #[test]
    fn test_build_words_skips_special_tokens() {
        let tokens = vec![
            "<|startoftranscript|>".to_string(),
            "<|en|>".to_string(),
            " Hello".to_string(),
            "<|endoftext|>".to_string(),
        ];
        let timestamps = vec![0.0, 0.0, 0.2, 0.8];

        let words = build_words(&tokens, &timestamps, 5.0, 6.0, None);

        assert_eq!(words.len(), 1);
        assert_eq!(words[0].word, "Hello");
        assert!((words[0].start - 5.2).abs() < 1e-6);
        assert!((words[0].end - 6.0).abs() < 1e-6);
    }

    #[test]
    fn test_build_words_bpe_space() {
        // BPE uses U+0120 as space prefix
        let tokens = vec![
            "\u{0120}Hello".to_string(),
            "\u{0120}world".to_string(),
        ];
        let timestamps = vec![0.0, 0.4];

        let words = build_words(&tokens, &timestamps, 0.0, 1.0, None);

        assert_eq!(words.len(), 2);
        assert_eq!(words[0].word, "Hello");
        assert_eq!(words[1].word, "world");
    }
}
