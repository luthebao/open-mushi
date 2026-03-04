use std::path::PathBuf;

use sherpa_rs::diarize::{Diarize, DiarizeConfig as SherpaDiarizeConfig};

/// Configuration for offline speaker diarization.
pub struct OfflineDiarizeConfig {
    pub segmentation_model: PathBuf,
    pub embedding_model: PathBuf,
    /// Number of expected speakers. `None` = auto-detect via threshold.
    pub num_clusters: Option<i32>,
    /// Clustering threshold (default 0.5).
    pub threshold: Option<f32>,
}

/// A single speaker segment from diarization output.
#[derive(Debug, Clone)]
pub struct DiarizeSegment {
    pub start_secs: f64,
    pub end_secs: f64,
    pub speaker: i32,
}

/// Result of offline speaker diarization.
pub struct DiarizeResult {
    pub segments: Vec<DiarizeSegment>,
}

/// Run offline speaker diarization on full audio (mono f32 at 16kHz).
///
/// Returns a list of time-stamped speaker segments sorted by start time.
/// Use these to overlay speaker IDs onto word-level transcription output.
pub fn run_diarize(
    config: OfflineDiarizeConfig,
    samples: Vec<f32>,
    progress: Option<Box<dyn (Fn(i32, i32) -> i32) + Send + 'static>>,
) -> Result<DiarizeResult, crate::Error> {
    if !config.segmentation_model.exists() {
        return Err(crate::Error::ModelNotFound(config.segmentation_model));
    }
    if !config.embedding_model.exists() {
        return Err(crate::Error::ModelNotFound(config.embedding_model));
    }

    let sherpa_config = SherpaDiarizeConfig {
        num_clusters: config.num_clusters,
        threshold: config.threshold,
        ..Default::default()
    };

    let mut diarizer = Diarize::new(
        &config.segmentation_model,
        &config.embedding_model,
        sherpa_config,
    )
    .map_err(|e| crate::Error::DiarizeInit(e.to_string()))?;

    let segments = diarizer
        .compute(samples, progress)
        .map_err(|e| crate::Error::DiarizeFailed(e.to_string()))?;

    let result = DiarizeResult {
        segments: segments
            .into_iter()
            .map(|seg| DiarizeSegment {
                start_secs: seg.start as f64,
                end_secs: seg.end as f64,
                speaker: seg.speaker,
            })
            .collect(),
    };

    Ok(result)
}
