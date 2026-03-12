use std::path::Path;

use sherpa_rs::embedding_manager::EmbeddingManager;
use sherpa_rs::speaker_id::{EmbeddingExtractor, ExtractorConfig};

/// Identifies speakers by computing embeddings from speech segments and matching
/// them against an in-memory registry of known speakers.
///
/// New speakers are automatically assigned incrementing IDs (0, 1, 2, ...).
/// Returning speakers are matched against previously stored embeddings using
/// cosine similarity with the configured threshold.
pub struct SpeakerIdentifier {
    extractor: EmbeddingExtractor,
    manager: EmbeddingManager,
    threshold: f32,
    sample_rate: u32,
    /// Next speaker ID to assign when a new (unrecognised) speaker is detected.
    next_id: i32,
}

impl SpeakerIdentifier {
    /// Create a new speaker identifier.
    ///
    /// * `model_path` - Path to the NeMo SpeakerNet ONNX model file.
    /// * `threshold`  - Cosine-similarity threshold for matching (e.g. 0.5).
    /// * `sample_rate` - Audio sample rate, typically 16000.
    pub fn new(model_path: &Path, threshold: f32, sample_rate: u32) -> Result<Self, crate::Error> {
        if !model_path.exists() {
            return Err(crate::Error::ModelNotFound(model_path.to_path_buf()));
        }

        let config = ExtractorConfig {
            model: model_path.to_string_lossy().into_owned(),
            ..Default::default()
        };

        let extractor = EmbeddingExtractor::new(config)
            .map_err(|e| crate::Error::SpeakerInit(e.to_string()))?;

        let dimension = extractor.embedding_size as i32;
        let manager = EmbeddingManager::new(dimension);

        Ok(Self {
            extractor,
            manager,
            threshold,
            sample_rate,
            next_id: 0,
        })
    }

    /// Identify the speaker in the given audio samples.
    ///
    /// Returns `Some(speaker_id)` if there are enough samples to compute an
    /// embedding, or `None` if the segment is too short / the extractor is not
    /// ready.
    ///
    /// A new speaker that does not match any known embedding is automatically
    /// registered and assigned the next available integer ID.
    pub fn identify(&mut self, samples: &[f32]) -> Option<i32> {
        // Compute the embedding for this speech segment.
        let mut embedding = self
            .extractor
            .compute_speaker_embedding(samples.to_vec(), self.sample_rate)
            .ok()?;

        // Try to find a matching speaker in the registry.
        if let Some(name) = self.manager.search(&embedding, self.threshold)
            && !name.is_empty()
        {
            // Parse the stored name back to the integer speaker ID.
            return name.parse::<i32>().ok();
        }

        // No match — register as a new speaker.
        let speaker_id = self.next_id;
        let name = speaker_id.to_string();

        if self.manager.add(name, &mut embedding).is_ok() {
            self.next_id += 1;
            Some(speaker_id)
        } else {
            tracing::warn!("failed to register new speaker {speaker_id}");
            None
        }
    }

    /// Reset the speaker registry. Call this at the start of a new session so
    /// speaker IDs begin from 0 again.
    pub fn reset(&mut self) {
        let dimension = self.extractor.embedding_size as i32;
        self.manager = EmbeddingManager::new(dimension);
        self.next_id = 0;
    }
}
