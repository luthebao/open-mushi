use std::time::{Duration, UNIX_EPOCH};

use bytes::Bytes;
use ractor::{ActorProcessingErr, ActorRef};

use owhisper_client::{
    AdapterKind, ArgmaxAdapter, AssemblyAIAdapter, CactusAdapter, DashScopeAdapter,
    DeepgramAdapter, ElevenLabsAdapter, FireworksAdapter, GladiaAdapter, OpenMushiAdapter,
    MistralAdapter, OpenAIAdapter, RealtimeSttAdapter, SonioxAdapter,
};
use owhisper_interface::stream::Extra;
use owhisper_interface::{ControlMessage, MixedMessage};

use super::stream::process_stream;
use super::{
    ChannelSender, DEVICE_FINGERPRINT_HEADER, LISTEN_CONNECT_TIMEOUT, ListenerArgs, ListenerMsg,
    actor_error,
};
use crate::SessionErrorEvent;

pub(super) async fn spawn_rx_task(
    args: ListenerArgs,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<()>,
        tokio::sync::oneshot::Sender<()>,
        String,
    ),
    ActorProcessingErr,
> {
    let adapter_kind =
        AdapterKind::from_url_and_languages(&args.base_url, &args.languages, Some(&args.model));

    // Sherpa in-process path: bypass WebSocket adapters entirely.
    if matches!(adapter_kind, AdapterKind::Sherpa) {
        return spawn_rx_task_sherpa(args, myself)
            .await
            .map(|(tx, handle, shutdown)| (tx, handle, shutdown, "Sherpa".to_string()));
    }

    let is_dual = matches!(args.mode, crate::actors::ChannelMode::MicAndSpeaker);

    let result = match (adapter_kind, is_dual) {
        (AdapterKind::Argmax, false) => {
            spawn_rx_task_single_with_adapter::<ArgmaxAdapter>(args, myself).await
        }
        (AdapterKind::Argmax, true) => {
            spawn_rx_task_dual_with_adapter::<ArgmaxAdapter>(args, myself).await
        }
        (AdapterKind::Soniox, false) => {
            spawn_rx_task_single_with_adapter::<SonioxAdapter>(args, myself).await
        }
        (AdapterKind::Soniox, true) => {
            spawn_rx_task_dual_with_adapter::<SonioxAdapter>(args, myself).await
        }
        (AdapterKind::Fireworks, false) => {
            spawn_rx_task_single_with_adapter::<FireworksAdapter>(args, myself).await
        }
        (AdapterKind::Fireworks, true) => {
            spawn_rx_task_dual_with_adapter::<FireworksAdapter>(args, myself).await
        }
        (AdapterKind::Deepgram, false) => {
            spawn_rx_task_single_with_adapter::<DeepgramAdapter>(args, myself).await
        }
        (AdapterKind::Deepgram, true) => {
            spawn_rx_task_dual_with_adapter::<DeepgramAdapter>(args, myself).await
        }
        (AdapterKind::AssemblyAI, false) => {
            spawn_rx_task_single_with_adapter::<AssemblyAIAdapter>(args, myself).await
        }
        (AdapterKind::AssemblyAI, true) => {
            spawn_rx_task_dual_with_adapter::<AssemblyAIAdapter>(args, myself).await
        }
        (AdapterKind::OpenAI, false) => {
            spawn_rx_task_single_with_adapter::<OpenAIAdapter>(args, myself).await
        }
        (AdapterKind::OpenAI, true) => {
            spawn_rx_task_dual_with_adapter::<OpenAIAdapter>(args, myself).await
        }
        (AdapterKind::Gladia, false) => {
            spawn_rx_task_single_with_adapter::<GladiaAdapter>(args, myself).await
        }
        (AdapterKind::Gladia, true) => {
            spawn_rx_task_dual_with_adapter::<GladiaAdapter>(args, myself).await
        }
        (AdapterKind::ElevenLabs, false) => {
            spawn_rx_task_single_with_adapter::<ElevenLabsAdapter>(args, myself).await
        }
        (AdapterKind::ElevenLabs, true) => {
            spawn_rx_task_dual_with_adapter::<ElevenLabsAdapter>(args, myself).await
        }
        (AdapterKind::DashScope, false) => {
            spawn_rx_task_single_with_adapter::<DashScopeAdapter>(args, myself).await
        }
        (AdapterKind::DashScope, true) => {
            spawn_rx_task_dual_with_adapter::<DashScopeAdapter>(args, myself).await
        }
        (AdapterKind::Mistral, false) => {
            spawn_rx_task_single_with_adapter::<MistralAdapter>(args, myself).await
        }
        (AdapterKind::Mistral, true) => {
            spawn_rx_task_dual_with_adapter::<MistralAdapter>(args, myself).await
        }
        (AdapterKind::OpenMushi, false) => {
            spawn_rx_task_single_with_adapter::<OpenMushiAdapter>(args, myself).await
        }
        (AdapterKind::OpenMushi, true) => {
            spawn_rx_task_dual_with_adapter::<OpenMushiAdapter>(args, myself).await
        }
        (AdapterKind::Cactus, false) => {
            spawn_rx_task_single_with_adapter::<CactusAdapter>(args, myself).await
        }
        (AdapterKind::Cactus, true) => {
            spawn_rx_task_dual_with_adapter::<CactusAdapter>(args, myself).await
        }
        // Sherpa is handled above via early return; this arm is unreachable.
        (AdapterKind::Sherpa, _) => unreachable!("sherpa handled above"),
    }?;

    Ok((result.0, result.1, result.2, adapter_kind.to_string()))
}

