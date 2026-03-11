use openmushi_listener_core::ListenerRuntime;
use owhisper_interface::stream::StreamResponse;
use tauri_plugin_fs_db::{EnhancedNoteData, FsDbPluginExt, SpeakerHint, TranscriptData, Word};
use tauri_plugin_local_llm::LocalLlmPluginExt;
use tauri_plugin_local_stt::{LocalSttPluginExt, SherpaSttModel};
use tauri_plugin_settings::SettingsPluginExt;
use tauri_specta::Event;

const SUMMARY_FILENAME: &str = "_summary.md";
const SUMMARY_NOTE_TITLE: &str = "Summary";
const LOW_CONFIDENCE_THRESHOLD: f64 = 0.5;

#[derive(Debug, Clone, Copy)]
struct TranscriptionStats {
    total_words: usize,
    low_confidence_words: usize,
}

pub struct TauriRuntime {
    pub app: tauri::AppHandle,
}

impl openmushi_storage::StorageRuntime for TauriRuntime {
    fn global_base(&self) -> Result<std::path::PathBuf, openmushi_storage::Error> {
        self.app
            .settings()
            .global_base()
            .map(|p| p.into_std_path_buf())
            .map_err(|_| openmushi_storage::Error::DataDirUnavailable)
    }

    fn vault_base(&self) -> Result<std::path::PathBuf, openmushi_storage::Error> {
        self.app
            .settings()
            .cached_vault_base()
            .map(|p| p.into_std_path_buf())
            .map_err(|_| openmushi_storage::Error::DataDirUnavailable)
    }
}

impl ListenerRuntime for TauriRuntime {
    fn emit_lifecycle(&self, event: openmushi_listener_core::SessionLifecycleEvent) {
        use tauri_plugin_tray::TrayPluginExt;
        match &event {
            openmushi_listener_core::SessionLifecycleEvent::Active { .. } => {
                let _ = self.app.tray().set_start_disabled(true);
            }
            openmushi_listener_core::SessionLifecycleEvent::Inactive { .. } => {
                let _ = self.app.tray().set_start_disabled(false);
            }
            openmushi_listener_core::SessionLifecycleEvent::Finalizing { .. } => {}
        }

        if let Err(error) = event.emit(&self.app) {
            tracing::error!(?error, "failed_to_emit_lifecycle_event");
        }
    }

    fn emit_progress(&self, event: openmushi_listener_core::SessionProgressEvent) {
        if let Err(error) = event.emit(&self.app) {
            tracing::error!(?error, "failed_to_emit_progress_event");
        }
    }

    fn emit_error(&self, event: openmushi_listener_core::SessionErrorEvent) {
        if let Err(error) = event.emit(&self.app) {
            tracing::error!(?error, "failed_to_emit_error_event");
        }
    }

    fn emit_data(&self, event: openmushi_listener_core::SessionDataEvent) {
        if let Err(error) = event.emit(&self.app) {
            tracing::error!(?error, "failed_to_emit_data_event");
        }
    }

    fn emit_recording(&self, event: openmushi_listener_core::SessionRecordingEvent) {
        if let Err(error) = event.emit(&self.app) {
            tracing::error!(?error, "failed_to_emit_recording_event");
        }
    }

    fn run_stt_job(&self, session_id: &str, audio_path: &std::path::Path) -> Result<(), String> {
        let file_path = audio_path.to_string_lossy().to_string();
        tracing::info!(%session_id, %file_path, "running_batch_stt_job");

        tauri::async_runtime::block_on(async {
            let responses = self
                .app
                .local_stt()
                .run_batch_sherpa(&file_path, SherpaSttModel::WhisperSmall, None, None, None)
                .await
                .map_err(|e| e.to_string())?;

            let (transcript, stats) = map_stt_responses_to_transcript(session_id, responses);
            emit_transcription_diagnostics(&self.app, session_id, &transcript, stats);

            if stats.total_words == 0 {
                return Err("no_speech_detected".to_string());
            }

            self.app
                .fs_db()
                .save_session_transcript(session_id, transcript)
                .await
                .map_err(|e| format!("save_session_transcript_failed: {}", e))
        })
    }

