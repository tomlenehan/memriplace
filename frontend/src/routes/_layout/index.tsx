import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Skeleton,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import ConstellationStar from "../../components/Common/ConstellationStar"
import { useMemo, useRef } from "react"
import {
  FiArrowRight,
  FiBookOpen,
  FiStar,
} from "react-icons/fi"

import {
  ConversationsService,
  SummariesService,
  UserStoryPromptsService,
  type ConversationPublic,
  type UserPublic,
  type UserStoryPromptPublic,
} from "../../client"
import { storyStarters, type StoryStarterTopic } from "../../lib/storyStarters"
import { organizeStoryPaths, pendingStorySuggestionParentId } from "../../lib/storyPaths"
import "./story-paths.css"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startRequestInFlight = useRef(false)
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const displayName = currentUser?.full_name?.trim().split(/\s+/)[0]
  const promptsQuery = useQuery({
    queryKey: ["storyStarters"],
    queryFn: () => UserStoryPromptsService.readUserStoryPrompts({ limit: 100 }),
  })
  const conversationsQuery = useQuery({
    queryKey: ["conversationConstellation"],
    queryFn: () => ConversationsService.readConversations({ limit: 500 }),
    refetchInterval: (query) => pendingStorySuggestionParentId(query.state.data?.data) ? 1500 : false,
  })
  const memoriesQuery = useQuery({
    queryKey: ["summaries"],
    queryFn: () => SummariesService.readStorySummaries({ limit: 100 }),
  })
  const paths = useMemo(() => organizeStoryPaths(conversationsQuery.data?.data ?? [], memoriesQuery.data ?? []),
    [conversationsQuery.data, memoriesQuery.data])
  const pendingSuggestionParentId = pendingStorySuggestionParentId(conversationsQuery.data?.data)
  const pendingSuggestionSource = pendingSuggestionParentId == null
    ? null
    : paths.memoryByConversationId.get(pendingSuggestionParentId)?.title?.trim() || "your latest memory"
  const startStory = useMutation({
    mutationFn: ({ promptId, topic }: { promptId?: number; topic?: StoryStarterTopic }) =>
      ConversationsService.createConversation({
        requestBody: promptId ? { user_story_prompt_id: promptId } : topic ? { starter_topic: topic } : {},
      }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({
        queryKey: ["conversationConstellation"],
      })
      await navigate({
        to: "/conversation/$conversationId",
        params: { conversationId: String(conversation.id) },
      })
    },
    onSettled: () => {
      startRequestInFlight.current = false
    },
  })
  const startStoryFromPrompt = (promptId?: number, topic?: StoryStarterTopic) => {
    if (startRequestInFlight.current) return
    startRequestInFlight.current = true
    startStory.mutate({ promptId, topic })
  }
  const activateSuggestion = useMutation({
    mutationFn: (id: number) => ConversationsService.activateStoryNode({ id }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversationConstellation"] })
      await navigate({ to: "/conversation/$conversationId", params: { conversationId: String(conversation.id) } })
    },
  })

  const promptForCategory = (
    category: string,
  ): UserStoryPromptPublic | undefined =>
    promptsQuery.data?.data.find((prompt) => prompt.category?.name === category)

  return (
    <Container maxW="6xl" px={0}>
      <Stack spacing={{ base: 6, md: 8 }}>
        <Flex
          align="center"
          gap={5}
          p={{ base: 6, md: 8 }}
          bg="linear-gradient(120deg, #EDF4E2, #FFF2CE)"
          borderRadius="30px"
          border="1px solid #E2E7D1"
        >
          <Box flex="1">
            <Text color="ui.main" fontWeight="bold" mb={2}>
              {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
            </Text>
            <Heading as="h1" size="xl" letterSpacing={0}>
              A little memory. A little more you.
            </Heading>
            <Text color="ui.muted" mt={3} fontSize={{ base: "lg", md: "xl" }}>
              Your next star could be a person, a place, or a tiny moment that
              stayed with you.
            </Text>
            <Flex align="center" flexWrap="wrap" gap={3} mt={6}>
              <Button
                variant="accent"
                size="lg"
                rightIcon={<FiArrowRight />}
                onClick={() => startStoryFromPrompt()}
                isLoading={startStory.isPending}
              >
                Tell a memory
              </Button>
              <Button as={Link} to="/conversations" variant="outline" size="lg" leftIcon={<FiStar />}>
                My night sky
              </Button>
            </Flex>
            <Text fontSize="sm" color="ui.muted" mt={4}>
              Speak or type at your own pace. My memories stay private.
            </Text>
          </Box>
          <ConstellationStar
            w="200px"
            h="200px"
            flexShrink={0}
            display={{ base: "none", md: "block" }}
          />
        </Flex>
        {paths.inProgress.length > 0 && <Box as="section" aria-labelledby="in-progress-heading">
          <Heading id="in-progress-heading" size="md" mb={4}>Continue a memory</Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {paths.inProgress.map((conversation) => <StoryPathTile key={conversation.id} conversation={conversation}
              state="in-progress" sourceTitle={paths.sourceTitle(conversation)}
              onClick={() => void navigate({ to: "/conversation/$conversationId", params: { conversationId: String(conversation.id) } })} />)}
          </SimpleGrid>
        </Box>}

        {(paths.suggested.length > 0 || pendingSuggestionParentId != null) && <Box as="section" aria-labelledby="suggested-heading">
          <Heading id="suggested-heading" size="md" mb={1}>A thread to follow</Heading>
          <Text color="ui.muted" fontSize="sm" mb={4}>A detail from a saved memory may open another story. Choose one to explore, or leave it for later.</Text>
          {pendingSuggestionParentId != null ? <Flex role="status" align="center" gap={3} p={4} border="1px solid" borderColor="ui.line" borderRadius="8px" bg="#F0F2F0" color="ui.muted">
            <Spinner size="sm" color="ui.main" />
            <Text>Finding a thoughtful next thread from {pendingSuggestionSource}…</Text>
          </Flex> : <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {paths.suggested.map((conversation) => <StoryPathTile key={conversation.id} conversation={conversation}
              state="suggested" sourceTitle={paths.sourceTitle(conversation)}
              onClick={() => activateSuggestion.mutate(conversation.id)}
              disabled={activateSuggestion.isPending} />)}
          </SimpleGrid>}
        </Box>}

        {(conversationsQuery.isError || memoriesQuery.isError || activateSuggestion.isError) && <Alert status="error" borderRadius="8px">
          <AlertIcon />{activateSuggestion.isError ? "We couldn’t open that suggestion. Please try again." : "Your story paths could not be loaded. Please refresh to see them."}
        </Alert>}

        <Box as="section" aria-labelledby="starter-heading">
          <Heading id="starter-heading" size="md">Start somewhere new</Heading>
          <Text color="ui.muted" fontSize="sm" mt={1}>
            Choose a starting point whenever something comes to mind.
          </Text>
        </Box>

        {promptsQuery.isError && (
          <Alert status="info" borderRadius="8px">
            <AlertIcon />
            You can still begin with any idea below.
          </Alert>
        )}

        {promptsQuery.isLoading ? (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {storyStarters.map((starter) => (
              <Skeleton
                key={starter.category}
                minH="148px"
                borderRadius="8px"
              />
            ))}
          </SimpleGrid>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {storyStarters.map((starter) => {
              const prompt = promptForCategory(starter.category)
              const isStarting = startStory.isPending

              return (
                <Button
                  key={starter.category}
                  variant="storyStarter"
                  onClick={() => startStoryFromPrompt(prompt?.id, starter.topic)}
                  isLoading={isStarting}
                  isDisabled={isStarting}
                  aria-label={`Start a story: ${starter.title}`}
                  minH={{ base: "132px", md: "148px" }}
                >
                  <Flex align="center" gap={4} w="full">
                    <Flex
                      align="center"
                      justify="center"
                      flexShrink={0}
                      boxSize="52px"
                      borderRadius="18px"
                      bg={starter.color}
                      color="ui.mainDark"
                    >
                      <Icon as={starter.icon} boxSize={6} />
                    </Flex>
                    <Stack align="flex-start" spacing={1} flex="1" minW={0}>
                      <Text
                        fontSize="lg"
                        fontWeight="bold"
                        color="ui.ink"
                        whiteSpace="normal"
                      >
                        {starter.title}
                      </Text>
                      <Text
                        color="ui.muted"
                        fontSize="md"
                        fontWeight="normal"
                        lineHeight="1.5"
                      >
                        {starter.description}
                      </Text>
                    </Stack>
                    <Icon
                      as={FiArrowRight}
                      color="ui.main"
                      boxSize={5}
                      flexShrink={0}
                    />
                  </Flex>
                </Button>
              )
            })}
          </SimpleGrid>
        )}

        {startStory.isError && (
          <Alert status="error" borderRadius="8px">
            <AlertIcon />
            We couldn’t start a story just now. Please try again.
          </Alert>
        )}

      </Stack>
    </Container>
  )
}

