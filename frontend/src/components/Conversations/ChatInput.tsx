import { celebrateMemory } from "../../lib/celebration"
import {
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiArrowLeft, FiCheck, FiEdit3, FiHeadphones, FiMic, FiMicOff, FiSend, FiVolume2 } from "react-icons/fi"
import { GiSecretBook } from "react-icons/gi"
import { useDispatch, useSelector } from "react-redux"

import { ConversationsService, SummariesService, type ChatMessageCreate, type ChatMessagePublic, type ConversationsPublic } from "../../client"
import { API_BASE_URL } from "../../config"
import useCustomToast from "../../hooks/useCustomToast"
import { useRealtimeStory } from "../../hooks/useRealtimeStory"
import { clearStorySuggestionPending, markStorySuggestionPending } from "../../lib/storyPaths"
import { useReadingTextSize } from "../Common/ReadingTextSize"
import {
  addMessage,
  addStreamingMessage,
  endStreamingMessage,
  fetchMessages,
  removeStreamingMessage,
  replaceStreamingMessage,
  startStreamingMessage,
} from "../../redux/chatSlice"
import type { AppDispatch } from "../../redux/store"
import type { RootState } from "../../redux/store"

interface ChatInputProps {
  conversationId: number
  storyFinished: boolean
  readyToSave: boolean
  memoryAlreadySaved: boolean
  userTurnCount: number
}

const statusLabels = {
  connected: "Ready when you are. Speak naturally—your words will appear here.",
  connecting: "Connecting your microphone...",
  listening: "Listening… your words are appearing in the chat.",
  speaking: "MemriPlace is asking a question aloud…",
  thinking: "MemriPlace is gathering its next question…",
} as const

const MIN_STORY_TURNS_BEFORE_SAVE = 4
const EMPTY_CHAT_MESSAGES: ChatMessagePublic[] = []