fn build_listen_params(args: &ListenerArgs) -> owhisper_interface::ListenParams {
    let redemption_time_ms = if args.onboarding { "60" } else { "400" };
    owhisper_interface::ListenParams {
        model: Some(args.model.clone()),
        languages: args.languages.clone(),
        sample_rate: super::super::SAMPLE_RATE,
        keywords: args.keywords.clone(),
        custom_query: Some(std::collections::HashMap::from([(
            "redemption_time_ms".to_string(),
            redemption_time_ms.to_string(),
        )])),
        ..Default::default()
    }
}

fn build_extra(args: &ListenerArgs) -> (f64, Extra) {
    let session_offset_secs = args.session_started_at.elapsed().as_secs_f64();
    let started_unix_millis = args
        .session_started_at_unix
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis()
        .min(u64::MAX as u128) as u64;

    let extra = Extra {
        started_unix_millis,
    };

    (session_offset_secs, extra)
}

async fn spawn_rx_task_single_with_adapter<A: RealtimeSttAdapter>(
    args: ListenerArgs,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<()>,
        tokio::sync::oneshot::Sender<()>,
    ),
    ActorProcessingErr,
> {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (session_offset_secs, extra) = build_extra(&args);

    let (tx, rx) = tokio::sync::mpsc::channel::<MixedMessage<Bytes, ControlMessage>>(32);

    let client = owhisper_client::ListenClient::builder()
        .adapter::<A>()
        .api_base(args.base_url.clone())
        .api_key(args.api_key.clone())
        .params(build_listen_params(&args))
        .extra_header(DEVICE_FINGERPRINT_HEADER, openmushi_host::fingerprint())
        .build_single()
        .await;

    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let connect_result =
        tokio::time::timeout(LISTEN_CONNECT_TIMEOUT, client.from_realtime_audio(outbound)).await;

    let (listen_stream, handle) = match connect_result {
        Err(_elapsed) => {
            tracing::error!(
                session_id = %args.session_id,
                timeout_secs = LISTEN_CONNECT_TIMEOUT.as_secs_f32(),
                "listen_ws_connect_timeout(single)"
            );
            args.runtime.emit_error(SessionErrorEvent::ConnectionError {
                session_id: args.session_id.clone(),
                error: "listen_ws_connect_timeout".to_string(),
            });
            return Err(actor_error("listen_ws_connect_timeout"));
        }
        Ok(Err(e)) => {
            tracing::error!(session_id = %args.session_id, error = ?e, "listen_ws_connect_failed(single)");
            args.runtime.emit_error(SessionErrorEvent::ConnectionError {
                session_id: args.session_id.clone(),
                error: format!("listen_ws_connect_failed: {:?}", e),
            });
            return Err(actor_error(format!("listen_ws_connect_failed: {:?}", e)));
        }
        Ok(Ok(res)) => res,
    };

    let rx_task = tokio::spawn(async move {
        futures_util::pin_mut!(listen_stream);
        process_stream(
            listen_stream,
            handle,
            myself,
            shutdown_rx,
            session_offset_secs,
            extra,
        )
        .await;
    });

    Ok((ChannelSender::Single(tx), rx_task, shutdown_tx))
}