    fn run_llm_job(&self, session_id: &str) -> Result<(), String> {
        tracing::info!(%session_id, "running_llm_summarization_job");

        tauri::async_runtime::block_on(async {
            let transcript = self
                .app
                .fs_db()
                .load_session_transcript(session_id)
                .await
                .map_err(|e| format!("load_session_transcript_failed: {}", e))?;

            let transcript_context = build_transcript_context(&transcript.transcripts).map_err(|e| {
                format!(
                    "transcript_unavailable_or_empty_for_session: {} ({})",
                    session_id, e
                )
            })?;
            let user_prompt = build_summary_user_prompt(session_id, &transcript_context);

            let base_url = match self.app.server_url().await.map_err(|e| e.to_string())? {
                Some(url) => url,
                None => self.app.start_server().await.map_err(|e| e.to_string())?,
            };

            let endpoint = if base_url.ends_with("/v1") {
                format!("{}/chat/completions", base_url.trim_end_matches('/'))
            } else {
                format!("{}/v1/chat/completions", base_url.trim_end_matches('/'))
            };

            let payload = serde_json::json!({
                "model": "openmushi-local",
                "messages": [
                    {
                        "role": "system",
                        "content": "You summarize meeting transcripts into concise markdown with clear sections and action items when present."
                    },
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ],
                "temperature": 0.2,
                "stream": false
            });

            let client = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(5))
                .timeout(std::time::Duration::from_secs(45))
                .build()
                .map_err(|e| format!("llm_http_client_build_failed: {}", e))?;

            let response = client
                .post(endpoint)
                .json(&payload)
                .send()
                .await
                .map_err(|e| {
                    if e.is_timeout() {
                        "llm_http_timeout".to_string()
                    } else {
                        format!("llm_http_request_failed: {}", e)
                    }
                })?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("llm_completion_failed: {} {}", status, body));
            }

            let response_json: serde_json::Value =
                response.json().await.map_err(|e| format!("llm_invalid_json: {}", e))?;
            let summary_md = extract_summary_markdown(&response_json)?;
            persist_summary_note(&self.app, session_id, &summary_md).await
        })
    }
}

fn build_summary_user_prompt(session_id: &str, transcript_context: &str) -> String {
    format!(
        "Generate a concise markdown summary for session `{}`.\n\nRequirements:\n- Use only transcript evidence.\n- Include: Overview, Key Points, Decisions, Action Items.\n- If a section has no evidence, state \"None noted\".\n- Keep it brief and deterministic.\n\nTranscript:\n{}",
        session_id, transcript_context
    )
}

fn build_transcript_context(transcripts: &[TranscriptData]) -> Result<String, String> {
    let mut words = transcripts
        .iter()
        .flat_map(|t| t.words.iter())
        .collect::<Vec<&Word>>();

    words.sort_by_key(|w| w.start_ms);

    let mut lines = Vec::new();
    for word in words {
        let text = word.text.trim();
        if text.is_empty() {
            continue;
        }

        let start = format_timestamp(word.start_ms);
        let end = format_timestamp(word.end_ms);

        match word.speaker.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(speaker) => lines.push(format!("- [{}-{}] {}: {}", start, end, speaker, text)),
            None => lines.push(format!("- [{}-{}] {}", start, end, text)),
        }
    }

    if lines.is_empty() {
        return Err("no transcript words available".to_string());
    }

    Ok(lines.join("\n"))
}

fn format_timestamp(ms: i64) -> String {
    let total_seconds = (ms.max(0) as u64) / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

fn extract_summary_markdown(response_json: &serde_json::Value) -> Result<String, String> {
    let Some(content) = response_json
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
    else {
        return Err("llm_response_missing_content".to_string());
    };

    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("llm_response_empty_content".to_string());
    }

    Ok(trimmed.to_string())
}

