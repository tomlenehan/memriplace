import {
  Box, Button, Flex, Heading, HStack, IconButton, Image, Input, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, Stack, Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { FiArrowRight, FiBookOpen, FiChevronLeft, FiChevronRight, FiEdit3, FiMap, FiStar, FiX } from "react-icons/fi"
import { ConversationsService, SummariesService, type ConversationPublic, type RelatedStorySuggestion, type StorySummaryPublic } from "../../client"
import NarrationControl from "../Common/NarrationControl"
import { celebrateConnection } from "../../lib/celebration"
import { nightSkyApi, type Constellation } from "../../lib/nightSkyApi"
import "@xyflow/react/dist/style.css"
import "./night-sky.css"

const starColors = ["#F8D881", "#B9DDCF", "#D9C5E6", "#F4C7AF", "#BDDCE9"]
const groupColors = ["#F8D881", "#8ED8BC", "#D9B8F0", "#F5AC91", "#91C9EF", "#F39FB8"]
const MAX_NODE_USER_TURNS = 8
const groupColor = (id: number) => groupColors[(id - 1) % groupColors.length]
// Constellation ids are database ids, so zero can safely represent the clear-all state.
const NO_CONSTELLATION_SELECTION = 0

type StarNode = Node<{
  story: StorySummaryPublic
  tint: string
  active: boolean
  picked: boolean
  crafting: boolean
  onChoose: (id: number) => void
}, "star">

type UnfinishedStoryNode = Node<{
  conversation: ConversationPublic
  suggested: boolean
  active: boolean
  onChoose: (id: number) => void
}, "unfinishedStory">

type StarterNode = Node<{ onChoose: () => void }, "starter">

function Star({ data }: NodeProps<StarNode>) {
  const title = data.story.title || "A remembered moment"
  return <div className={`sky-node ${data.active ? "active" : ""} ${data.picked ? "picked" : ""} ${data.crafting ? "crafting" : ""}`}>
    {/* Temporarily disabled: the animated mascot above the selected star felt too playful. */}
    <Handle type="target" position={Position.Left} className="sky-node-handle" />
    <button type="button" className="sky-node-hit nodrag nopan"
      aria-label={data.crafting ? `${data.picked ? "Remove" : "Choose"} ${title} ${data.picked ? "from" : "for"} constellation` : `Explore ${title}`}
      aria-pressed={data.active || data.picked} onClick={() => data.onChoose(data.story.id)} title={title}>
      <span className="sky-node-button" style={{ "--node-tint": data.tint } as CSSProperties}>
        {data.story.image_url ? <img src={data.story.image_url} alt="" /> : <FiStar aria-hidden="true" />}
        <span className="sky-node-spark" aria-hidden="true">✦</span>
      </span>
      <span className="sky-node-title">{title}</span>
    </button>
    <Handle type="source" position={Position.Right} className="sky-node-handle" />
  </div>
}

function UnfinishedStory({ data }: NodeProps<UnfinishedStoryNode>) {
  const title = data.conversation.node_title || (data.suggested ? "A suggested story" : "A story in progress")
  const turnCount = data.conversation.user_turn_count ?? 0
  const statusLabel = data.suggested
    ? "SUGGESTED"
    : data.conversation.status === "ready_for_summary"
      ? turnCount >= MAX_NODE_USER_TURNS ? "COMPLETE" : "READY TO SAVE"
      : "IN PROGRESS"
  return <div className={`sky-node sky-unfinished-node sky-unfinished-node--${data.suggested ? "suggested" : "progress"} ${data.active ? "active" : ""}`}>
    {/* Keep the same restrained selection treatment for unfinished and suggested stars. */}
    <Handle type="target" position={Position.Left} className="sky-node-handle" />
    <button type="button" className="sky-node-hit nodrag nopan"
      aria-label={`${data.suggested ? "Explore suggested memory" : "Continue memory"}: ${title}`}
      aria-pressed={data.active} onClick={() => data.onChoose(data.conversation.id)} title={title}>
      <span className="sky-node-button">
        <FiStar aria-hidden="true" />
        <span className="sky-unfinished-node-icon" aria-hidden="true">{data.suggested ? <FiStar /> : <FiBookOpen />}</span>
      </span>
      <span className="sky-node-title"><span className="sky-unfinished-node-kicker">{statusLabel}</span>{title}</span>
    </button>
    <Handle type="source" position={Position.Right} className="sky-node-handle" />
  </div>
}

function Starter({ data }: NodeProps<StarterNode>) {
  return <div className="sky-node sky-starter-node">
    <button type="button" className="sky-node-hit nodrag nopan" aria-label="Start a new memory" onClick={data.onChoose}>
      <span className="sky-node-button"><FiStar aria-hidden="true" /></span>
      <span className="sky-node-title"><span className="sky-unfinished-node-kicker">STARTER</span>New memory</span>
    </button>
  </div>
}

const nodeTypes = { star: Star, unfinishedStory: UnfinishedStory, starter: Starter }

type SkyItem = { id: number; key: string; isMemory: boolean }

function layout(items: SkyItem[], compact: boolean, narrow: boolean, group?: Constellation) {
  const columns = narrow ? 1 : compact || items.length <= 8 ? 2 : Math.ceil(Math.sqrt(items.length * 1.45))
  const rows = Math.ceil(items.length / columns)
  const desktopRowGap = rows > 1 ? Math.min(184, 320 / (rows - 1)) : 0
  const members = new Map(group?.members.map((member) => [member.story_id, member]) ?? [])
  return new Map(items.map((item, i) => [item.key, {
    x: !compact && item.isMemory && members.get(item.id)?.x != null ? 70 + members.get(item.id)!.x! * 760
      : compact ? (narrow ? 70 : 30 + (i % columns) * 185)
      : 90 + (i % columns) * (columns === 2 ? 390 : 218) + (Math.floor(i / columns) % 2 ? 55 : 0) + Math.sin(item.id * 2.7) * 20,
    y: !compact && item.isMemory && members.get(item.id)?.y != null ? 45 + members.get(item.id)!.y! * 420
      : compact ? 72 + Math.floor(i / columns) * 184 + (i % columns ? 24 : 0)
      : 72 + Math.floor(i / columns) * desktopRowGap + Math.cos(item.id * 1.9) * 24,
  }]))
}

export default function ConstellationMap({ stories, unfinishedStories = [], conversations = [], groups = [], mode, crafting, onCraftingChange, focusedGroupId, onFocusedGroupChange, onStartMemory, toolbar, headerActions, listContent }: {
  stories: StorySummaryPublic[]
  unfinishedStories?: ConversationPublic[]
  conversations?: ConversationPublic[]
  groups?: Constellation[]
  mode: "memories" | "constellations"
  crafting: boolean
  onCraftingChange: (crafting: boolean) => void
  focusedGroupId: number | null
  onFocusedGroupChange: (id: number | null) => void
  onStartMemory: () => void
  toolbar: ReactNode
  headerActions: ReactNode
  listContent: ReactNode
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedUnfinishedId, setSelectedUnfinishedId] = useState<number | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [mapKeyOpen, setMapKeyOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<RelatedStorySuggestion | null>(null)
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 600px)").matches)
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 350px)").matches)
  const [wideReader, setWideReader] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)")
    const narrowMedia = window.matchMedia("(max-width: 350px)")
    const readerMedia = window.matchMedia("(min-width: 900px)")
    const update = () => { setCompact(media.matches); setNarrow(narrowMedia.matches); setWideReader(readerMedia.matches) }
    media.addEventListener("change", update)
    narrowMedia.addEventListener("change", update)
    readerMedia.addEventListener("change", update)
    return () => { media.removeEventListener("change", update); narrowMedia.removeEventListener("change", update); readerMedia.removeEventListener("change", update) }
  }, [])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selected = stories.find((story) => story.id === selectedId) ?? null
  const selectedUnfinished = unfinishedStories.find((story) => story.id === selectedUnfinishedId) ?? null
  const selectedUnfinishedTurnCount = selectedUnfinished?.user_turn_count ?? 0
  const suggestionSourceId = crafting ? picked[0] : undefined
  const suggestionsQuery = useQuery({
    queryKey: ["constellationSuggestions", suggestionSourceId],
    queryFn: () => SummariesService.readRelatedStories({ id: suggestionSourceId!, limit: 4 }),
    enabled: Boolean(suggestionSourceId),
  })
  const memoryByConversationId = new Map(stories.map((story) => [story.conversation_id, story]))
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]))
  const parentTitle = (conversation: ConversationPublic) => {
    const parentId = conversation.parent_conversation_id
    if (parentId == null) return null
    return memoryByConversationId.get(parentId)?.title || conversationById.get(parentId)?.node_title || null
  }
  const focusedGroup = mode === "constellations" ? groups.find((group) => group.id === focusedGroupId) : undefined
  const allConstellationsSelected = mode === "constellations" && focusedGroupId === null
  const constellationConnectionsVisible = mode === "constellations" && focusedGroupId !== NO_CONSTELLATION_SELECTION
  const visibleStories = useMemo(() => focusedGroup
    && !crafting
    ? stories.filter((story) => focusedGroup.members.some((member) => member.story_id === story.id))
    : stories, [stories, focusedGroup, crafting])
  const visibleUnfinishedStories = mode === "memories" && !crafting ? unfinishedStories : []
  const skyItems = useMemo<SkyItem[]>(() => {
    const items: SkyItem[] = []
    const placed = new Set<number>()
    const appendConversation = (conversation: ConversationPublic) => {
      if (placed.has(conversation.id)) return
      placed.add(conversation.id)
      items.push({ id: conversation.id, key: `unfinished-${conversation.id}`, isMemory: false })
      visibleUnfinishedStories.filter((child) => child.parent_conversation_id === conversation.id).forEach(appendConversation)
    }
    for (const story of visibleStories) {
      items.push({ id: story.id, key: `memory-${story.id}`, isMemory: true })
      visibleUnfinishedStories.filter((child) => child.parent_conversation_id === story.conversation_id).forEach(appendConversation)
    }
    visibleUnfinishedStories.filter((conversation) => !conversation.parent_conversation_id).forEach(appendConversation)
    visibleUnfinishedStories.forEach(appendConversation)
    if (mode === "memories" && !crafting) items.push({ id: 0, key: "starter", isMemory: false })
    return items
  }, [visibleStories, visibleUnfinishedStories, mode, crafting])
  useEffect(() => {
    if (!crafting) return
    setPicked([])
    setSelectedId(null)
    setSelectedUnfinishedId(null)
    onFocusedGroupChange(null)
  }, [crafting, onFocusedGroupChange])
  useEffect(() => { setSelectedId(null); setSelectedUnfinishedId(null) }, [mode])
  const selectedIndex = visibleStories.findIndex((story) => story.id === selectedId)
  const stepSelection = (direction: number) => {
    if (selectedIndex < 0 || visibleStories.length < 2) return
    setSelectedId(visibleStories[(selectedIndex + direction + visibleStories.length) % visibleStories.length].id)
  }
  useEffect(() => {
    if (!wideReader || selectedId === null || crafting) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null)
        return
      }
      const target = event.target
      if (!(target instanceof Element) || (target !== document.body && !target.closest(".personal-sky")) ||
        target.closest("input, textarea, select, [contenteditable='true']") ||
        selectedIndex < 0 || visibleStories.length < 2 ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return
      event.preventDefault()
      const direction = event.key === "ArrowRight" ? 1 : -1
      setSelectedId(visibleStories[(selectedIndex + direction + visibleStories.length) % visibleStories.length].id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [wideReader, selectedId, crafting, selectedIndex, visibleStories])
  const guidance = crafting
    ? picked.length === 0
      ? "Choose any saved memory, even one not yet in a constellation. We’ll suggest memories that may belong with it."
      : picked.length === 1
        ? "Dotted paths are AI suggestions. Tap one to see why it fits."
        : `${picked.length} stars chosen. Add more, or name your constellation.`
    : mode === "memories" ? "Select a star to read, continue, or start a memory."
      : focusedGroup ? `${focusedGroup.members.length} connected memories. Select a star to read it.`
        : focusedGroupId === NO_CONSTELLATION_SELECTION ? "Constellation connections are hidden. Select a constellation to explore it."
          : groups.length ? "Choose a constellation to see its story, or select a star to read a memory."
          : "Create your first constellation by connecting two memories."
  const positions = useMemo(() => layout(skyItems, compact, narrow, crafting ? undefined : focusedGroup), [skyItems, compact, narrow, focusedGroup, crafting])
  const create = useMutation({
    mutationFn: async () => {
      const group = await nightSkyApi.create({
        title: name.trim(), overview: "",
        members: picked.map((story_id) => ({ story_id, x: null, y: null, share_story: false, share_image: false })),
        links: picked.slice(1).map((story_b_id, i) => ({ story_a_id: picked[i], story_b_id })),
      })
      try {
        const proposal = await nightSkyApi.proposeOverview(group.id)
        return { group, proposal, proposalError: null }
      } catch (error) {
        return { group, proposal: null, proposalError: error instanceof Error ? error.message : "Couldn’t draft the constellation story." }
      }
    },
    onSuccess: async ({ group, proposal, proposalError }) => {
      setNaming(false); onCraftingChange(false); setPicked([]); setName("")
      onFocusedGroupChange(group.id)
      queryClient.setQueryData<Constellation[]>(["constellations"], (current = []) => [...current, group])
      queryClient.setQueryData(["constellation", group.id], group)
      if (proposal) queryClient.setQueryData(["constellationOverviewProposal", group.id], proposal)
      if (proposalError) queryClient.setQueryData(["constellationOverviewProposalError", group.id], proposalError)
      celebrateConnection()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["constellations"] }),
        queryClient.invalidateQueries({ queryKey: ["storyRelationships"] }),
      ])
      await navigate({ to: "/constellation/$constellationId", params: { constellationId: String(group.id) } })
    },
  })
  const choose = (id: number) => {
    if (crafting) setPicked((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id])
    else {
      setSelectedUnfinishedId(null)
      setSelectedId(id)
    }
  }
  const chooseUnfinished = (id: number) => {
    setSelectedId(null)
    setSelectedUnfinishedId(id)
  }
  const nodes: Array<StarNode | UnfinishedStoryNode | StarterNode> = [
    ...visibleStories.map((story, i): StarNode => {
    const owningGroup = mode === "constellations" && (focusedGroup ?? (allConstellationsSelected
      ? groups.find((group) => group.members.some((member) => member.story_id === story.id))
      : undefined))
    return {
      id: `memory-${story.id}`, type: "star", position: positions.get(`memory-${story.id}`)!, draggable: false, selectable: false,
      style: { pointerEvents: "all" },
      className: selectedId === story.id || picked.includes(story.id) ? "sky-flow-node-selected" : "",
      data: { story, tint: owningGroup ? groupColor(owningGroup.id) : starColors[i % starColors.length],
        active: crafting ? picked[picked.length - 1] === story.id : selectedId === story.id,
        picked: picked.includes(story.id), crafting, onChoose: choose },
    }
    }),
    ...visibleUnfinishedStories.map((conversation): UnfinishedStoryNode => ({
      id: `unfinished-${conversation.id}`, type: "unfinishedStory", position: positions.get(`unfinished-${conversation.id}`)!, draggable: false, selectable: false,
      style: { pointerEvents: "all" }, className: selectedUnfinishedId === conversation.id ? "sky-flow-node-selected" : "",
      data: { conversation, suggested: conversation.status === "inactive", active: selectedUnfinishedId === conversation.id, onChoose: chooseUnfinished },
    })),
    ...(mode === "memories" && !crafting ? [{ id: "starter", type: "starter", position: positions.get("starter")!, draggable: false, selectable: false,
      style: { pointerEvents: "all" }, data: { onChoose: onStartMemory } } satisfies StarterNode] : []),
  ]
  const savedEdges: Edge[] = []
  const seenEdges = new Set<string>()
  if (constellationConnectionsVisible) (focusedGroup ? [focusedGroup] : groups).forEach((group) => {
    group.links.forEach((link) => {
      if (!positions.has(`memory-${link.story_a_id}`) || !positions.has(`memory-${link.story_b_id}`)) return
      const key = [link.story_a_id, link.story_b_id].sort((a, b) => a - b).join("-")
      if (seenEdges.has(key)) return
      seenEdges.add(key)
      const active = selectedId === link.story_a_id || selectedId === link.story_b_id
      savedEdges.push({ id: `saved-${key}`, source: `memory-${link.story_a_id}`, target: `memory-${link.story_b_id}`, type: "straight", selectable: false,
        style: { stroke: groupColor(group.id), strokeWidth: active ? 4 : 3, opacity: active ? 1 : .88 } })
    })
  })
  const suggestedEdges: Edge[] = crafting && suggestionSourceId ? (suggestionsQuery.data ?? [])
    .filter(({ story }) => story.id !== suggestionSourceId && !picked.includes(story.id) && positions.has(`memory-${story.id}`))
    .map((suggestion) => ({ id: `suggested-${suggestionSourceId}-${suggestion.story.id}`, source: `memory-${suggestionSourceId}`,
      target: `memory-${suggestion.story.id}`, type: "straight", selectable: false, interactionWidth: 28,
      data: { suggestion }, className: "sky-suggested-edge", style: { stroke: "#B9C5C3", strokeWidth: 2, strokeDasharray: "5 8", opacity: .9 } })) : []
  const draftEdges: Edge[] = crafting ? picked.slice(1).map((id, i) => ({
    id: `draft-${picked[i]}-${id}`, source: `memory-${picked[i]}`, target: `memory-${id}`, type: "straight", selectable: false,
    style: { stroke: "#FFE4A3", strokeWidth: 3, opacity: .95 },
  })) : []
  const resumeUnfinished = useMutation({
    mutationFn: () => ConversationsService.activateStoryNode({ id: selectedUnfinished!.id }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversationConstellation"] })
      await navigate({ to: "/conversation/$conversationId", params: { conversationId: String(conversation.id) } })
    },
  })
  const openUnfinished = () => {
    if (!selectedUnfinished) return
    const resumableDraft = (selectedUnfinished.status === "ready_for_summary" || selectedUnfinished.status === "active")
      && selectedUnfinishedTurnCount < MAX_NODE_USER_TURNS
    if (selectedUnfinished.status === "inactive" || resumableDraft) resumeUnfinished.mutate()
    else void navigate({ to: "/conversation/$conversationId", params: { conversationId: String(selectedUnfinished.id) } })
  }
  const groupPanel = focusedGroup && !crafting && !selected && !selectedUnfinished && <Box as="aside" className="sky-story-panel sky-group-panel" aria-label={`${focusedGroup.title} constellation`}>
    <Flex align="center" justify="space-between" gap={2}>
      <Text className="sky-story-count">SAVED CONSTELLATION</Text>
      <IconButton aria-label="Show all constellations" icon={<FiX />} variant="ghost" onClick={() => onFocusedGroupChange(null)} />
    </Flex>
    {/* Temporarily disabled with the map mascots; constellation selection stays unchanged. */}
    <Box className="sky-group-panel-symbol" style={{ "--group-color": groupColor(focusedGroup.id) } as CSSProperties}>
      <FiStar aria-hidden="true" />
    </Box>
    <Heading className="sky-story-title" fontFamily={'"Iowan Old Style", Georgia, serif'} size="md" mt={4}>{focusedGroup.title}</Heading>
    <Button as={Link} to="/constellation/$constellationId" params={{ constellationId: String(focusedGroup.id) }}
      className="sky-group-edit" variant="outline" leftIcon={<FiEdit3 />} mt={4}>Edit or share</Button>
    {focusedGroup.overview && <Box mt={3}><NarrationControl path={`constellations/${focusedGroup.id}`}
      displayText={focusedGroup.overview} spokenTitle={focusedGroup.title} showTextSizeControl /></Box>}
    {!focusedGroup.overview && <Text className="sky-group-panel-overview" whiteSpace="pre-wrap" mt={4}>
      These memories are connected in your personal night sky.
    </Text>}
    <Text className="sky-group-panel-label" mt={6}>{focusedGroup.members.length} connected memories</Text>
    <Stack spacing={1} mt={2}>
      {focusedGroup.members.map((member) => <Button key={member.story_id} className="sky-group-memory" variant="ghost"
        justifyContent="flex-start" whiteSpace="normal" textAlign="left" onClick={() => setSelectedId(member.story_id)}>
        <FiStar aria-hidden="true" /> {member.title || "A remembered moment"}
      </Button>)}
    </Stack>
    <Button as={Link} to="/constellation/$constellationId" params={{ constellationId: String(focusedGroup.id) }}
      className="sky-group-edit" variant="outline" leftIcon={<FiEdit3 />} mt="auto">Edit or share</Button>
  </Box>
  const memoryPanel = selected && !crafting && <Box as="aside" className="sky-story-panel" aria-label="Selected memory" aria-live="polite">
    <Flex align="center" justify="space-between" gap={2}>
      <Text className="sky-story-count">Memory {selectedIndex + 1} of {visibleStories.length}</Text>
      <IconButton aria-label="Close memory" icon={<FiX />} variant="ghost" onClick={() => setSelectedId(null)} />
    </Flex>
    <Heading className="sky-story-title" fontFamily={'"Iowan Old Style", Georgia, serif'} size="md" mt={4}>{selected.title || "A remembered moment"}</Heading>
    <Button as={Link} to="/summary/$summaryId" params={{ summaryId: String(selected.id) }}
      variant="secondary" leftIcon={<FiEdit3 />} w="full" mt={4}>Open Memory</Button>
    {selected.image_url && <Image src={selected.image_url} alt="" maxH="180px" w="full" objectFit="contain" mt={5} />}
    <Box mt={4}><NarrationControl path={`memories/${selected.id}`} displayText={selected.summary_text}
      spokenTitle={selected.title || "A remembered moment"} showTextSizeControl /></Box>
    <Box className="sky-story-actions">
      <HStack justify="space-between" mb={4}>
        <IconButton aria-label="Previous memory" icon={<FiChevronLeft />} variant="outline" onClick={() => stepSelection(-1)} isDisabled={visibleStories.length < 2} />
        <Text fontSize="sm" color="#61777A">{selectedIndex + 1} / {visibleStories.length}</Text>
        <IconButton aria-label="Next memory" icon={<FiChevronRight />} variant="outline" onClick={() => stepSelection(1)} isDisabled={visibleStories.length < 2} />
      </HStack>
      <Button as={Link} to="/summary/$summaryId" params={{ summaryId: String(selected.id) }} variant="accent" leftIcon={<FiEdit3 />} w="full">Open Memory</Button>
    </Box>
  </Box>
  const unfinishedPanel = selectedUnfinished && !crafting && <Box as="aside" className="sky-story-panel sky-unfinished-panel" aria-label="Unfinished story" aria-live="polite">
    <Flex align="center" justify="space-between" gap={2}>
      <Text className="sky-story-count">
        {selectedUnfinished.status === "inactive" ? "SUGGESTED NEXT STORY" : selectedUnfinished.status === "ready_for_summary"
          ? selectedUnfinishedTurnCount >= MAX_NODE_USER_TURNS ? "PATH COMPLETE" : "READY TO SAVE"
          : "IN PROGRESS"}
      </Text>
      <IconButton aria-label="Close unfinished story" icon={<FiX />} variant="ghost" onClick={() => setSelectedUnfinishedId(null)} />
    </Flex>
    <Flex className="sky-companion-note" align="center" gap={2} mt={3}>
      <Text>{selectedUnfinished.status === "inactive"
        ? "Curious where this story could lead."
        : selectedUnfinished.status === "ready_for_summary"
          ? selectedUnfinishedTurnCount >= MAX_NODE_USER_TURNS
            ? "This story path is complete and ready to save."
            : "Your memory is ready to save, and you can keep exploring."
          : "Your story is still unfolding."}</Text>
    </Flex>
    <Heading className="sky-story-title" fontFamily={'"Iowan Old Style", Georgia, serif'} size="md" mt={4}>
      {selectedUnfinished.node_title || "A story in progress"}
    </Heading>
    {selectedUnfinished.status === "inactive" && parentTitle(selectedUnfinished) && <Text className="sky-unfinished-panel-source" mt={3}>From {parentTitle(selectedUnfinished)}</Text>}
    <Text className="sky-unfinished-panel-copy" mt={4}>
      {selectedUnfinished.branch_context || (selectedUnfinished.status === "inactive"
        ? "This suggestion grew from a detail you shared. Begin whenever you are ready."
        : selectedUnfinished.status === "ready_for_summary" && selectedUnfinishedTurnCount >= MAX_NODE_USER_TURNS
          ? "Save this memory to keep it, or return to your Night Sky."
          : "Pick up where you left off whenever you are ready.")}
    </Text>
    <Button className="sky-unfinished-panel-action" variant="accent" leftIcon={<FiArrowRight />} w="full" mt="auto"
      isLoading={resumeUnfinished.isPending} onClick={openUnfinished}>
      {selectedUnfinished.status === "inactive"
        ? "Begin suggested memory"
        : selectedUnfinished.status === "ready_for_summary" && selectedUnfinishedTurnCount >= MAX_NODE_USER_TURNS
          ? "Save memory"
          : "Continue memory"}
    </Button>
    {resumeUnfinished.isError && <Text color="red.200" role="alert" fontSize="sm" mt={3}>We couldn’t open this story. Please try again.</Text>}
  </Box>;

  return <Stack spacing={6}>
    <Box className="personal-sky">
      <Box className="personal-sky-header">
        <Flex className="sky-header-copy" justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={4}>
        <Box><Text className="sky-overline">✦ &nbsp;YOUR PERSONAL NIGHT SKY</Text>
          <Heading fontFamily={'"Iowan Old Style", Georgia, serif'} size="md" color="#FFF9EA" mt={1}>
            {mode === "memories" ? "Your memories, drawn in starlight" : "Your constellations"}
          </Heading>
          <Text color="#D0E2D9" fontSize="md" mt={2} aria-live="polite">{guidance}</Text></Box>
        {crafting ? <HStack w={{ base: "full", md: "auto" }} flexWrap="wrap" spacing={2}>
          <Button className="sky-quiet" size="md" leftIcon={<FiX />} onClick={() => { onCraftingChange(false); setPicked([]) }}>Cancel</Button>
          <Button className="sky-gold" size="md" rightIcon={<FiArrowRight />} onClick={() => setNaming(true)} isDisabled={picked.length < 2}>Save constellation</Button>
        </HStack> : headerActions}
        </Flex>
        {toolbar}
      </Box>
      {listContent ? <Box className="sky-list-content">{listContent}</Box> : <>
      {mode === "constellations" && groups.length > 0 && <Box className="sky-constellation-bar">
        <Text className="sky-constellation-label">Saved constellations</Text>
        <Select className="sky-constellation-select" aria-label="Saved constellations" display={{ base: "block", md: "none" }}
          style={{ "--group-color": focusedGroup ? groupColor(focusedGroup.id) : "#b6d8c7" } as CSSProperties}
          value={focusedGroupId === NO_CONSTELLATION_SELECTION ? "none" : focusedGroup?.id ?? ""} onChange={(event) => {
            onFocusedGroupChange(event.target.value === "none" ? NO_CONSTELLATION_SELECTION : event.target.value ? Number(event.target.value) : null)
            setSelectedId(null)
          }}>
          <option value="">All constellations</option>
          <option value="none">Hide constellation connections</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
        </Select>
        <Flex className="sky-constellation-options" display={{ base: "none", md: "flex" }} gap={2} role="group" aria-label="Choose a constellation to explore">
          <Button className="sky-constellation-choice" aria-pressed={allConstellationsSelected} onClick={() => {
            onFocusedGroupChange(allConstellationsSelected ? NO_CONSTELLATION_SELECTION : null)
            setSelectedId(null)
          }}>
            All constellations
          </Button>
          {groups.map((group) => <Button key={group.id} className="sky-constellation-choice"
            style={{ "--group-color": groupColor(group.id) } as CSSProperties}
            aria-pressed={allConstellationsSelected || focusedGroup?.id === group.id}
            onClick={() => { onFocusedGroupChange(group.id); setSelectedId(null) }}>
            <Box as="span" className="sky-group-symbol"><FiStar aria-hidden="true" /></Box>
            {group.title}
          </Button>)}
        </Flex>
      </Box>}
      {!listContent && <Flex className="sky-canvas-tools" align="center" justify="space-between" gap={3}>
        {mode === "memories" && !crafting && <Box className="sky-map-key-tools">
          {mapKeyOpen && <Box as="aside" id="night-sky-map-key" className="sky-map-key-panel" aria-label="Night sky key">
            <Text className="sky-map-key-title">Map key</Text>
            <span><i className="sky-key-dot sky-key-dot--complete" />Complete</span>
            <span><i className="sky-key-dot sky-key-dot--progress" />In progress</span>
            <span><i className="sky-key-dot sky-key-dot--starter" />Starter</span>
            <span><i className="sky-connection-line sky-connection-line--saved" />Saved constellation</span>
          </Box>}
          <button type="button" className="sky-map-key-toggle" aria-expanded={mapKeyOpen}
            aria-controls="night-sky-map-key" onClick={() => setMapKeyOpen((open) => !open)}>
            <FiMap aria-hidden="true" /> Map key
          </button>
        </Box>}
        <Text className="sky-hint" role="status">{crafting ? "Select stars to choose them" : selectedUnfinished ? "Choose another star to explore more" : selected ? "Choose another star to read more" : "Select a star to explore its story"}</Text>
      </Flex>}
      <Flex className="personal-sky-body">
        <Box className="personal-sky-viewport" aria-label="Your personal night sky. Bright stars are complete memories, softer stars are in progress, and the starter begins a new memory. Drag to move and use the zoom controls to explore."
          style={compact ? { height: Math.max(600, 180 + Math.ceil(skyItems.length / (narrow ? 1 : 2)) * (narrow ? 175 : 135)) } : undefined}>
          <ReactFlow key={`${narrow ? "narrow" : compact ? "compact" : "wide"}-${focusedGroupId === NO_CONSTELLATION_SELECTION ? "none" : focusedGroup?.id ?? "all"}-${wideReader && (selected || selectedUnfinished || focusedGroup) && !crafting ? "inspecting" : "browsing"}`}
            nodes={nodes} edges={[...suggestedEdges, ...savedEdges, ...draftEdges]} nodeTypes={nodeTypes}
            onEdgeClick={(_event, edge) => setSelectedSuggestion((edge.data as { suggestion?: RelatedStorySuggestion } | undefined)?.suggestion ?? null)}
            fitView={!compact && skyItems.length <= 8} fitViewOptions={{ padding: .38, maxZoom: 1.1 }}
            defaultViewport={compact ? { x: narrow ? 30 : 12, y: 50, zoom: narrow ? .9 : .8 } : { x: 25, y: 45, zoom: .9 }} minZoom={.3} maxZoom={1.8}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            panOnDrag zoomOnPinch zoomOnScroll={false} zoomOnDoubleClick={false}
            preventScrolling={false} proOptions={{ hideAttribution: true }}>
            <Controls position={compact ? "top-left" : "bottom-right"} showInteractive={false} />
          </ReactFlow>
        </Box>
        {wideReader && memoryPanel}
        {wideReader && unfinishedPanel}
        {wideReader && groupPanel}
      </Flex>
      {!wideReader && (memoryPanel || unfinishedPanel || groupPanel)}
      </>}
    </Box>

    <Modal isOpen={!!selectedSuggestion} onClose={() => setSelectedSuggestion(null)} isCentered><ModalOverlay /><ModalContent borderRadius="26px" mx={4}>
      <ModalHeader>Why this path is suggested</ModalHeader><ModalCloseButton /><ModalBody>
        <Text color="#617773">{selectedSuggestion?.reason}</Text>
        <Text fontWeight="700" mt={4}>{selectedSuggestion?.story.title || "A remembered moment"}</Text>
      </ModalBody><ModalFooter gap={2}><Button variant="ghost" onClick={() => setSelectedSuggestion(null)}>Keep looking</Button>
        <Button variant="accent" onClick={() => {
          if (selectedSuggestion && suggestionSourceId) {
            setPicked((current) => [...new Set([...current, suggestionSourceId, selectedSuggestion.story.id])])
          }
          setSelectedSuggestion(null)
        }}>Add these memories</Button>
      </ModalFooter></ModalContent></Modal>
    <Modal isOpen={naming} onClose={() => setNaming(false)} isCentered><ModalOverlay /><ModalContent borderRadius="26px" mx={4}>
      <ModalHeader>Name your constellation</ModalHeader><ModalCloseButton /><ModalBody>
        <Text color="#617773" mb={3}>These {picked.length} memories will form a private constellation. We’ll draft a story from them for you to review and edit before saving.</Text>
        <Box className="sky-picked-list" mb={4}>{picked.map((id) => <Text key={id} noOfLines={1}>✦ {stories.find((story) => story.id === id)?.title || "A remembered moment"}</Text>)}</Box>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="A name for these connected moments" maxLength={120} autoFocus />
        {create.isError && <Text color="red.600" role="alert" mt={3}>We couldn’t save this constellation. Please try again.</Text>}
      </ModalBody><ModalFooter gap={2}><Button variant="ghost" onClick={() => setNaming(false)} isDisabled={create.isPending}>Back</Button>
        <Button className="sheet-primary" onClick={() => create.mutate()} isLoading={create.isPending}
          loadingText="Drafting your story" isDisabled={!name.trim()}>Create constellation</Button>
      </ModalFooter></ModalContent></Modal>
  </Stack>
}