async fn spawn_rx_task_dual_with_adapter<A: RealtimeSttAdapter>(
    args: ListenerArgs,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<()>,
        tokio::sync::oneshot::Sender<()>,
    ),
    ActorProcessingErr,
> {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (session_offset_secs, extra) = build_extra(&args);

    let (tx, rx) = tokio::sync::mpsc::channel::<MixedMessage<(Bytes, Bytes), ControlMessage>>(32);

    let client = owhisper_client::ListenClient::builder()
        .adapter::<A>()
        .api_base(args.base_url.clone())
        .api_key(args.api_key.clone())
        .params(build_listen_params(&args))
        .extra_header(DEVICE_FINGERPRINT_HEADER, openmushi_host::fingerprint())
        .build_dual()
        .await;

    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let connect_result =
        tokio::time::timeout(LISTEN_CONNECT_TIMEOUT, client.from_realtime_audio(outbound)).await;

    let (listen_stream, handle) = match connect_result {
        Err(_elapsed) => {
            tracing::error!(
                session_id = %args.session_id,
                timeout_secs = LISTEN_CONNECT_TIMEOUT.as_secs_f32(),
                "listen_ws_connect_timeout(dual)"
            );
            args.runtime.emit_error(SessionErrorEvent::ConnectionError {
                session_id: args.session_id.clone(),
                error: "listen_ws_connect_timeout".to_string(),
            });
            return Err(actor_error("listen_ws_connect_timeout"));
        }
        Ok(Err(e)) => {
            tracing::error!(session_id = %args.session_id, error = ?e, "listen_ws_connect_failed(dual)");
            args.runtime.emit_error(SessionErrorEvent::ConnectionError {
                session_id: args.session_id.clone(),
                error: format!("listen_ws_connect_failed: {:?}", e),
            });
            return Err(actor_error(format!("listen_ws_connect_failed: {:?}", e)));
        }
        Ok(Ok(res)) => res,
    };

    let rx_task = tokio::spawn(async move {
        futures_util::pin_mut!(listen_stream);
        process_stream(
            listen_stream,
            handle,
            myself,
            shutdown_rx,
            session_offset_secs,
            extra,
        )
        .await;
    });

    Ok((ChannelSender::Dual(tx), rx_task, shutdown_tx))
}

// ---------------------------------------------------------------------------
// Sherpa in-process STT path
// ---------------------------------------------------------------------------

enum EngineCommand {
    Audio(
        Vec<f32>,
        std::sync::mpsc::Sender<Vec<owhisper_interface::stream::StreamResponse>>,
    ),
    Flush(std::sync::mpsc::Sender<Vec<owhisper_interface::stream::StreamResponse>>),
    Stop,
}