const ChatInput = ({ conversationId, storyFinished, readyToSave, memoryAlreadySaved, userTurnCount }: ChatInputProps) => {
  const { scale } = useReadingTextSize()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ChatMessageCreate>({
    defaultValues: {
      sender_type: "user",
      content: "",
    },
  })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const chatMessages = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.messages : EMPTY_CHAT_MESSAGES,
  )
  const chatStatus = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.status : "loading",
  )
  const showToast = useCustomToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [startMode, setStartMode] = useState<"choose" | "voice" | "type">("choose")
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [voiceWrapRequested, setVoiceWrapRequested] = useState(false)
  const savingMemory = useRef(false)
  const sendingMessage = useRef(false)
  const streamingMessageId = useRef<number | null>(null)
  const assistantVoiceMessageId = useRef<number | null>(null)
  const userVoiceMessageIds = useRef(new Map<string, number>())
  const completedUserTranscriptIds = useRef(new Set<string>())
  const nextVoiceMessageId = useRef(-Date.now() * 10)
  const isStoryFinished = storyFinished
  const bgColor = useColorModeValue("ui.light", "ui.dark")
  const textColor = useColorModeValue("ui.dark", "ui.light")
  const secBgColor = useColorModeValue("ui.secondary", "ui.darkSlate")
  const mutedTextColor = useColorModeValue("ui.muted", "ui.dim")
  const latestChatMessage = chatMessages[chatMessages.length - 1]
  const isFirstTurn = userTurnCount === 0
  const canStartVoice = !isStoryFinished && (isFirstTurn || chatStatus === "succeeded")

  useEffect(() => {
    if (startMode === "type") inputRef.current?.focus()
  }, [startMode])

  const refreshConversation = useCallback((includeChatMessages = true) => {
    if (includeChatMessages) {
      void queryClient.invalidateQueries({
        queryKey: ["chatMessages", conversationId],
      })
    }
    void queryClient.invalidateQueries({
      queryKey: ["conversationNode", conversationId],
    })
    void queryClient.invalidateQueries({
      queryKey: ["conversationConstellation"],
    })
  }, [conversationId, queryClient])

  const handleStream = async (newMessage: ChatMessageCreate) => {
    const token = localStorage.getItem("access_token")
    if (!token) throw new Error("Please log in again to continue your story.")

    const tempId = Date.now() + 1
    streamingMessageId.current = tempId
    dispatch(startStreamingMessage({ conversationId, id: tempId }))
    let pendingText = ""
    let frame: number | null = null
    const flushText = () => {
      frame = null
      if (!pendingText) return
      dispatch(addStreamingMessage({ conversationId, id: tempId, content: pendingText }))
      pendingText = ""
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/chat_messages/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newMessage),
        },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || "Unable to send your message.")
      }
      if (!response.body)
        throw new Error("The story assistant did not return a response.")

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        pendingText += decoder.decode(value, { stream: true })
        if (frame === null) frame = window.requestAnimationFrame(flushText)
      }
      pendingText += decoder.decode()
    } finally {
      if (frame !== null) window.cancelAnimationFrame(frame)
      flushText()
      dispatch(endStreamingMessage({ conversationId, id: tempId }))
      streamingMessageId.current = null
      await dispatch(fetchMessages(conversationId))
      refreshConversation(false)
    }
  }

  const handleVoiceUserMessage = useCallback(
    (message: ChatMessagePublic, itemId?: string) => {
      const draftId = itemId ? userVoiceMessageIds.current.get(itemId) : undefined
      if (itemId) {
        completedUserTranscriptIds.current.add(itemId)
        userVoiceMessageIds.current.delete(itemId)
      }
      if (draftId !== undefined) {
        dispatch(replaceStreamingMessage({ conversationId, id: draftId, message }))
      } else {
        dispatch(addMessage({ conversationId, message }))
      }
    },
    [conversationId, dispatch],
  )

  const handleVoiceUserTranscriptDelta = useCallback(
    (itemId: string, content: string) => {
      if (completedUserTranscriptIds.current.has(itemId)) return
      let messageId = userVoiceMessageIds.current.get(itemId)
      if (messageId === undefined) {
        messageId = --nextVoiceMessageId.current
        userVoiceMessageIds.current.set(itemId, messageId)
        dispatch(startStreamingMessage({ conversationId, id: messageId, sender_type: "user" }))
      }
      dispatch(addStreamingMessage({ conversationId, id: messageId, content }))
    },
    [conversationId, dispatch],
  )

  const handleVoiceUserTranscriptFailed = useCallback(
    (itemId: string) => {
      const messageId = userVoiceMessageIds.current.get(itemId)
      if (messageId !== undefined) {
        dispatch(removeStreamingMessage({ conversationId, id: messageId }))
        userVoiceMessageIds.current.delete(itemId)
      }
      completedUserTranscriptIds.current.add(itemId)
    },
    [conversationId, dispatch],
  )

  const handleVoiceAssistantStart = useCallback(() => {
    if (assistantVoiceMessageId.current) return
    const tempId = --nextVoiceMessageId.current
    assistantVoiceMessageId.current = tempId
    dispatch(startStreamingMessage({ conversationId, id: tempId }))
  }, [conversationId, dispatch])

  const handleVoiceAssistantDelta = useCallback(
    (content: string) => {
      if (assistantVoiceMessageId.current === null) return
      dispatch(addStreamingMessage({ conversationId, id: assistantVoiceMessageId.current, content }))
    },
    [conversationId, dispatch],
  )

  const handleVoiceAssistantComplete = useCallback(() => {
    if (assistantVoiceMessageId.current !== null) {
      dispatch(endStreamingMessage({ conversationId, id: assistantVoiceMessageId.current }))
      assistantVoiceMessageId.current = null
    }
  }, [conversationId, dispatch])

  const handleVoiceAssistantCancelled = useCallback(() => {
    if (assistantVoiceMessageId.current !== null) {
      dispatch(removeStreamingMessage({ conversationId, id: assistantVoiceMessageId.current }))
      assistantVoiceMessageId.current = null
    }
  }, [conversationId, dispatch])

  const handleVoiceError = useCallback(
    (message: string) => showToast("Voice conversation", message, "error"),
    [showToast],
  )

  const {
    error: voiceError,
    isActive: isVoiceActive,
    sendText,
    start,
    status: voiceStatus,
    stop,
  } = useRealtimeStory({
    conversationId,
    suppressFirstAssistantTranscript: isFirstTurn || latestChatMessage?.sender_type !== "user",
    onUserMessage: handleVoiceUserMessage,
    onUserTranscriptDelta: handleVoiceUserTranscriptDelta,
    onUserTranscriptFailed: handleVoiceUserTranscriptFailed,
    onAssistantStart: handleVoiceAssistantStart,
    onAssistantDelta: handleVoiceAssistantDelta,
    onAssistantComplete: handleVoiceAssistantComplete,
    onAssistantCancelled: handleVoiceAssistantCancelled,
    onConversationChanged: refreshConversation,
    canWrapUp: readyToSave || userTurnCount >= MIN_STORY_TURNS_BEFORE_SAVE,
    onWrapRequested: () => setVoiceWrapRequested(true),
    onError: handleVoiceError,
  })
  const showWelcomeChoice = !isStoryFinished && !memoryAlreadySaved && startMode === "choose" && !isVoiceActive

  const handleSaveMemory = async (endConversation = false) => {
    if (
      savingMemory.current ||
      sendingMessage.current ||
      memoryAlreadySaved ||
      (!readyToSave && !endConversation) ||
      (userTurnCount < MIN_STORY_TURNS_BEFORE_SAVE && !readyToSave) ||
      (isVoiceActive && voiceStatus !== "connected")
    ) return
    savingMemory.current = true
    setIsSavingMemory(true)
    try {
      if (isVoiceActive) stop()
      if (endConversation && !isStoryFinished) {
        await ConversationsService.wrapUpStoryNode({ id: conversationId })
        await dispatch(fetchMessages(conversationId))
        refreshConversation(false)
      }
      const summary = await SummariesService.createStorySummary({
        requestBody: { conversation_id: conversationId, tone: 50 },
      })
      markStorySuggestionPending(conversationId)
      const suggestionGeneration = ConversationsService.retryStoryBranches({ id: conversationId })
        .then((branches) => ({ branches }))
        .catch(() => ({ branches: null }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summaries"] }),
        queryClient.invalidateQueries({ queryKey: ["memoryProgress"] }),
        queryClient.invalidateQueries({ queryKey: ["conversationConstellation"] }),
      ])
      void suggestionGeneration.then(({ branches }) => {
        if (branches == null) {
          clearStorySuggestionPending(conversationId)
          showToast(
            "No follow-up ideas yet",
            "Your memory is saved. You can still start anywhere that feels right.",
            "info",
          )
          return
        }
        clearStorySuggestionPending(conversationId)
        queryClient.setQueryData<ConversationsPublic>(["conversationConstellation"], (current) => {
          if (!current) return current
          const byId = new Map(current.data.map((conversation) => [conversation.id, conversation]))
          branches.forEach((conversation) => byId.set(conversation.id, conversation))
          return { data: [...byId.values()], count: Math.max(current.count, byId.size) }
        })
      })
      celebrateMemory()
      showToast("Memory saved", "Review your story while we look for a thoughtful thread to follow.", "success")
      await navigate({
        to: "/summary/$summaryId",
        params: { summaryId: String(summary.id) },
      })
    } catch (error) {
      showToast(
        "Could not save memory",
        error instanceof Error ? error.message : "Please try again.",
        "error",
      )
    } finally {
      savingMemory.current = false
      setIsSavingMemory(false)
    }
  }

  const handleWrapUp = () => handleSaveMemory(true)

  useEffect(() => {
    if (!voiceWrapRequested) return
    setVoiceWrapRequested(false)
    void handleWrapUp()
  }, [voiceWrapRequested])

  const onSubmit: SubmitHandler<ChatMessageCreate> = async (data) => {
    const content = data.content.trim()
    if (!content || sendingMessage.current) return
    if (/^(let['’]s\s+)?(wrap\s+this\s+up|end(\s+the)?\s+conversation|save(\s+this)?\s+memory)[.!?]?$/i.test(content)) {
      reset()
      if (userTurnCount < MIN_STORY_TURNS_BEFORE_SAVE && !readyToSave) {
        showToast(
          "Let’s keep the story going",
          `Answer ${MIN_STORY_TURNS_BEFORE_SAVE - userTurnCount} more ${MIN_STORY_TURNS_BEFORE_SAVE - userTurnCount === 1 ? "question" : "questions"} before saving this memory.`,
          "info",
        )
        return
      }
      await handleWrapUp()
      return
    }
    sendingMessage.current = true

    try {
      if (isVoiceActive) {
        try {
          const sent = await sendText(content)
          if (!sent) {
            throw new Error(
              "Voice conversation is still connecting. Please try again.",
            )
          }
          reset()
        } catch (error) {
          showToast(
            "Message not sent",
            error instanceof Error ? error.message : "Please try again.",
            "error",
          )
        }
        return
      }

      const newMessage = {
        id: Date.now(),
        sender_type: data.sender_type,
        content,
        timestamp: new Date().toISOString(),
      }
      dispatch(addMessage({ conversationId, message: newMessage }))
      reset()

      try {
        await handleStream({ ...data, content })
      } catch (error) {
        showToast(
          "Message not sent",
          error instanceof Error ? error.message : "Please try again.",
          "error",
        )
      }
    } finally {
      sendingMessage.current = false
    }
  }

  const handleVoiceToggle = () => {
    if (isVoiceActive) {
      stop()
      return
    }
    setStartMode("voice")
    void start()
  }

  const handleBackToEntryChoice = () => {
    if (isVoiceActive) stop()
    setStartMode("choose")
  }

  const handleChooseTyping = () => setStartMode("type")

  const handleChooseVoice = () => {
    setStartMode("voice")
    void start()
  }

  const contentField = register("content", { required: true })

  const voiceStatusLabel = readyToSave && voiceStatus === "connected"
    ? "Your conversation is ready to save."
    : voiceStatus in statusLabels
      ? statusLabels[voiceStatus as keyof typeof statusLabels]
      : voiceError
  const showSaveMemory = readyToSave || userTurnCount >= MIN_STORY_TURNS_BEFORE_SAVE

  return (
    <Box
      as="form"
      onSubmit={handleSubmit(onSubmit)}
      p={4}
      bg={secBgColor}
      borderTop="1px"
      borderColor="gray.200"
      width="100%"
    >
      <VStack align="stretch" spacing={3}>
        {showSaveMemory && !memoryAlreadySaved && !showWelcomeChoice && (
          <Flex
            align={{ base: "stretch", sm: "center" }}
            justify="space-between"
            direction={{ base: "column", sm: "row" }}
            gap={3}
            p={4}
            borderRadius="2xl"
            bg="#FFF3D8"
            border="1px solid #E9CB80"
          >
            <HStack align="start" spacing={3}>
              <Icon as={FiCheck} mt={1} color="#477B70" />
              <Box>
                <Text fontWeight="800" color="#244D4C">
                  {readyToSave ? "This memory is ready to save" : "Ready when you are"}
                </Text>
                <Text fontSize="sm" color="#58746C">
                  {readyToSave
                    ? "Save it now and review it on the next page."
                    : "Save what you’ve shared so far, or keep going to add more."}
                </Text>
              </Box>
            </HStack>
            <Button
              type="button"
              variant="accent"
              onClick={() => void handleSaveMemory(true)}
              isLoading={isSavingMemory}
              isDisabled={isSubmitting || (isVoiceActive && voiceStatus !== "connected")}
              rightIcon={<GiSecretBook />}
              minH="48px"
              flexShrink={0}
            >
              Save memory
            </Button>
          </Flex>
        )}
        {!showWelcomeChoice && startMode === "voice" && (!isStoryFinished || isVoiceActive) && (
        <Flex
          align={{ base: "stretch", sm: "center" }}
          justify="space-between"
          gap={3}
          direction={{ base: "column", sm: "row" }}
          p={{ base: 3, md: 4 }}
          borderRadius="2xl"
          border="1px solid"
          borderColor={isVoiceActive ? "teal.300" : "#D8E8DD"}
          bg={isVoiceActive ? "#E8F5EF" : "#F2F7F1"}
        >
          <HStack align="flex-start" spacing={3}>
            <Flex
              align="center"
              justify="center"
              flexShrink={0}
              boxSize={10}
              borderRadius="full"
              bg={isVoiceActive ? "teal.100" : "white"}
              color="#477B70"
            >
              <Icon as={isVoiceActive ? FiVolume2 : FiHeadphones} boxSize={5} />
            </Flex>
            <Box>
              <Text color="#244D4C" fontSize="sm" fontWeight="800">
                {isVoiceActive ? "You’re in a voice story" : "Talk through this memory"}
              </Text>
              <Text mt={0.5} color="#66807E" fontSize="xs" lineHeight="1.5">
                MemriPlace asks questions aloud. Your spoken answers appear in the chat as you talk.
              </Text>
            </Box>
          </HStack>
          <HStack flexShrink={0}>
            {startMode === "voice" && (
              <Button
                type="button"
                variant="ghost"
                color="#477B70"
                leftIcon={<FiArrowLeft />}
                onClick={handleBackToEntryChoice}
              >
                Change response mode
              </Button>
            )}
            <Button
              type="button"
              flexShrink={0}
              variant={isVoiceActive ? "outline" : "primary"}
              leftIcon={isVoiceActive ? <FiMicOff /> : <FiMic />}
              isLoading={voiceStatus === "connecting"}
              isDisabled={!isVoiceActive && !canStartVoice}
              onClick={handleVoiceToggle}
              aria-label={isVoiceActive ? "Pause voice conversation" : "Start voice conversation"}
            >
              {isVoiceActive ? "Pause voice chat" : voiceStatus === "error" ? "Try voice again" : "Start voice chat"}
            </Button>
          </HStack>
        </Flex>
        )}

        {!showWelcomeChoice && startMode === "type" && !isVoiceActive && !isStoryFinished && (
          <Flex
            gap={2}
            align="center"
            direction={{ base: "column", sm: "row" }}
            w="full"
          >
            <>
            <Input
              {...contentField}
              ref={(element) => {
                contentField.ref(element)
                inputRef.current = element
              }}
              aria-label="Story message"
              style={{ fontSize: `calc(1rem * ${scale})` }}
              placeholder={chatStatus !== "succeeded"
                ? "Loading your story..."
                : isFirstTurn
                  ? "Write a memory..."
                  : "Write a detail or ask a question..."}
              bg={bgColor}
                  color={textColor}
                  flex="1"
                  minW={0}
                  minH="52px"
                  w={{ base: "full", sm: "auto" }}
              isDisabled={chatStatus !== "succeeded"}
            />
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              isDisabled={chatStatus !== "succeeded"}
              rightIcon={<FiSend />}
              minH="52px"
              minW={{ base: "full", sm: "104px" }}
            >
              Send
            </Button>
            </>
          </Flex>
        )}
        {!showWelcomeChoice && startMode === "type" && !isStoryFinished && (
          <Flex justify="flex-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              color="#477B70"
              leftIcon={<FiArrowLeft />}
              onClick={handleBackToEntryChoice}
            >
              Change response mode
            </Button>
          </Flex>
        )}
      </VStack>

      <Modal
        isOpen={showWelcomeChoice}
        onClose={handleChooseTyping}
        isCentered
        closeOnEsc={false}
        closeOnOverlayClick={false}
        size="md"
      >
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent mx={4} borderRadius="16px" bg="#FFFDF7">
          <ModalHeader color="#244D4C" fontSize="2xl" pb={1}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              color="#477B70"
              leftIcon={<FiArrowLeft />}
              mb={3}
              onClick={() => void navigate({ to: "/conversations" })}
            >
              Back to my night sky
            </Button>
            <Text as="h2" fontSize="inherit" fontWeight="inherit" lineHeight="inherit">
              {isFirstTurn ? "How would you like to tell your story?" : "How would you like to continue this memory?"}
            </Text>
          </ModalHeader>
          <ModalBody pb={6}>
            <Text color="#66807E" lineHeight="1.6" mb={5}>
              Choose one way to continue. Only that input method appears in your story.
            </Text>
            <VStack spacing={3}>
              <Button
                type="button"
                w="full"
                minH="58px"
                variant="primary"
                leftIcon={<FiMic />}
                isLoading={voiceStatus === "connecting"}
                isDisabled={!canStartVoice}
                onClick={handleChooseVoice}
              >
                Talk with MemriPlace
              </Button>
              <Button
                type="button"
                w="full"
                minH="58px"
                variant="outline"
                color="#477B70"
                borderColor="#AFC8BA"
                leftIcon={<FiEdit3 />}
                onClick={handleChooseTyping}
              >
                Type my story
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {startMode === "voice" && !showWelcomeChoice && voiceStatusLabel && (
        <HStack
          mt={3}
          spacing={2}
          color={voiceError ? "red.500" : mutedTextColor}
        >
          <Icon as={voiceError ? FiMicOff : FiVolume2} boxSize={4} />
          <Text fontSize="sm" role="status" aria-live="polite">
            {voiceError || voiceStatusLabel}
          </Text>
        </HStack>
      )}

    </Box>
  )
}

export default ChatInput
