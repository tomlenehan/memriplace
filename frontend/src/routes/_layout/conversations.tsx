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
  Image,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  FiArrowRight,
  FiList,
  FiStar,
} from "react-icons/fi"

import {
  ConversationsService,
  SummariesService,
  type StoryRelationshipPublic,
  type StorySummaryPublic,
} from "../../client"
import ConstellationMap from "../../components/MemoryMap/ConstellationMap"
import ConstellationStar from "../../components/Common/ConstellationStar"
import NarrationControl from "../../components/Common/NarrationControl"
import StoryTopicPicker from "../../components/Conversations/StoryTopicPicker"
import { nightSkyApi, type Constellation } from "../../lib/nightSkyApi"
import { type StoryStarterTopic } from "../../lib/storyStarters"
import { organizeStoryPaths } from "../../lib/storyPaths"

export const Route = createFileRoute("/_layout/conversations")({
  validateSearch: (search: Record<string, unknown>): { mode?: "constellations" } =>
    search.mode === "constellations" ? { mode: "constellations" } : {},
  component: MemoryMap,
})

const ink = "#17353B"
const muted = "#61777A"
const paper = "#FFFDF5"
const accents = ["#D88B4A", "#4B8D82", "#9A78AA", "#CE7667", "#638CAA"]
const MEMORY_PAGE_SIZE = 100

async function readAllSavedMemories(): Promise<StorySummaryPublic[]> {
  const stories: StorySummaryPublic[] = []
  for (let skip = 0; ; skip += MEMORY_PAGE_SIZE) {
    const page = await SummariesService.readStorySummaries({ limit: MEMORY_PAGE_SIZE, skip })
    stories.push(...page)
    if (page.length < MEMORY_PAGE_SIZE) return stories
  }
}

function StarPlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9.5 2.8 2.2 4.4 4.9.7-3.5 3.4.8 4.9-4.4-2.3-4.4 2.3.8-4.9-3.5-3.4 4.9-.7 2.2-4.4Z" />
      <path d="M18.5 14.5v7M15 18h7" />
    </svg>
  )
}

function ConnectedStarsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 8.5-3.7 5.7m6.7-5.7 3.7 5.7m-8.4 2h6.4" />
      <path d="m12 2.5 1.35 2.8 3.05.45-2.2 2.15.52 3.05L12 9.5l-2.72 1.45.52-3.05L7.6 5.75l3.05-.45L12 2.5Z" />
      <path d="m5.5 13.2.95 1.95 2.15.32-1.55 1.51.36 2.14-1.91-1.01-1.91 1.01.36-2.14-1.55-1.51 2.15-.32.95-1.95Z" />
      <path d="m18.5 13.2.95 1.95 2.15.32-1.55 1.51.36 2.14-1.91-1.01-1.91 1.01.36-2.14-1.55-1.51 2.15-.32.95-1.95Z" />
    </svg>
  )
}