async fn persist_summary_note(
    app: &tauri::AppHandle,
    session_id: &str,
    summary_markdown: &str,
) -> Result<(), String> {
    let tiptap_json = openmushi_tiptap::md_to_tiptap_json(summary_markdown)
        .map_err(|e| format!("summary_markdown_to_tiptap_failed: {}", e))?;

    let note = EnhancedNoteData {
        id: format!("summary-{}", session_id),
        session_id: session_id.to_string(),
        template_id: None,
        position: 0,
        title: Some(SUMMARY_NOTE_TITLE.to_string()),
        content: tiptap_json.to_string(),
    };

    app.fs_db()
        .save_session_enhanced_note(session_id, note, SUMMARY_FILENAME)
        .await
        .map_err(|e| format!("save_summary_failed: {}", e))
}

fn map_stt_responses_to_transcript(
    session_id: &str,
    responses: Vec<StreamResponse>,
) -> (TranscriptData, TranscriptionStats) {
    #[derive(Clone)]
    struct WordDraft {
        id: String,
        text: String,
        start_ms: i64,
        end_ms: i64,
        channel: i32,
        speaker_index: Option<i32>,
    }

    let mut drafts: Vec<WordDraft> = Vec::new();
    let mut low_confidence_words = 0usize;

    for response in responses {
        let StreamResponse::TranscriptResponse {
            is_final,
            channel,
            channel_index,
            ..
        } = response
        else {
            continue;
        };

        if !is_final {
            continue;
        }

        let channel_value = channel_index.first().copied().unwrap_or(0);

        if let Some(alternative) = channel.alternatives.first() {
            for word in &alternative.words {
                if word.confidence < LOW_CONFIDENCE_THRESHOLD {
                    low_confidence_words += 1;
                }

                drafts.push(WordDraft {
                    id: format!("w-{}-{}", session_id, drafts.len()),
                    text: word.punctuated_word.clone().unwrap_or_else(|| word.word.clone()),
                    start_ms: (word.start * 1000.0).round() as i64,
                    end_ms: (word.end * 1000.0).round() as i64,
                    channel: channel_value,
                    speaker_index: word.speaker,
                });
            }
        }
    }

    drafts.sort_by_key(|word| (word.start_ms, word.end_ms));

    let started_at = drafts.first().map(|w| w.start_ms).unwrap_or(0);
    let ended_at = drafts.last().map(|w| w.end_ms);

    let words: Vec<Word> = drafts
        .iter()
        .map(|word| Word {
            id: word.id.clone(),
            text: word.text.clone(),
            start_ms: word.start_ms,
            end_ms: word.end_ms,
            channel: word.channel,
            speaker: word.speaker_index.map(|idx| format!("Speaker {}", idx + 1)),
        })
        .collect();

    let speaker_hints: Vec<SpeakerHint> = drafts
        .iter()
        .enumerate()
        .filter_map(|(idx, word)| {
            let speaker_index = word.speaker_index?;
            Some(SpeakerHint {
                id: format!("h-{}-{}", session_id, idx),
                word_id: word.id.clone(),
                hint_type: "provider_speaker_index".to_string(),
                value: serde_json::json!({
                    "provider": "sherpa",
                    "channel": word.channel,
                    "speaker_index": speaker_index,
                }),
            })
        })
        .collect();

    let transcript = TranscriptData {
        id: format!("stt-{}", session_id),
        user_id: String::new(),
        created_at: format!(
            "{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default()
        ),
        session_id: session_id.to_string(),
        started_at,
        ended_at,
        words,
        speaker_hints,
    };

(
        transcript,
        TranscriptionStats {
            total_words: drafts.len(),
            low_confidence_words,
        },
    )
}