/// Spawns a blocking thread running [`openmushi_stt_sherpa::SherpaEngine`] and a tokio
/// task that bridges the listener audio channel to it.  Audio bytes are
/// converted to f32 samples and forwarded; transcript responses are sent back
/// to the [`ListenerActor`] via its message channel.
async fn spawn_rx_task_sherpa(
    args: ListenerArgs,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<()>,
        tokio::sync::oneshot::Sender<()>,
    ),
    ActorProcessingErr,
> {
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (session_offset_secs, extra) = build_extra(&args);
    let (tx, mut rx) = tokio::sync::mpsc::channel::<MixedMessage<Bytes, ControlMessage>>(32);

    let sherpa_config = args
        .sherpa_config
        .clone()
        .ok_or_else(|| super::actor_error("sherpa_config_missing"))?;

    let rx_task = tokio::spawn(async move {
        // std::sync channel for communicating with the blocking engine thread.
        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<EngineCommand>();

        // The sherpa-rs FFI is not async-safe — run it on a dedicated OS thread.
        let engine_handle = std::thread::spawn(move || {
            run_engine_loop(sherpa_config, cmd_rx);
        });

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(MixedMessage::Audio(bytes)) => {
                            let samples = openmushi_audio_utils::bytes_to_f32_samples(&bytes);
                            let (resp_tx, resp_rx) = std::sync::mpsc::channel();
                            if cmd_tx.send(EngineCommand::Audio(samples, resp_tx)).is_err() {
                                break;
                            }
                            // Block (on the tokio side) until the engine finishes
                            // processing this chunk.  The engine thread is fast
                            // enough for real-time audio so this won't stall.
                            if let Ok(responses) = resp_rx.recv() {
                                for mut response in responses {
                                    response.apply_offset(session_offset_secs);
                                    response.set_extra(&extra);
                                    let _ = myself.send_message(
                                        ListenerMsg::StreamResponse(response),
                                    );
                                }
                            }
                        }
                        Some(MixedMessage::Control(ControlMessage::Finalize)) => {
                            let (resp_tx, resp_rx) = std::sync::mpsc::channel();
                            let _ = cmd_tx.send(EngineCommand::Flush(resp_tx));
                            if let Ok(responses) = resp_rx.recv() {
                                for mut response in responses {
                                    response.apply_offset(session_offset_secs);
                                    response.set_extra(&extra);
                                    let _ = myself.send_message(
                                        ListenerMsg::StreamResponse(response),
                                    );
                                }
                            }
                            let _ = cmd_tx.send(EngineCommand::Stop);
                            break;
                        }
                        Some(MixedMessage::Control(ControlMessage::CloseStream)) => {
                            let _ = cmd_tx.send(EngineCommand::Stop);
                            break;
                        }
                        Some(MixedMessage::Control(ControlMessage::KeepAlive)) => {}
                        None => {
                            let _ = cmd_tx.send(EngineCommand::Stop);
                            break;
                        }
                    }
                }
                _ = &mut shutdown_rx => {
                    let _ = cmd_tx.send(EngineCommand::Stop);
                    break;
                }
            }
        }

        let _ = myself.send_message(ListenerMsg::StreamEnded);
        let _ = engine_handle.join();
    });

    Ok((ChannelSender::Single(tx), rx_task, shutdown_tx))
}

fn run_engine_loop(
    config: openmushi_stt_sherpa::SherpaEngineConfig,
    cmd_rx: std::sync::mpsc::Receiver<EngineCommand>,
) {
    let mut engine = match openmushi_stt_sherpa::SherpaEngine::new(config) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("failed to create SherpaEngine: {}", e);
            return;
        }
    };

    while let Ok(cmd) = cmd_rx.recv() {
        match cmd {
            EngineCommand::Audio(samples, reply) => {
                let responses = engine.process_audio(&samples);
                let _ = reply.send(responses);
            }
            EngineCommand::Flush(reply) => {
                let responses = engine.flush();
                let _ = reply.send(responses);
            }
            EngineCommand::Stop => break,
        }
    }
}