function MemoryMap() {
  const [view, setView] = useState<"sky" | "list">("sky")
  const [focusedGroupId, setFocusedGroupId] = useState<number | null>(null)
  const { mode: selectedMode } = Route.useSearch()
  const mode = selectedMode ?? "memories"
  const [crafting, setCrafting] = useState(false)
  const [topicOpen, setTopicOpen] = useState(false)
  const [startingTopic, setStartingTopic] = useState<StoryStarterTopic | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startRequestInFlight = useRef(false)
  useEffect(() => {
    setCrafting(false)
    setView("sky")
    setFocusedGroupId(null)
  }, [mode])
  const conversationsQuery = useQuery({
    queryKey: ["conversationConstellation"],
    queryFn: () => ConversationsService.readConversations({ limit: 500 }),
  })
  const storiesQuery = useQuery({
    queryKey: ["summaries"],
    queryFn: readAllSavedMemories,
  })
  const relationshipsQuery = useQuery({
    queryKey: ["storyRelationships"],
    queryFn: () => SummariesService.readStoryRelationships(),
    enabled: storiesQuery.isSuccess,
  })
  const groupsQuery = useQuery({
    queryKey: ["constellations"],
    queryFn: nightSkyApi.list,
    enabled: storiesQuery.isSuccess,
  })
  const createConversation = useMutation({
    mutationFn: (topic: StoryStarterTopic) =>
      ConversationsService.createConversation({ requestBody: { starter_topic: topic } }),
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
      setStartingTopic(null)
    },
  })

  const stories = useMemo(
    () =>
      [...(storiesQuery.data ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [storiesQuery.data],
  )
  const relationships = relationshipsQuery.data ?? []
  const storyById = useMemo(
    () => new Map(stories.map((story) => [story.id, story])),
    [stories],
  )
  const paths = useMemo(() => organizeStoryPaths(conversationsQuery.data?.data ?? [], stories),
    [conversationsQuery.data, stories])

  const isLoading = conversationsQuery.isLoading || storiesQuery.isLoading
  const hasError = conversationsQuery.isError || storiesQuery.isError

  const startStory = (topic: StoryStarterTopic) => {
    if (startRequestInFlight.current) return
    startRequestInFlight.current = true
    setStartingTopic(topic)
    createConversation.mutate(topic)
  }
  const openTopics = () => {
    createConversation.reset()
    setTopicOpen(true)
  }

  if (isLoading) {
    return (
      <Center minH="60vh" flexDirection="column" gap={4} color={muted}>
        <Spinner color="#4B8D82" size="xl" thickness="3px" />
        <Text>Gathering your memories…</Text>
      </Center>
    )
  }

  if (storiesQuery.isError && !storiesQuery.data) {
    return <Box maxW="700px" mx="auto" pt={10}>
      <Alert status="error" borderRadius="12px" alignItems="flex-start">
        <AlertIcon mt={1} />
        <Box>
          <Text fontWeight="bold">Your memories could not be loaded.</Text>
          <Text mt={1}>They are still saved. Please try again.</Text>
          <Button mt={4} size="md" onClick={() => void storiesQuery.refetch()}>Try again</Button>
        </Box>
      </Alert>
    </Box>
  }

  return (
    <Box color={ink} maxW="1280px" mx="auto" pb={{ base: 12, md: 20 }}>
      {hasError && (
        <Alert status="error" borderRadius="xl" mb={6}>
          <AlertIcon />
          We couldn’t load part of your Night Sky. Refresh the page to try
          again.
        </Alert>
      )}
      {stories.length === 0 && paths.inProgress.length === 0 && paths.suggested.length === 0 ? (
        <Box
          bg="linear-gradient(135deg, #F8FAE9, #FFF5DC 65%, #F7ECDF)"
          border="1px solid #E8E2D3"
          borderRadius="28px"
          px={6}
          py={{ base: 10, md: 14 }}
          textAlign="center"
        >
          <ConstellationStar
            h={{ base: "176px", md: "208px" }}
            label="A smiling star floating among a constellation"
            mb={1}
            mx="auto"
            w={{ base: "176px", md: "208px" }}
          />
          <Heading
            fontFamily={'"Iowan Old Style", Georgia, serif'}
            fontSize="2xl"
          >
            Start your night sky with one memory.
          </Heading>
          <Text
            color={muted}
            maxW="440px"
            mx="auto"
            mt={3}
            mb={6}
            lineHeight="1.7"
          >
            Tell us about a person, place, or moment you remember. We’ll help
            you save it as your first star.
          </Text>
          <Button
            onClick={openTopics}
            rightIcon={<FiArrowRight />}
            variant="accent"
            size="lg"
            px={8}
          >
            Tell your first memory
          </Button>
          <Text fontSize="xs" color={muted} mt={4}>
            Speak or type · Your pace · Always your story
          </Text>
        </Box>
      ) : (
        <ConstellationMap
          stories={stories}
          unfinishedStories={paths.inProgress}
          conversations={conversationsQuery.data?.data ?? []}
          onStartMemory={openTopics}
          groups={groupsQuery.data ?? []}
          mode={mode}
          crafting={crafting}
          onCraftingChange={setCrafting}
          focusedGroupId={focusedGroupId}
          onFocusedGroupChange={setFocusedGroupId}
          toolbar={<Box className="sky-toolbar">
            <HStack className="sky-mode-switch" spacing={0} role="group" aria-label="Night Sky view">
              <Button className="sky-mode-button" aria-pressed={mode === "memories"}
                onClick={() => { void navigate({ to: "/conversations", search: {} }); setView("sky"); setCrafting(false) }}>Memories</Button>
              <Button className="sky-mode-button" aria-pressed={mode === "constellations"}
                isDisabled={stories.length < 2}
                onClick={() => { void navigate({ to: "/conversations", search: { mode: "constellations" } }); setView("sky"); setCrafting(false) }}>Constellations</Button>
            </HStack>
          </Box>}
          headerActions={<Flex className="sky-header-actions">
            {mode === "memories" ? <Button className="sky-primary-action sky-primary-action-add" variant="accent" size="md" leftIcon={<StarPlusIcon />} onClick={openTopics}>Add memory</Button> : <Button className="sky-primary-action" variant="accent" size="md" leftIcon={<ConnectedStarsIcon />}
              isDisabled={crafting} onClick={() => setCrafting(true)}>Create constellation</Button>}
            <Button className="sky-list-toggle" size="md" variant="ghost" leftIcon={<FiList />}
              isDisabled={stories.length === 0} onClick={() => setView(view === "sky" ? "list" : "sky")}>
              {view === "sky" ? "View as list" : "Back to sky"}
            </Button>
          </Flex>}
          listContent={view === "list" ? mode === "memories"
            ? <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
              {stories.map((story, index) => <MemoryCard key={story.id} story={story}
                accent={accents[index % accents.length]} relationships={relationships} storyById={storyById} />)}
            </SimpleGrid>
            : <ConstellationList groups={groupsQuery.data ?? []} onOpen={(id) => {
              setFocusedGroupId(id)
              setView("sky")
            }} /> : null}
        />
      )}

      {relationshipsQuery.isError && stories.length > 0 && (
        <Text color={muted} fontSize="sm" mt={4}>
          Saved memories are here. Connections are temporarily unavailable.
        </Text>
      )}
      {groupsQuery.isError && stories.length > 0 && <Text color={muted} fontSize="sm" mt={4}>Your memories are here, but saved constellations are temporarily unavailable.</Text>}
      <StoryTopicPicker isOpen={topicOpen} onClose={() => { if (!startingTopic) setTopicOpen(false) }}
        onChoose={startStory} startingTopic={startingTopic} hasError={createConversation.isError} />
    </Box>
  )
}

const constellationAccents = ["#F8D881", "#8ED8BC", "#D9B8F0", "#F5AC91", "#91C9EF", "#F39FB8"]

function ConstellationList({ groups, onOpen }: { groups: Constellation[]; onOpen: (id: number) => void }) {
  if (groups.length === 0) {
    return <Center minH="300px" flexDirection="column" textAlign="center" px={6}>
      <Center w="58px" h="58px" borderRadius="14px" bg="#E4F2EA" color="#3F7F74" mb={4}>
        <Icon as={FiStar} boxSize={7} />
      </Center>
      <Heading size="md">No constellations yet</Heading>
      <Text color={muted} mt={2}>Connect two or more memories to create your first one.</Text>
    </Center>
  }

  return <Stack spacing={3}>
    {groups.map((group, index) => {
      const accent = constellationAccents[index % constellationAccents.length]
      return <Flex
        key={group.id}
        as="button"
        type="button"
        className="sky-constellation-list-row"
        onClick={() => onOpen(group.id)}
        style={{ "--constellation-accent": accent } as CSSProperties}
        align="center"
        gap={{ base: 3, md: 4 }}
        textAlign="left"
        aria-label={`Open ${group.title}`}
      >
        <Center className="sky-constellation-list-symbol">
          <Icon as={FiStar} boxSize={6} />
        </Center>
        <Box minW={0} flex="1">
          <Heading size="sm" noOfLines={1}>{group.title}</Heading>
          <Text color={muted} fontSize="sm" mt={1}>
            {group.members.length} connected {group.members.length === 1 ? "memory" : "memories"}
          </Text>
          {group.overview && <Text color={muted} fontSize="sm" mt={2} noOfLines={2}>{group.overview}</Text>}
        </Box>
        <HStack flex="0 0 auto" spacing={3} color="#3D7168">
          <Text display={{ base: "none", sm: "block" }} fontSize="sm" fontWeight="700">
            {group.publication_id ? "Public" : "Private"}
          </Text>
          <Icon as={FiArrowRight} boxSize={5} />
        </HStack>
      </Flex>
    })}
  </Stack>
}

function MemoryCard({
  story,
  accent,
  relationships,
  storyById,
}: {
  story: StorySummaryPublic
  accent: string
  relationships: StoryRelationshipPublic[]
  storyById: Map<number, StorySummaryPublic>
}) {
  const connected = relationships.flatMap((relationship) => {
    if (relationship.story_a_id === story.id)
      return [storyById.get(relationship.story_b_id)].filter(
        (item): item is StorySummaryPublic => Boolean(item),
      )
    if (relationship.story_b_id === story.id)
      return [storyById.get(relationship.story_a_id)].filter(
        (item): item is StorySummaryPublic => Boolean(item),
      )
    return []
  })
  const date = new Date(story.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })

  return (
    <Box
      display="flex"
      flexDirection="column"
      minH="220px"
      bg={paper}
      border="1px solid #E8E2D3"
      borderRadius="18px"
      overflow="hidden"
      color={ink}
      textDecoration="none"
      transition="transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease"
      _hover={{
        transform: "translateY(-2px)",
        boxShadow: "0 12px 28px rgba(39,62,61,0.09)",
        borderColor: `${accent}99`,
      }}
      _focusVisible={{ outline: "3px solid #D98061", outlineOffset: "3px" }}
    >
      {story.image_url && (
        <Image
          src={story.image_url}
          alt=""
          h="128px"
          w="full"
          objectFit="cover"
        />
      )}
      <Stack spacing={3} p={4} flex="1">
        <HStack align="flex-start" spacing={3}>
          <Center
            flexShrink={0}
            boxSize="36px"
            borderRadius="12px"
            bg={`${accent}20`}
            color={accent}
          >
            <Icon as={FiStar} />
          </Center>
          <Box minW={0} flex="1">
            <Heading size="sm" lineHeight="1.35" noOfLines={2}>
              {story.title || "A remembered moment"}
            </Heading>
            <Text color={muted} fontSize="xs" mt={1}>
              {date}
            </Text>
          </Box>
          <Button as={Link} to="/summary/$summaryId" params={{ summaryId: String(story.id) }}
            aria-label={`Open ${story.title || "memory"}`} variant="ghost" minW="44px" minH="44px" p={0} color={accent}>
            <Icon as={FiArrowRight} />
          </Button>
        </HStack>
        <NarrationControl path={`memories/${story.id}`} displayText={story.summary_text}
          spokenTitle={story.title || "A remembered moment"} displayTextLines={3} />
        {connected.length > 0 && (
          <Box mt="auto" pt={2} borderTop="1px solid #EFEADD">
            <Text fontSize="xs" color="#4B8D82" fontWeight="700" mb={1}>
              {connected.length > 1 ? "CONNECTED MEMORIES" : "CONNECTED MEMORY"}
            </Text>
            <Text fontSize="sm" color={ink} noOfLines={1}>
              {connected[0].title || "A remembered moment"}
              {connected.length > 1 ? ` and ${connected.length - 1} more` : ""}
            </Text>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
