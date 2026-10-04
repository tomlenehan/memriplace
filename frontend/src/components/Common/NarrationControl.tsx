import { Button, HStack, IconButton, Text, Tooltip } from "@chakra-ui/react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { FiInfo, FiPause, FiPlay, FiSquare } from "react-icons/fi"
import { API_BASE_URL } from "../../config"
import { ReadingTextSizeControl, useReadingTextSize } from "./ReadingTextSize"

let stopOtherNarration: (() => void) | null = null
const PCM_SAMPLE_RATE = 24_000
const MIN_INITIAL_BUFFER_BYTES = Math.round(PCM_SAMPLE_RATE * 2 * 0.35)
const WORDS_PER_MINUTE = 150
const SENTENCE_HIGHLIGHT_DELAY_SECONDS = 0

type SentenceTiming = { index: number; start: number; end: number }
type NarrationPacket = { type: number; payload: Uint8Array }
type NarrationSegment = { sentences: string[]; start: number | null; duration: number; startIndex: number }

function readPacket(buffer: Uint8Array): NarrationPacket | null {
  if (buffer.length < 5) return null
  const length = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(1, false)
  if (buffer.length < 5 + length) return null
  return { type: buffer[0], payload: buffer.slice(5, 5 + length) }
}

function splitSentences(text: string) {
  return text.match(/[^.!?]+[.!?]+(?:["'”’)]*)\s*|[^.!?]+$/g) ?? [text]
}

function scrollIntoViewIfNeeded(element: HTMLElement | null) {
  if (!element) return

  let scrollContainer = element.parentElement
  while (scrollContainer && scrollContainer !== document.body) {
    const overflowY = window.getComputedStyle(scrollContainer).overflowY
    if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      scrollContainer.scrollHeight > scrollContainer.clientHeight) break
    scrollContainer = scrollContainer.parentElement
  }

  const bounds = element.getBoundingClientRect()
  const containerBounds = scrollContainer && scrollContainer !== document.body
    ? scrollContainer.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight }
  const margin = 28
  if (bounds.top >= containerBounds.top + margin && bounds.bottom <= containerBounds.bottom - margin) return

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "nearest" })
}

