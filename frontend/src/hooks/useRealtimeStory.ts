import { useCallback, useEffect, useRef, useState } from "react"

import type { ChatMessagePublic, ChatMessageSender } from "../client"
import { API_BASE_URL } from "../config"

export type VoiceStoryStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"

interface RealtimeEvent {
  type: string
  delta?: string
  transcript?: string
  item_id?: string
  error?: { message?: string }
}

interface UseRealtimeStoryOptions {
  conversationId: number
  suppressFirstAssistantTranscript: boolean
  canWrapUp: boolean
  onUserMessage: (message: ChatMessagePublic, itemId?: string) => void
  onUserTranscriptDelta: (itemId: string, delta: string) => void
  onUserTranscriptFailed: (itemId: string) => void
  onAssistantStart: () => void
  onAssistantDelta: (delta: string) => void
  onAssistantComplete: () => void
  onAssistantCancelled: () => void
  onConversationChanged: (includeChatMessages?: boolean) => void
  onWrapRequested: () => void
  onError: (message: string) => void
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Voice conversation could not start."

const explicitPauseRequestPatterns = [
  /\b(?:can|could|would)\s+we\s+(?:please\s+)?(?:pause|stop)\b/i,
  /\b(?:let['’]s|we should|i(?:'d like| want) to)\s+(?:pause|stop)\b/i,
  /\b(?:pause|stop)\s+(?:for now|here|this conversation)\b/i,
  /\b(?:take|call)\s+a break\b/i,
  /\b(?:i['’]?m|i am)\s+done\s+for now\b/i,
]

const waitForIceGathering = (connection: RTCPeerConnection) => {
  if (connection.iceGatheringState === "complete") return Promise.resolve()

  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout)
      connection.removeEventListener("icegatheringstatechange", onStateChange)
      resolve()
    }
    const onStateChange = () => {
      if (connection.iceGatheringState === "complete") finish()
    }
    const timeout = window.setTimeout(finish, 4_000)

    connection.addEventListener("icegatheringstatechange", onStateChange)
  })
}

