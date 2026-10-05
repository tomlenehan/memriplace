import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Center,
  Flex,
  Heading,
  HStack,
  Icon,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useRef } from "react"
import { FiArrowLeft, FiCheck, FiCompass, FiGitBranch } from "react-icons/fi"

import { ConversationsService } from "../../../client"
import ConstellationStar from "../../../components/Common/ConstellationStar"
import ChatInput from "../../../components/Conversations/ChatInput"
import ChatMessages from "../../../components/Conversations/ChatMessages"
import { ReadingTextSizeControl, READING_TEXT_SIZE_ENABLED } from "../../../components/Common/ReadingTextSize"

const MAX_NODE_USER_TURNS = 8
const MIN_NODE_USER_TURNS_BEFORE_SAVE = 4
const MIN_NODE_USER_TURNS_BEFORE_READINESS = 6

export const Route = createFileRoute("/_layout/conversation/$conversationId")({
  component: ConversationPage,
})

function ConversationPage() {
  const { conversationId } = Route.useParams()
  const id = Number(conversationId)
  const readinessPollDeadline = useRef<{ id: number; turns: number; until: number } | null>(null)
  const resumeCheckCompletedFor = useRef<number | null>(null)
  const conversationQuery = useQuery({
    queryKey: ["conversationNode", id],
    queryFn: async () => {
      const conversation = await ConversationsService.readConversation({ id })
      if (
        conversation.status === "active" &&
        (conversation.user_turn_count ?? 0) < MAX_NODE_USER_TURNS &&
        resumeCheckCompletedFor.current !== id
      ) {
        const resumedConversation = await ConversationsService.activateStoryNode({ id })
        resumeCheckCompletedFor.current = id
        return resumedConversation
      }
      return conversation
    },
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: (query) => {
      const conversation = query.state.data
      const turns = conversation?.user_turn_count ?? 0
      if (!conversation || conversation.status !== "active" || conversation.ready_to_save || turns < MIN_NODE_USER_TURNS_BEFORE_READINESS) return false
      if (!readinessPollDeadline.current || readinessPollDeadline.current.id !== id || readinessPollDeadline.current.turns !== turns) {
        readinessPollDeadline.current = { id, turns, until: Date.now() + 30_000 }
      }
      return Date.now() < readinessPollDeadline.current.until ? 2_500 : false
    },
  })

  if (!Number.isInteger(id) || id <= 0) {
    return <Alert status="error" borderRadius="xl"><AlertIcon />This story path could not be found.</Alert>
  }

  if (conversationQuery.isLoading) {
    return <Center minH="60vh"><Spinner color="#4B8D82" size="xl" /></Center>
  }
  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <VStack align="start" spacing={4}>
        <Alert status="error" borderRadius="xl"><AlertIcon />We couldn’t open this story path.</Alert>
        <Button as={Link} to="/conversations" leftIcon={<FiArrowLeft />} variant="outline">Back to memory map</Button>
      </VStack>
    )
  }

  const conversation = conversationQuery.data
  const turns = conversation.user_turn_count ?? 0
  const isPaused = conversation.status === "ready_for_summary" && turns < MAX_NODE_USER_TURNS
  const isFinished = conversation.status === "complete" || turns >= MAX_NODE_USER_TURNS || isPaused
  const isReadyToSave = isPaused || conversation.ready_to_save || (
    turns >= MIN_NODE_USER_TURNS_BEFORE_SAVE &&
    (conversation.status === "ready_for_summary" || isFinished)
  )

  return (
    <Flex direction="column" minH="640px" h={{ base: "calc(100svh - 120px)", md: "calc(100svh - 144px)" }} maxW="1050px" mx="auto" color="#17353B">
      <Flex justify="space-between" align="center" gap={3} mb={5}>
        <Button
          as={Link}
          to="/conversations"
          leftIcon={<FiArrowLeft />}
          variant="outline"
          color="#4B716F"
          borderColor="#AFC8BA"
          borderRadius="xl"
          minH="48px"
          px={5}
          fontWeight="700"
          _hover={{ bg: "#E9F1E9", borderColor: "#78A99A" }}
        >
          My Night Sky
        </Button>
        <HStack spacing={2} color="#66807E">
          <Icon as={FiCompass} />
          <Text fontSize="xs" fontWeight="800" textTransform="uppercase" letterSpacing="0.13em">
            Story path {String((conversation.node_depth ?? 0) + 1).padStart(2, "0")}
          </Text>
        </HStack>
      </Flex>

      <Box
        flex="1"
        minH={0}
        display="flex"
        flexDirection="column"
        bg="#FFFDF7"
        border="1px solid #E8E2D3"
        borderRadius={{ base: "22px", md: "30px" }}
        overflow="hidden"
        boxShadow="0 16px 48px rgba(39,62,61,0.06)"
      >
        <Box px={{ base: 4, md: 7 }} pt={{ base: 5, md: 7 }} pb={5} borderBottom="1px solid #EFEADD">
          <Flex align="flex-start" justify="space-between" gap={4}>
            <Box minW={0}>
              {conversation.branch_context && (
                <HStack spacing={2} mb={2} color="#D07F5C">
                  <Icon as={FiGitBranch} boxSize={3.5} />
                  <Text fontSize="xs" fontWeight="700" letterSpacing="0.03em" noOfLines={1}>
                    Following: {conversation.branch_context}
                  </Text>
                </HStack>
              )}
              <Heading
                fontFamily={'"Iowan Old Style", "Palatino Linotype", Georgia, serif'}
                fontSize={{ base: "2xl", md: "3xl" }}
                lineHeight="1.1"
                letterSpacing="-0.025em"
              >
                {conversation.node_title || "A remembered moment"}
              </Heading>
              <Text mt={2} color="#66807E" fontSize="sm" lineHeight="1.6">
                {isPaused
                  ? "We can pick this memory up whenever you’re ready, or save what you’ve shared now."
                  : isFinished
                  ? "This memory is complete. You can save it or revisit your night sky."
                  : isReadyToSave
                    ? "This memory is ready to save. You can keep talking if there’s more to tell."
                    : "Take your time. There are no wrong details, and you can share as much or as little as you like."}
              </Text>
            </Box>
            <Center
              w={{ base: "42px", md: "50px" }}
              h={{ base: "42px", md: "50px" }}
              flexShrink={0}
              borderRadius="18px"
              bg={isReadyToSave ? "#E7F0E8" : "#F8EBD3"}
              color={isReadyToSave ? "#4B8D82" : "#D08B45"}
            >
              {isReadyToSave ? <Icon as={FiCheck} boxSize={5} /> : <ConstellationStar boxSize="76px" flexShrink={0} />}
            </Center>
          </Flex>
          <HStack mt={5} spacing={2} color={isReadyToSave ? "#477B70" : "#B57B3E"}>
            <Icon as={isReadyToSave ? FiCheck : FiCompass} boxSize={3.5} />
            <Text fontSize="xs" fontWeight="800" textTransform="uppercase" letterSpacing="0.12em">
              {isPaused ? "Paused · ready to save" : isFinished ? "Path complete" : isReadyToSave ? "Ready to save · keep exploring if you like" : turns ? `${turns} ${turns === 1 ? "moment" : "moments"} shared · follow the story` : "Your story starts here"}
            </Text>
          </HStack>
        </Box>

        {isFinished && (
          <Flex
            px={{ base: 4, md: 7 }}
            py={3}
            bg="#F1F5EB"
            align={{ base: "stretch", sm: "center" }}
            justify="space-between"
            gap={3}
            direction={{ base: "column", sm: "row" }}
          >
            <Text fontSize="sm" color="#476B63">
              Your memory is ready to save whenever you are.
            </Text>
            <HStack spacing={2}>
              <Button
                as={Link}
                to="/conversations"
                size="sm"
                variant="ghost"
                color="#426858"
                borderRadius="full"
                _hover={{ bg: "#3D786F" }}
              >
                Open My Night Sky
              </Button>
            </HStack>
          </Flex>
        )}


        <Box flex="1" minH={0} display="flex" flexDirection="column" overflow="hidden" bg="#FBF9F1">
          {READING_TEXT_SIZE_ENABLED && <Flex justify="flex-end" px={{ base: 4, md: 7 }} py={1} borderBottom="1px solid #EFEADD">
            <ReadingTextSizeControl />
          </Flex>}
          <ChatMessages conversationId={id} />
        </Box>
        <ChatInput
          key={id}
          conversationId={id}
          storyFinished={isFinished}
          readyToSave={isReadyToSave}
          memoryAlreadySaved={conversation.status === "complete"}
          userTurnCount={conversation.user_turn_count ?? 0}
        />
      </Box>
    </Flex>
  )
}

export default ConversationPage