export default function NarrationControl({ path, publicStory = false, displayText, spokenTitle, displaySentenceOffset = 0, displayTextLines, showTextSizeControl = false, displayTextClassName }: {
  path: string
  publicStory?: boolean
  displayText?: string
  spokenTitle?: string
  displaySentenceOffset?: number
  displayTextLines?: number
  showTextSizeControl?: boolean
  displayTextClassName?: string
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "paused">("idle")
  const [error, setError] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const storyTextId = useId()
  const audio = useRef<HTMLAudioElement | null>(null)
  const controller = useRef<AbortController | null>(null)
  const objectUrl = useRef<string | null>(null)
  const context = useRef<AudioContext | null>(null)
  const sources = useRef(new Set<AudioBufferSourceNode>())
  const sentenceTimings = useRef<SentenceTiming[]>([])
  const activeSentenceElement = useRef<HTMLSpanElement | null>(null)
  const firstSentenceElement = useRef<HTMLSpanElement | null>(null)
  const [activeSentence, setActiveSentence] = useState<number | null>(null)
  const { scale } = useReadingTextSize()
  const titleSentenceOffset = spokenTitle === undefined
    ? displaySentenceOffset
    : splitSentences(`${spokenTitle}.`).length

  useEffect(() => {
    if (phase !== "playing") return
    const timer = window.setInterval(() => {
      const now = context.current?.currentTime
      if (now === undefined) return
      const active = sentenceTimings.current.find(({ start, end }) => now >= start && now < end)
      setActiveSentence(active?.index ?? null)
    }, 80)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === "playing" && activeSentence !== null) {
      scrollIntoViewIfNeeded(activeSentenceElement.current)
    }
  }, [activeSentence, phase])

  useEffect(() => {
    setIsExpanded(false)
  }, [path, displayText, displayTextLines])

  const stop = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    audio.current?.pause()
    audio.current = null
    for (const source of sources.current) source.stop()
    sources.current.clear()
    sentenceTimings.current = []
    setActiveSentence(null)
    const currentContext = context.current
    context.current = null
    if (currentContext && currentContext.state !== "closed") void currentContext.close()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    if (stopOtherNarration === stop) stopOtherNarration = null
    setPhase("idle")
  }, [])

  useEffect(() => () => stop(), [path, stop])

  const fetchHeaders = (): HeadersInit => {
    const token = localStorage.getItem("access_token")
    if (!publicStory && !token) throw new Error("Please sign in again to listen.")
    return !publicStory && token ? { Authorization: `Bearer ${token}` } : {}
  }

  const startBufferedPlayback = async (request: AbortController, headers: HeadersInit) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/narration/${path}`, {
      method: "POST", signal: request.signal, headers,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.detail || "Voice reading is unavailable. Please try again.")
    }
    const blob = await response.blob()
    if (request.signal.aborted) return
    objectUrl.current = URL.createObjectURL(blob)
    const player = new Audio(objectUrl.current)
    audio.current = player
    player.onended = stop
    player.onerror = () => { stop(); setError("Your browser couldn't play this recording.") }
    await player.play()
    if (!request.signal.aborted) setPhase("playing")
  }

  const startStreamingPlayback = async (
    request: AbortController,
    headers: HeadersInit,
    playerContext: AudioContext,
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/narration/${path}?stream=true&sentences=true`, {
      method: "POST", signal: request.signal, headers,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.detail || "Voice reading is unavailable. Please try again.")
    }
    if (!response.body) throw new Error("Your browser couldn't receive the voice recording.")

    const reader = response.body.getReader()
    const framedStream = response.headers.get("content-type")?.includes("application/vnd.memriplace.narration-stream") ?? false
    let started = false
    let finished = false
    let nextStart = 0
    let pending = new Uint8Array(0)
    let pcmRemainder = new Uint8Array(0)
    let buffered: Uint8Array[] = []
    let bufferedBytes = 0
    let segment: NarrationSegment | null = null

    const finishWhenDone = () => {
      if (finished && sources.current.size === 0 && !request.signal.aborted) stop()
    }
    const schedule = (bytes: Uint8Array, activeSegment: typeof segment) => {
      const alignedLength = bytes.byteLength - (bytes.byteLength % 2)
      if (!alignedLength) return
      const data = new DataView(bytes.buffer, bytes.byteOffset, alignedLength)
      const samples = new Float32Array(alignedLength / 2)
      for (let index = 0; index < samples.length; index += 1) samples[index] = data.getInt16(index * 2, true) / 32_768
      const buffer = playerContext.createBuffer(1, samples.length, PCM_SAMPLE_RATE)
      buffer.copyToChannel(samples, 0)
      const source = playerContext.createBufferSource()
      source.buffer = buffer
      source.connect(playerContext.destination)
      source.onended = () => { sources.current.delete(source); finishWhenDone() }
      const startAt = Math.max(nextStart, playerContext.currentTime + (started ? 0.02 : 0.12))
      if (activeSegment) {
        if (activeSegment.start === null) activeSegment.start = startAt
        activeSegment.duration += buffer.duration
      }
      source.start(startAt)
      nextStart = startAt + buffer.duration
      started = true
      sources.current.add(source)
      setPhase("playing")
    }
    const updateEstimatedSentenceTimings = (activeSegment: NarrationSegment, exact = false) => {
      if (activeSegment.start === null || activeSegment.sentences.length === 0) return
      const weights = activeSegment.sentences.map((sentence) => Math.max(1, sentence.trim().split(/\s+/).length))
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
      const estimatedDuration = totalWeight / (WORDS_PER_MINUTE / 60)
      const duration = exact ? activeSegment.duration : Math.max(activeSegment.duration, estimatedDuration)
      let cursor = activeSegment.start
      const entries = activeSegment.sentences.map((_, sentenceIndex) => {
        const start = cursor
        cursor += duration * (weights[sentenceIndex] / totalWeight)
        return {
          index: activeSegment.startIndex + sentenceIndex,
          start: start + SENTENCE_HIGHLIGHT_DELAY_SECONDS,
          end: cursor + SENTENCE_HIGHLIGHT_DELAY_SECONDS,
        }
      })
      sentenceTimings.current = [...sentenceTimings.current.filter(({ index }) =>
        index < activeSegment.startIndex || index >= activeSegment.startIndex + activeSegment.sentences.length
      ), ...entries].sort((a, b) => a.start - b.start)
    }
    let sentenceIndex = 0
    const flushInitialBuffer = () => {
      if (!bufferedBytes) return
      const joined = new Uint8Array(bufferedBytes)
      let offset = 0
      for (const item of buffered) { joined.set(item, offset); offset += item.length }
      buffered = []
      bufferedBytes = 0
      schedule(joined, segment)
      if (segment) updateEstimatedSentenceTimings(segment)
    }

    try {
      while (!request.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        const incoming = new Uint8Array(pending.length + value.length)
        incoming.set(pending)
        incoming.set(value, pending.length)
        pending = incoming
        if (!framedStream) {
          const usableLength = pending.length - (pending.length % 2)
          const usable = pending.slice(0, usableLength)
          pending = pending.slice(usableLength)
          if (!usable.length) continue
          if (!started) {
            buffered.push(usable)
            bufferedBytes += usable.length
            if (bufferedBytes >= MIN_INITIAL_BUFFER_BYTES) flushInitialBuffer()
          } else {
            schedule(usable, null)
          }
          continue
        }
        while (true) {
          const packet = readPacket(pending)
          if (!packet) break
          pending = pending.slice(5 + packet.payload.length)
          if (packet.type === 2) {
            const metadata = JSON.parse(new TextDecoder().decode(packet.payload)) as { sentences: string[] }
            segment = { sentences: metadata.sentences, start: null, duration: 0, startIndex: sentenceIndex }
            sentenceIndex += metadata.sentences.length
          } else if (packet.type === 1) {
            const audio = new Uint8Array(pcmRemainder.length + packet.payload.length)
            audio.set(pcmRemainder)
            audio.set(packet.payload, pcmRemainder.length)
            const usableLength = audio.length - (audio.length % 2)
            pcmRemainder = audio.slice(usableLength)
            const usable = audio.slice(0, usableLength)
            if (!usable.length) continue
            if (!started) {
              buffered.push(usable)
              bufferedBytes += usable.length
              if (bufferedBytes >= MIN_INITIAL_BUFFER_BYTES) flushInitialBuffer()
            } else {
              schedule(usable, segment)
              if (segment) updateEstimatedSentenceTimings(segment)
            }
          } else if (packet.type === 3 && segment) {
            if (!started) flushInitialBuffer()
            updateEstimatedSentenceTimings(segment, true)
            segment = null
          } else if (packet.type === 0) {
            finished = true
          }
        }
      }
      finished = true
      if (!started) flushInitialBuffer()
      finishWhenDone()
    } finally {
      reader.releaseLock()
    }
  }

  const toggle = async () => {
    if (phase === "playing") {
      if (context.current) await context.current.suspend()
      else audio.current?.pause()
      setPhase("paused")
      return
    }
    if (phase === "paused" && (audio.current || context.current)) {
      try {
        if (context.current) await context.current.resume()
        else await audio.current?.play()
        setPhase("playing")
      } catch {
        setError("Your browser couldn't play this recording.")
      }
      return
    }
    if (phase === "loading") return
    stopOtherNarration?.()
    stopOtherNarration = stop
    const request = new AbortController()
    controller.current = request
    setError("")
    setPhase("loading")
    try {
      const headers = fetchHeaders()
      if ("AudioContext" in window) {
        const playerContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
        context.current = playerContext
        await playerContext.resume()
        await startStreamingPlayback(request, headers, playerContext)
      } else {
        await startBufferedPlayback(request, headers)
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        stop()
        setError(cause instanceof Error ? cause.message : "Voice reading is unavailable.")
      }
    }
  }

  const handleListen = () => {
    const startingOrResuming = phase === "idle" || phase === "paused"
    if (displayTextLines && !isExpanded && startingOrResuming) setIsExpanded(true)
    if (startingOrResuming) {
      window.requestAnimationFrame(() => scrollIntoViewIfNeeded(activeSentenceElement.current ?? firstSentenceElement.current))
    }
    void toggle()
  }

  return <div>
    <HStack spacing={2} flexWrap="wrap">
      <HStack spacing={2} flexWrap="nowrap" flexShrink={0}>
        <Button type="button" size="md" variant="secondary" leftIcon={phase === "playing" ? <FiPause /> : <FiPlay />}
          onClick={handleListen} isLoading={phase === "loading"} loadingText="Preparing voice" minH="48px" fontWeight="750" whiteSpace="nowrap">
          {phase === "playing" ? "Pause" : phase === "paused" ? "Resume" : "Listen"}
        </Button>
        {phase !== "idle" && <Button type="button" size="sm" variant="ghost" leftIcon={<FiSquare />}
          onClick={stop} minH="44px" whiteSpace="nowrap">Stop</Button>}
      </HStack>
      <Tooltip label="AI-generated voice" hasArrow>
        <IconButton aria-label="About the AI-generated voice" icon={<FiInfo />} variant="ghost" size="sm" minH="40px"
          _hover={{ bg: "transparent" }} />
      </Tooltip>
      {showTextSizeControl && <ReadingTextSizeControl />}
    </HStack>
    {error && <Text role="alert" color="red.600" fontSize="sm" mt={2}>{error}</Text>}
    {displayText && <>
      <Text id={storyTextId} className={displayTextClassName} mt={4} whiteSpace="pre-wrap" lineHeight="1.8" style={{ fontSize: `calc(1em * ${scale})` }}
        noOfLines={displayTextLines && !isExpanded ? displayTextLines : undefined} aria-live="off">
        {splitSentences(displayText).map((sentence, index, sentences) => {
          const isActive = activeSentence === index + titleSentenceOffset
          return <span key={`${index}-${sentence}`} ref={isActive ? activeSentenceElement : index === 0 ? firstSentenceElement : undefined}
            style={{ fontWeight: isActive ? 700 : "inherit", transition: "font-weight 120ms ease" }}>
            {sentence}{index < sentences.length - 1 ? " " : ""}
          </span>
        })}
      </Text>
      {displayTextLines && (isExpanded ? phase === "idle" : true) && <Button type="button" variant="ghost" size="sm"
        mt={1} px={0} minH="44px" color="#286B69" fontWeight="750" aria-expanded={isExpanded}
        aria-controls={storyTextId} onClick={() => setIsExpanded((expanded) => !expanded)}>
        {isExpanded ? "Show less" : "Read full story"}
      </Button>}
    </>}
  </div>
}