export function useRealtimeStory({
  conversationId,
  suppressFirstAssistantTranscript,
  canWrapUp,
  onUserMessage,
  onUserTranscriptDelta,
  onUserTranscriptFailed,
  onAssistantStart,
  onAssistantDelta,
  onAssistantComplete,
  onAssistantCancelled,
  onConversationChanged,
  onWrapRequested,
  onError,
}: UseRealtimeStoryOptions) {
  const [status, setStatus] = useState<VoiceStoryStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const callbacksRef = useRef({
    onUserMessage,
    onUserTranscriptDelta,
    onUserTranscriptFailed,
    onAssistantStart,
    onAssistantDelta,
    onAssistantComplete,
    onAssistantCancelled,
    onConversationChanged,
    canWrapUp,
    onWrapRequested,
    onError,
  })
  const connectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startAttemptSequenceRef = useRef(0)
  const activeStartAttemptRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const assistantTranscriptsRef = useRef(new Map<string, string>())
  const assistantStreamingRef = useRef(false)
  const userSpeechActiveRef = useRef(false)
  const pauseRequestedRef = useRef(false)
  const suppressFirstAssistantTranscriptRef = useRef(false)
  const suppressedAssistantItemRef = useRef<string | null>(null)
  const userTranscriptsRef = useRef(new Map<string, string>())
  const persistedUserItemsRef = useRef(new Set<string>())
  const pendingUserItemsRef = useRef(new Set<string>())
  const deferredAssistantTranscriptsRef = useRef<RealtimeEvent[]>([])
  const realtimeEventQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    callbacksRef.current = {
      onUserMessage,
      onUserTranscriptDelta,
      onUserTranscriptFailed,
      onAssistantStart,
      onAssistantDelta,
      onAssistantComplete,
      onAssistantCancelled,
      onConversationChanged,
      canWrapUp,
      onWrapRequested,
      onError,
    }
  }, [
    onAssistantComplete,
    onAssistantDelta,
    onAssistantStart,
    onAssistantCancelled,
    onConversationChanged,
    canWrapUp,
    onWrapRequested,
    onError,
    onUserMessage,
    onUserTranscriptDelta,
    onUserTranscriptFailed,
  ])

  const clearConnection = useCallback(() => {
    activeStartAttemptRef.current = null
    dataChannelRef.current?.close()
    dataChannelRef.current = null
    connectionRef.current?.close()
    connectionRef.current = null
    for (const track of streamRef.current?.getTracks() || []) {
      track.stop()
    }
    streamRef.current = null
    audioRef.current?.pause()
    if (audioRef.current) audioRef.current.srcObject = null
    audioRef.current?.remove()
    audioRef.current = null
    assistantTranscriptsRef.current.clear()
    assistantStreamingRef.current = false
    userSpeechActiveRef.current = false
    suppressFirstAssistantTranscriptRef.current = false
    suppressedAssistantItemRef.current = null
    userTranscriptsRef.current.clear()
    pendingUserItemsRef.current.clear()
    deferredAssistantTranscriptsRef.current = []
  }, [])

  const persistMessage = useCallback(
    async (senderType: ChatMessageSender, content: string) => {
      const token = localStorage.getItem("access_token")
      if (!token) throw new Error("Please log in again to save this story.")

      const response = await fetch(
        `${API_BASE_URL}/api/v1/chat_messages/${conversationId}/messages/persist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sender_type: senderType, content }),
        },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || "Unable to save this story turn.")
      }

      return (await response.json()) as ChatMessagePublic
    },
    [conversationId],
  )

  const persistUserTranscript = useCallback(
    async (itemId: string, content: string) => {
      if (!content.trim() || persistedUserItemsRef.current.has(itemId)) return
      const onUserMessage = callbacksRef.current.onUserMessage
      const onConversationChanged = callbacksRef.current.onConversationChanged
      // Mark before awaiting so the final event and Stop cannot save the same turn twice.
      persistedUserItemsRef.current.add(itemId)
      try {
        const message = await persistMessage("user", content.trim())
        userTranscriptsRef.current.delete(itemId)
        onUserMessage(message, itemId)
        onConversationChanged(false)
      } catch (persistError) {
        persistedUserItemsRef.current.delete(itemId)
        throw persistError
      }
    },
    [persistMessage],
  )

  const failVoiceSession = useCallback(
    (message: string) => {
      const unfinishedTranscripts = [...userTranscriptsRef.current.entries()]
      const assistantWasStreaming = assistantStreamingRef.current
      clearConnection()
      if (assistantWasStreaming) callbacksRef.current.onAssistantCancelled()
      setError(message)
      setStatus("error")
      callbacksRef.current.onError(message)
      for (const [itemId, transcript] of unfinishedTranscripts) {
        void persistUserTranscript(itemId, transcript).catch(() => undefined)
      }
    },
    [clearConnection, persistUserTranscript],
  )

  const saveAssistantTranscript = useCallback(
    async (event: RealtimeEvent) => {
      const itemId = event.item_id || "assistant"
      const isOpeningQuestion =
        suppressFirstAssistantTranscriptRef.current ||
        suppressedAssistantItemRef.current === itemId
      if (isOpeningQuestion) {
        suppressFirstAssistantTranscriptRef.current = false
        suppressedAssistantItemRef.current = null
        assistantTranscriptsRef.current.delete(itemId)
        setStatus("connected")
        return
      }

      const transcript =
        event.transcript || assistantTranscriptsRef.current.get(itemId) || ""
      if (!transcript.trim()) return

      const onAssistantComplete = callbacksRef.current.onAssistantComplete
      const onConversationChanged = callbacksRef.current.onConversationChanged
      await persistMessage("ai", transcript.trim())
      assistantTranscriptsRef.current.delete(itemId)
      assistantStreamingRef.current = false
      onAssistantComplete()
      onConversationChanged(true)
      setStatus("connected")
    },
    [persistMessage],
  )

  const saveDeferredAssistantTranscripts = useCallback(async () => {
    if (pendingUserItemsRef.current.size > 0) return
    const deferred = deferredAssistantTranscriptsRef.current.splice(0)
    for (const event of deferred) await saveAssistantTranscript(event)
  }, [saveAssistantTranscript])

  const handleRealtimeEvent = useCallback(
    async (event: RealtimeEvent, eventConnection: RTCPeerConnection) => {
      if (connectionRef.current !== eventConnection) return
      try {
        switch (event.type) {
          case "session.created":
          case "session.updated":
            setStatus("connected")
            return
          case "input_audio_buffer.speech_started":
            userSpeechActiveRef.current = true
            setStatus("listening")
            return
          case "input_audio_buffer.speech_stopped":
            userSpeechActiveRef.current = false
            if (event.item_id) pendingUserItemsRef.current.add(event.item_id)
            setStatus("thinking")
            return
          case "conversation.item.input_audio_transcription.delta": {
            if (!event.item_id || !event.delta) return
            pendingUserItemsRef.current.add(event.item_id)
            const current = userTranscriptsRef.current.get(event.item_id) || ""
            userTranscriptsRef.current.set(event.item_id, current + event.delta)
            callbacksRef.current.onUserTranscriptDelta(event.item_id, event.delta)
            setStatus(userSpeechActiveRef.current ? "listening" : "thinking")
            return
          }
          case "conversation.item.input_audio_transcription.completed": {
            if (!event.item_id) return
            if (!event.transcript?.trim()) {
              userTranscriptsRef.current.delete(event.item_id)
              callbacksRef.current.onUserTranscriptFailed(event.item_id)
              failVoiceSession("We couldn't transcribe that answer. Please say it again or type it.")
              return
            }
            const transcript = event.transcript.trim()
            if (
              callbacksRef.current.canWrapUp &&
              /^(let['’]s\s+)?(wrap\s+this\s+up|end(\s+the)?\s+conversation|save(\s+this)?\s+memory)[.!?]?$/i.test(transcript)
            ) {
              callbacksRef.current.onUserTranscriptFailed(event.item_id)
              const assistantWasStreaming = assistantStreamingRef.current
              clearConnection()
              if (assistantWasStreaming) callbacksRef.current.onAssistantCancelled()
              setError(null)
              setStatus("idle")
              callbacksRef.current.onWrapRequested()
              return
            }
            if (explicitPauseRequestPatterns.some((pattern) => pattern.test(transcript))) {
              pauseRequestedRef.current = true
            }
            setStatus("thinking")
            await persistUserTranscript(event.item_id, transcript)
            pendingUserItemsRef.current.delete(event.item_id)
            await saveDeferredAssistantTranscripts()
            return
          }
          case "conversation.item.input_audio_transcription.failed": {
            if (event.item_id) {
              userTranscriptsRef.current.delete(event.item_id)
              callbacksRef.current.onUserTranscriptFailed(event.item_id)
            }
            failVoiceSession("We couldn't transcribe that answer. Please say it again or type it.")
            return
          }
          case "response.created":
            setStatus("thinking")
            return
          case "response.output_audio_transcript.delta": {
            const itemId = event.item_id || "assistant"
            const current = assistantTranscriptsRef.current.get(itemId) || ""
            assistantTranscriptsRef.current.set(
              itemId,
              current + (event.delta || ""),
            )
            if (suppressFirstAssistantTranscriptRef.current) {
              suppressFirstAssistantTranscriptRef.current = false
              suppressedAssistantItemRef.current = itemId
            }
            const isSuppressedTranscript = suppressedAssistantItemRef.current === itemId
            if (!isSuppressedTranscript) {
              if (!assistantStreamingRef.current) {
                assistantStreamingRef.current = true
                callbacksRef.current.onAssistantStart()
              }
              if (event.delta) callbacksRef.current.onAssistantDelta(event.delta)
            }
            setStatus("speaking")
            return
          }
          case "response.output_audio_transcript.done":
            if (pendingUserItemsRef.current.size > 0) {
              deferredAssistantTranscriptsRef.current.push(event)
              return
            }
            await saveAssistantTranscript(event)
            return
          case "response.done":
            if (pauseRequestedRef.current) {
              pauseRequestedRef.current = false
              clearConnection()
              setError(null)
              setStatus("idle")
              callbacksRef.current.onConversationChanged(true)
            }
            return
          case "response.cancelled":
            assistantTranscriptsRef.current.clear()
            deferredAssistantTranscriptsRef.current = []
            if (assistantStreamingRef.current) {
              assistantStreamingRef.current = false
              callbacksRef.current.onAssistantCancelled()
            }
            setStatus("listening")
            return
          case "error":
            throw new Error(
              event.error?.message || "The voice service returned an error.",
            )
          default:
            return
        }
      } catch (eventError) {
        // A stop/restart can happen while an async event handler is running.
        // Never let an old session's error tear down its replacement.
        if (connectionRef.current !== eventConnection) return
        const message = getErrorMessage(eventError)
        failVoiceSession(message)
      }
    },
    [clearConnection, failVoiceSession, persistUserTranscript, saveAssistantTranscript, saveDeferredAssistantTranscripts],
  )

  const start = useCallback(async () => {
    if (connectionRef.current || activeStartAttemptRef.current !== null) return
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      const message = "Voice conversations are not supported in this browser."
      setError(message)
      setStatus("error")
      callbacksRef.current.onError(message)
      return
    }

    const token = localStorage.getItem("access_token")
    if (!token) {
      const message = "Please log in again to start a voice conversation."
      setError(message)
      setStatus("error")
      callbacksRef.current.onError(message)
      return
    }

    setError(null)
    pauseRequestedRef.current = false
    setStatus("connecting")
    const attemptId = ++startAttemptSequenceRef.current
    activeStartAttemptRef.current = attemptId

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (activeStartAttemptRef.current !== attemptId) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      streamRef.current = stream

      const connection = new RTCPeerConnection()
      connectionRef.current = connection
      for (const track of stream.getTracks()) {
        connection.addTrack(track, stream)
      }

      const audio = document.createElement("audio")
      audio.autoplay = true
      audio.setAttribute("playsinline", "")
      audio.setAttribute("aria-hidden", "true")
      document.body.append(audio)
      audioRef.current = audio
      connection.addEventListener("track", (event) => {
        if (connectionRef.current !== connection) return
        const remoteStream = event.streams[0] || new MediaStream([event.track])

        audio.srcObject = remoteStream
        void audio.play().catch(() => {
          if (connectionRef.current !== connection) return
          const message =
            "Your browser blocked voice playback. Check your audio settings, then restart voice chat."
          failVoiceSession(message)
        })
      })
      connection.addEventListener("connectionstatechange", () => {
        if (connectionRef.current !== connection) return
        if (connection.connectionState === "failed") {
          const message = "The voice connection dropped. Please try again."
          failVoiceSession(message)
        }
      })

      const dataChannel = connection.createDataChannel("oai-events")
      dataChannelRef.current = dataChannel
      dataChannel.addEventListener("open", () => {
        if (connectionRef.current !== connection || dataChannelRef.current !== dataChannel) return
        suppressFirstAssistantTranscriptRef.current = suppressFirstAssistantTranscript
        dataChannel.send(JSON.stringify({ type: "response.create" }))
        setStatus("thinking")
      })
      dataChannel.addEventListener("message", (messageEvent) => {
        if (connectionRef.current !== connection || dataChannelRef.current !== dataChannel) return
        try {
          const event = JSON.parse(messageEvent.data) as RealtimeEvent
          realtimeEventQueueRef.current = realtimeEventQueueRef.current
            .then(() => {
              // Events can already be queued when Pause closes this channel.
              // Ignore them if a new voice session has since replaced it.
              if (
                connectionRef.current !== connection ||
                dataChannelRef.current !== dataChannel
              ) return
              return handleRealtimeEvent(event, connection)
            })
            .catch((eventError) => {
              if (connectionRef.current !== connection || dataChannelRef.current !== dataChannel) return
              failVoiceSession(getErrorMessage(eventError))
            })
        } catch {
          // Ignore malformed, non-JSON events while keeping the media stream alive.
        }
      })

      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await waitForIceGathering(connection)
      if (activeStartAttemptRef.current !== attemptId || connectionRef.current !== connection) return
      const sdp = connection.localDescription?.sdp
      if (!sdp) throw new Error("Unable to prepare the voice connection.")

      const response = await fetch(
        `${API_BASE_URL}/api/v1/realtime/conversations/${conversationId}/realtime/session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sdp }),
        },
      )
      if (activeStartAttemptRef.current !== attemptId || connectionRef.current !== connection) return
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.detail || "Unable to start the voice conversation.",
        )
      }

      await connection.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      })
      if (activeStartAttemptRef.current !== attemptId || connectionRef.current !== connection) return
    } catch (startError) {
      if (activeStartAttemptRef.current !== attemptId) return
      clearConnection()
      const message = getErrorMessage(startError)
      setError(message)
      setStatus("error")
      callbacksRef.current.onError(message)
    } finally {
      if (activeStartAttemptRef.current === attemptId) {
        activeStartAttemptRef.current = null
      }
    }
  }, [
    clearConnection,
    conversationId,
    failVoiceSession,
    handleRealtimeEvent,
    suppressFirstAssistantTranscript,
  ])

  const stop = useCallback(() => {
    const unfinishedTranscripts = [...userTranscriptsRef.current.entries()]
    const assistantWasStreaming = assistantStreamingRef.current
    clearConnection()
    if (assistantWasStreaming) callbacksRef.current.onAssistantCancelled()
    setError(null)
    setStatus("idle")
    for (const [itemId, transcript] of unfinishedTranscripts) {
      void persistUserTranscript(itemId, transcript).catch((persistError) => {
        const message = getErrorMessage(persistError)
        setError(message)
        setStatus("error")
        callbacksRef.current.onError(message)
      })
    }
  }, [clearConnection, persistUserTranscript])

  useEffect(() => {
    return () => {
      const unfinishedTranscripts = [...userTranscriptsRef.current.entries()]
      const assistantWasStreaming = assistantStreamingRef.current
      clearConnection()
      if (assistantWasStreaming) callbacksRef.current.onAssistantCancelled()
      for (const [itemId, transcript] of unfinishedTranscripts) {
        void persistUserTranscript(itemId, transcript).catch(() => undefined)
      }
    }
  }, [conversationId, clearConnection, persistUserTranscript])

  const sendText = useCallback(
    async (content: string) => {
      const dataChannel = dataChannelRef.current
      if (!content.trim()) return false
      if (!dataChannel || dataChannel.readyState !== "open") return false

      const onUserMessage = callbacksRef.current.onUserMessage
      const onConversationChanged = callbacksRef.current.onConversationChanged
      const message = await persistMessage("user", content.trim())
      onUserMessage(message)
      onConversationChanged(false)
      dataChannel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: content.trim() }],
          },
        }),
      )
      dataChannel.send(
        JSON.stringify({
          type: "response.create",
          response: { output_modalities: ["audio"] },
        }),
      )
      setStatus("thinking")
      return true
    },
    [persistMessage],
  )

  useEffect(() => stop, [stop])

  return {
    error,
    isActive: status !== "idle" && status !== "error",
    sendText,
    start,
    status,
    stop,
  }
}