export default Dashboard

function StoryPathTile({ conversation, state, sourceTitle, onClick, disabled = false }: {
  conversation: ConversationPublic
  state: "in-progress" | "suggested"
  sourceTitle: string | null
  onClick: () => void
  disabled?: boolean
}) {
  const suggested = state === "suggested"
  return <Button variant="storyStarter" className={`home-story-path home-story-path--${state}`}
    onClick={onClick} isDisabled={disabled} aria-label={`${suggested ? "Begin suggested story" : "Continue memory"}: ${conversation.node_title || "A remembered moment"}`}
    minH={{ base: "132px", md: "148px" }}>
    <Flex align="center" gap={4} w="full">
      <Flex className="home-story-path-icon" align="center" justify="center" flexShrink={0} boxSize="52px">
        <Icon as={suggested ? FiStar : FiBookOpen} boxSize={6} />
      </Flex>
      <Stack align="flex-start" spacing={1} flex="1" minW={0}>
        <Text className="home-story-path-state">{suggested ? "SUGGESTED" : "IN PROGRESS"}</Text>
        <Text fontSize="lg" fontWeight="bold" color="ui.ink" whiteSpace="normal">{conversation.node_title || "A remembered moment"}</Text>
        {sourceTitle && <Text className="home-story-path-source">From {sourceTitle}</Text>}
        {conversation.branch_context && <Text color="ui.muted" fontSize="sm" noOfLines={2} whiteSpace="normal">{conversation.branch_context}</Text>}
      </Stack>
      <Icon as={FiArrowRight} color="ui.main" boxSize={5} flexShrink={0} />
    </Flex>
  </Button>
}