fn emit_transcription_diagnostics(
    app: &tauri::AppHandle,
    session_id: &str,
    transcript: &TranscriptData,
    stats: TranscriptionStats,
) {
    if stats.total_words == 0 {
        let _ = openmushi_listener_core::SessionRecordingEvent::RecordingDiagnostic {
            session_id: Some(session_id.to_string()),
            stage: "transcription_analysis".to_string(),
            queue_depth: 0,
            latency_ms: None,
            message: "no speech detected in transcription output".to_string(),
            error: Some("no_speech_detected".to_string()),
        }
        .emit(app);
        return;
    }

    if transcript.words.is_empty() {
        let _ = openmushi_listener_core::SessionRecordingEvent::RecordingDiagnostic {
            session_id: Some(session_id.to_string()),
            stage: "transcription_analysis".to_string(),
            queue_depth: 0,
            latency_ms: None,
            message: "transcription output contained no persisted words".to_string(),
            error: Some("empty_transcript".to_string()),
        }
        .emit(app);
    }

    if stats.low_confidence_words > 0 {
        let _ = openmushi_listener_core::SessionRecordingEvent::RecordingDiagnostic {
            session_id: Some(session_id.to_string()),
            stage: "transcription_analysis".to_string(),
            queue_depth: 0,
            latency_ms: None,
            message: format!(
                "detected {} low-confidence words below {:.2}",
                stats.low_confidence_words, LOW_CONFIDENCE_THRESHOLD
            ),
            error: None,
        }
        .emit(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_builder_includes_transcript_content() {
        let prompt = build_summary_user_prompt("session-123", "- [00:00:01-00:00:02] hello world");
        assert!(prompt.contains("session-123"));
        assert!(prompt.contains("hello world"));
        assert!(prompt.contains("Transcript:"));
    }

    #[test]
    fn empty_transcript_returns_error() {
        let transcript = vec![TranscriptData {
            id: "t1".into(),
            user_id: "u1".into(),
            created_at: "2026-03-11T00:00:00Z".into(),
            session_id: "s1".into(),
            started_at: 0,
            ended_at: None,
            words: vec![],
            speaker_hints: vec![],
        }];

        let err = build_transcript_context(&transcript).unwrap_err();
        assert!(err.contains("no transcript words available"));
    }

    #[test]
    fn transcript_context_includes_speaker_and_timestamps() {
        let transcript = vec![TranscriptData {
            id: "t1".into(),
            user_id: "u1".into(),
            created_at: "2026-03-11T00:00:00Z".into(),
            session_id: "s1".into(),
            started_at: 0,
            ended_at: None,
            words: vec![Word {
                id: "w1".into(),
                text: "Decision approved".into(),
                start_ms: 1_000,
                end_ms: 2_000,
                channel: 0,
                speaker: Some("Alice".into()),
            }],
            speaker_hints: vec![],
        }];

        let context = build_transcript_context(&transcript).unwrap();
        assert!(context.contains("[00:00:01-00:00:02]"));
        assert!(context.contains("Alice: Decision approved"));
    }

    #[test]
    fn extract_summary_markdown_fails_when_choices_missing() {
        let json = serde_json::json!({});
        let err = extract_summary_markdown(&json).unwrap_err();
        assert_eq!(err, "llm_response_missing_content");
    }

    #[test]
    fn extract_summary_markdown_fails_when_choices_empty() {
        let json = serde_json::json!({ "choices": [] });
        let err = extract_summary_markdown(&json).unwrap_err();
        assert_eq!(err, "llm_response_missing_content");
    }

    #[test]
    fn extract_summary_markdown_fails_when_message_content_missing() {
        let json = serde_json::json!({
            "choices": [
                {
                    "message": {}
                }
            ]
        });
        let err = extract_summary_markdown(&json).unwrap_err();
        assert_eq!(err, "llm_response_missing_content");
    }

    #[test]
    fn extract_summary_markdown_fails_when_message_content_not_string() {
        let json = serde_json::json!({
            "choices": [
                {
                    "message": {
                        "content": 123
                    }
                }
            ]
        });
        let err = extract_summary_markdown(&json).unwrap_err();
        assert_eq!(err, "llm_response_missing_content");
    }

    #[test]
    fn extract_summary_markdown_fails_when_message_content_empty_string() {
        let json = serde_json::json!({
            "choices": [
                {
                    "message": {
                        "content": "   "
                    }
                }
            ]
        });
        let err = extract_summary_markdown(&json).unwrap_err();
        assert_eq!(err, "llm_response_empty_content");
    }

    #[test]
    fn stt_mapping_preserves_timestamps_and_speaker_hints() {
        let responses = vec![StreamResponse::TranscriptResponse {
            start: 0.0,
            duration: 1.5,
            is_final: true,
            speech_final: true,
            from_finalize: true,
            channel: owhisper_interface::stream::Channel {
                alternatives: vec![owhisper_interface::stream::Alternatives {
                    transcript: "Hello world".into(),
                    words: vec![
                        owhisper_interface::stream::Word {
                            word: "hello".into(),
                            start: 0.0,
                            end: 0.5,
                            confidence: 0.99,
                            speaker: Some(0),
                            punctuated_word: Some("Hello".into()),
                            language: Some("en".into()),
                        },
                        owhisper_interface::stream::Word {
                            word: "world".into(),
                            start: 0.6,
                            end: 1.4,
                            confidence: 0.95,
                            speaker: Some(1),
                            punctuated_word: Some("world".into()),
                            language: Some("en".into()),
                        },
                    ],
                    confidence: 0.97,
                    languages: vec!["en".into()],
                }],
            },
            metadata: owhisper_interface::stream::Metadata::default(),
            channel_index: vec![2],
        }];

        let (transcript, stats) = map_stt_responses_to_transcript("session-1", responses);

        assert_eq!(stats.total_words, 2);
        assert_eq!(stats.low_confidence_words, 0);
        assert_eq!(transcript.words.len(), 2);
        assert_eq!(transcript.words[0].start_ms, 0);
        assert_eq!(transcript.words[0].end_ms, 500);
        assert_eq!(transcript.words[0].channel, 2);
        assert_eq!(transcript.words[0].speaker.as_deref(), Some("Speaker 1"));
        assert_eq!(transcript.words[1].start_ms, 600);
        assert_eq!(transcript.words[1].end_ms, 1400);
        assert_eq!(transcript.words[1].speaker.as_deref(), Some("Speaker 2"));

        assert_eq!(transcript.speaker_hints.len(), 2);
        assert_eq!(transcript.speaker_hints[0].word_id, transcript.words[0].id);
        assert_eq!(transcript.speaker_hints[0].hint_type, "provider_speaker_index");
        assert_eq!(transcript.speaker_hints[0].value["speaker_index"], 0);
        assert_eq!(transcript.speaker_hints[0].value["channel"], 2);
        assert_eq!(transcript.speaker_hints[1].value["speaker_index"], 1);
    }

    #[test]
    fn stt_mapping_skips_non_final_and_reports_low_confidence_counts() {
        let responses = vec![
            StreamResponse::TranscriptResponse {
                start: 0.0,
                duration: 0.8,
                is_final: false,
                speech_final: false,
                from_finalize: false,
                channel: owhisper_interface::stream::Channel {
                    alternatives: vec![owhisper_interface::stream::Alternatives {
                        transcript: "partial".into(),
                        words: vec![owhisper_interface::stream::Word {
                            word: "partial".into(),
                            start: 0.0,
                            end: 0.8,
                            confidence: 0.4,
                            speaker: None,
                            punctuated_word: None,
                            language: Some("en".into()),
                        }],
                        confidence: 0.4,
                        languages: vec!["en".into()],
                    }],
                },
                metadata: owhisper_interface::stream::Metadata::default(),
                channel_index: vec![0],
            },
            StreamResponse::TranscriptResponse {
                start: 0.8,
                duration: 0.8,
                is_final: true,
                speech_final: true,
                from_finalize: true,
                channel: owhisper_interface::stream::Channel {
                    alternatives: vec![owhisper_interface::stream::Alternatives {
                        transcript: "final".into(),
                        words: vec![owhisper_interface::stream::Word {
                            word: "final".into(),
                            start: 0.8,
                            end: 1.6,
                            confidence: 0.3,
                            speaker: None,
                            punctuated_word: Some("final".into()),
                            language: Some("en".into()),
                        }],
                        confidence: 0.3,
                        languages: vec!["en".into()],
                    }],
                },
                metadata: owhisper_interface::stream::Metadata::default(),
                channel_index: vec![0],
            },
        ];

        let (transcript, stats) = map_stt_responses_to_transcript("session-2", responses);

        assert_eq!(transcript.words.len(), 1);
        assert_eq!(transcript.words[0].text, "final");
        assert_eq!(stats.total_words, 1);
        assert_eq!(stats.low_confidence_words, 1);
    }
}
