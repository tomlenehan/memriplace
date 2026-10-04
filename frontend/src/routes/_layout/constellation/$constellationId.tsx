import {
  Alert, AlertIcon, Box, Button, Container, Flex, Heading, HStack, IconButton,
  Image, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter,
  ModalHeader, ModalOverlay, Spinner, Text, Textarea, useMediaQuery,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiEdit3, FiGlobe, FiLock, FiTrash2, FiX } from "react-icons/fi"
import { PUBLIC_SKY_ENABLED } from "../../../config"
import SkyScene from "../../../components/MemoryMap/SkyScene"
import NarrationControl from "../../../components/Common/NarrationControl"
import { ReadingTextSizeControl, useReadingTextSize } from "../../../components/Common/ReadingTextSize"
import { nightSkyApi } from "../../../lib/nightSkyApi"

export const Route = createFileRoute("/_layout/constellation/$constellationId")({ component: ConstellationPage })

function ConstellationPage() {
  const { scale } = useReadingTextSize()
  const { constellationId } = Route.useParams()
  const id = Number(constellationId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ["constellation", id], queryFn: () => nightSkyApi.get(id), enabled: Number.isInteger(id) && id > 0 })
  const [selected, setSelected] = useState<number | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [storyCollapsed, setStoryCollapsed] = useState(false)
  const [editingStory, setEditingStory] = useState(false)
  const [title, setTitle] = useState("")
  const [overview, setOverview] = useState("")
  const [overviewSourceHash, setOverviewSourceHash] = useState<string | null>(null)
  const [isAiDraft, setIsAiDraft] = useState(false)
  const [draftError, setDraftError] = useState("")
  const [wideReader] = useMediaQuery("(min-width: 900px)")

  const deleteConstellation = useMutation({
    mutationFn: () => nightSkyApi.remove(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["constellation", id], exact: true })
      queryClient.removeQueries({ queryKey: ["constellationOverviewProposal", id], exact: true })
      queryClient.removeQueries({ queryKey: ["constellationOverviewProposalError", id], exact: true })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["constellations"] }),
        queryClient.invalidateQueries({ queryKey: ["publicSky"] }),
        queryClient.invalidateQueries({ queryKey: ["publicConstellation", id] }),
      ])
      setDeleteConfirmOpen(false)
      await navigate({ to: "/conversations", search: { mode: "constellations" } })
    },
  })

  useEffect(() => {
    if (!query.data || query.data.id !== id) return
    setTitle(query.data.title)
    const cachedProposal = !query.data.overview
      ? queryClient.getQueryData<{ overview: string; source_hash: string }>(["constellationOverviewProposal", id])
      : undefined
    const proposal = !query.data.overview
      ? query.data.proposal_text && query.data.proposal_source_hash
        ? { overview: query.data.proposal_text, source_hash: query.data.proposal_source_hash }
        : cachedProposal
      : undefined
    if (query.data.overview) {
      setOverview(query.data.overview)
      setOverviewSourceHash(query.data.source_hash)
      setIsAiDraft(false)
      setEditingStory(false)
      setDraftError("")
    } else if (proposal) {
      setOverview(proposal.overview)
      setOverviewSourceHash(proposal.source_hash)
      setIsAiDraft(true)
      setEditingStory(true)
      setStoryCollapsed(false)
    } else {
      setOverview("")
      setOverviewSourceHash(query.data.source_hash)
      setIsAiDraft(false)
      setEditingStory(false)
      setStoryCollapsed(false)
    }
    const proposalError = queryClient.getQueryData<string>(["constellationOverviewProposalError", id])
    if (proposalError) setDraftError(proposalError)
  }, [
    query.data?.id,
    query.data?.title,
    query.data?.overview,
    query.data?.source_hash,
    query.data?.proposal_text,
    query.data?.proposal_source_hash,
    queryClient,
    id,
  ])

  const proposeStory = useMutation({
    mutationFn: () => nightSkyApi.proposeOverview(id),
    onMutate: () => setDraftError(""),
    onSuccess: (proposal) => {
      queryClient.setQueryData(["constellationOverviewProposal", id], proposal)
      queryClient.removeQueries({ queryKey: ["constellationOverviewProposalError", id], exact: true })
      setOverview(proposal.overview)
      setOverviewSourceHash(proposal.source_hash)
      setIsAiDraft(true)
      setEditingStory(true)
    },
    onError: (error) => setDraftError(error instanceof Error ? error.message : "Couldn’t draft the constellation story."),
  })

  const saveStory = useMutation({
    mutationFn: () => nightSkyApi.update(id, {
      title: title.trim(),
      overview: overview.trim(),
      source_hash: overviewSourceHash ?? query.data?.source_hash ?? null,
      members: (query.data?.members ?? []).map(({ story_id, x, y, share_story, share_image }) => ({ story_id, x, y, share_story, share_image })),
      links: query.data?.links ?? [],
    }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["constellation", id], updated)
      queryClient.removeQueries({ queryKey: ["constellationOverviewProposal", id], exact: true })
      queryClient.removeQueries({ queryKey: ["constellationOverviewProposalError", id], exact: true })
      await queryClient.invalidateQueries({ queryKey: ["constellations"] })
      setOverviewSourceHash(updated.source_hash)
      setIsAiDraft(false)
      setDraftError("")
      setEditingStory(false)
    },
  })
  const makePrivate = useMutation({
    mutationFn: () => nightSkyApi.unpublish(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["constellation", id] }),
        queryClient.invalidateQueries({ queryKey: ["constellations"] }),
        queryClient.invalidateQueries({ queryKey: ["publicConstellation"] }),
      ])
    },
  })
  const makePublic = useMutation({
    mutationFn: async () => {
      // Use a non-identifying display name so making a constellation public
      // does not expose the account holder's profile name by default.
      const authorName = "A MemriPlace storyteller"
      const preview = await nightSkyApi.preview(id, authorName)
      if (!preview.preview_token) throw new Error("Couldn’t prepare this constellation for sharing.")
      return nightSkyApi.publish(id, authorName, preview.preview_token)
    },
    onSuccess: async () => {
      makePrivate.reset()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["constellation", id] }),
        queryClient.invalidateQueries({ queryKey: ["constellations"] }),
        queryClient.invalidateQueries({ queryKey: ["publicConstellation"] }),
      ])
    },
  })

  if (query.isLoading) return <Flex minH="55vh" align="center" justify="center"><Spinner size="xl" color="#4B8D82" /></Flex>
  if (query.isError || !query.data) return <Alert status="error" borderRadius="xl"><AlertIcon />Couldn’t open this constellation.</Alert>

  const constellation = query.data
  const member = selected == null ? null : constellation.members[selected]
  const cancelStoryEdit = () => {
    setTitle(constellation.title)
    setOverview(constellation.overview)
    setOverviewSourceHash(constellation.source_hash)
    setIsAiDraft(false)
    setEditingStory(false)
    saveStory.reset()
  }

  return <Container maxW="6xl" pb={16} px={{ base: 4, md: 8 }}>
    <Box pt={{ base: 5, md: 7 }}>
      <Button as={Link} to="/conversations" variant="ghost" leftIcon={<FiArrowLeft />} color="#286B69" fontWeight="800" _hover={{ bg: "#EDF5EF" }}>
        My night sky
      </Button>
    </Box>
    <Box textAlign="center" pt={{ base: 4, md: 5 }} pb={7}>
      <HStack justify="center" color="#6A8D70" fontSize="xs" fontWeight="800" letterSpacing=".12em">{constellation.publication_id != null ? <FiGlobe /> : <FiLock />} {constellation.publication_id != null ? "SHARED CONSTELLATION" : "YOUR PRIVATE CONSTELLATION"}</HStack>
      <Heading fontFamily={'"Iowan Old Style", Georgia, serif'} fontSize={{ base: "3xl", md: "5xl" }} mt={3}>{constellation.title}</Heading>
      <Text color="#61777A" mt={3}>{constellation.members.length} {constellation.members.length === 1 ? "star" : "stars"}</Text>
    </Box>

    <Box className="public-constellation-story" bg="white" border="1px solid #E2E9DB" borderRadius="24px" p={{ base: 5, md: 8 }}>
      <Flex align="center" justify="space-between" gap={3}>
        <Text fontSize="xs" color="#63816C" fontWeight="800" letterSpacing=".1em">
          {storyCollapsed ? "STORY · COLLAPSED" : "STORY"}
        </Text>
        <HStack spacing={1}>
          {!editingStory && constellation.overview && <Button size="sm" variant="ghost" leftIcon={<FiEdit3 />} onClick={() => { setEditingStory(true); saveStory.reset(); }}>
            Edit story
          </Button>}
          {!editingStory && constellation.overview && PUBLIC_SKY_ENABLED && <Button size="sm" variant="outline" leftIcon={constellation.publication_id != null ? <FiLock /> : <FiGlobe />}
            onClick={() => {
              makePrivate.reset()
              makePublic.reset()
              if (constellation.publication_id != null) makePrivate.mutate()
              else makePublic.mutate()
            }}
            isLoading={makePrivate.isPending || makePublic.isPending}>
            {constellation.publication_id != null ? "Make private" : "Make public"}
          </Button>}
          {!editingStory && <IconButton
            aria-label={storyCollapsed ? "Expand story" : "Collapse story to enlarge the sky"}
            icon={storyCollapsed ? <FiChevronDown /> : <FiChevronUp />}
            variant="ghost"
            size="sm"
            onClick={() => setStoryCollapsed((collapsed) => !collapsed)}
          />}
        </HStack>
      </Flex>
      {editingStory ? <Box mt={5}>
        <Text fontSize="sm" fontWeight="700" mb={2}>Constellation name</Text>
        <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-label="Constellation name" />
        <Flex align="center" justify="space-between" flexWrap="wrap" gap={2} mt={4} mb={2}>
          <Text fontSize="sm" fontWeight="700">Story</Text>
          <HStack>
            {!overview.trim() && <Button size="sm" variant="outline" onClick={() => proposeStory.mutate()}
              isLoading={proposeStory.isPending} loadingText="Drafting story">
              Draft with AI
            </Button>}
            <ReadingTextSizeControl />
          </HStack>
        </Flex>
        {isAiDraft && <Alert status="info" borderRadius="lg" mb={3}><AlertIcon />AI-drafted from these memories. Review and edit it for accuracy before saving.</Alert>}
        <Textarea value={overview} minH={{ base: "220px", md: "280px" }} maxLength={12000} lineHeight="1.8"
          style={{ fontSize: `calc(1rem * ${scale})` }}
          onChange={(event) => setOverview(event.target.value)} aria-label="Constellation story" />
        <HStack mt={4} flexWrap="wrap">
          <Button variant="primary" onClick={() => saveStory.mutate()} isLoading={saveStory.isPending} isDisabled={!title.trim() || !overview.trim()}>
            Save story
          </Button>
          <Button variant="ghost" onClick={cancelStoryEdit} isDisabled={saveStory.isPending}>Cancel</Button>
        </HStack>
        {saveStory.isError && <Text color="red.600" role="alert" mt={3}>{String(saveStory.error)}</Text>}
        {proposeStory.isError && <Text color="red.600" role="alert" mt={3}>{draftError}</Text>}
      </Box> : !storyCollapsed && constellation.overview ? <Box className="constellation-story-scroll" mt={4}>
        <NarrationControl path={`constellations/${id}`} displayText={constellation.overview}
          spokenTitle={constellation.title} showTextSizeControl />
      </Box> : !storyCollapsed && <Box mt={5}>
        <Heading size="md" fontFamily={'"Iowan Old Style", Georgia, serif'}>This constellation needs a story</Heading>
        <Text color="#61777A" mt={2}>Create a draft from the connected memories, then review and save it. You can also write your own.</Text>
        <HStack mt={4} flexWrap="wrap">
          <Button variant="primary" onClick={() => proposeStory.mutate()} isLoading={proposeStory.isPending} loadingText="Drafting story">
            Create a story draft
          </Button>
          <Button variant="ghost" leftIcon={<FiEdit3 />} onClick={() => { setEditingStory(true); setIsAiDraft(false); setDraftError("") }}>
            Write it myself
          </Button>
        </HStack>
        {draftError && <Text color="red.600" role="alert" mt={3}>{draftError}</Text>}
      </Box>}
      {makePrivate.isError && <Text color="red.600" role="alert" mt={3}>{String(makePrivate.error)}</Text>}
      {makePublic.isError && <Text color="red.600" role="alert" mt={3}>{String(makePublic.error)}</Text>}
      {makePrivate.isSuccess && <Text color="#39725C" role="status" mt={3}>This constellation is now private and no longer appears in the Global Night Sky.</Text>}
      {makePublic.isSuccess && <Text color="#39725C" role="status" mt={3}>This constellation is now public in the Global Night Sky.</Text>}
      <Box mt={6} pt={4} borderTop="1px solid #E2E9DB">
        <Button variant="outline" colorScheme="red" leftIcon={<FiTrash2 />} onClick={() => {
          deleteConstellation.reset()
          setDeleteConfirmOpen(true)
        }}>
          Delete constellation
        </Button>
      </Box>
    </Box>

    <Flex className="public-constellation-sky-row" direction={wideReader ? "row" : "column"} gap={0} mt={4} align="stretch">
      <Box className={member ? "public-sky-map public-sky-map--with-reader" : "public-sky-map"} flex="1" minW={0}>
        <SkyScene stars={constellation.members} links={constellation.links.map((link) => ({
          a: constellation.members.findIndex((item) => item.story_id === link.story_a_id),
          b: constellation.members.findIndex((item) => item.story_id === link.story_b_id),
        }))} selected={selected} onSelect={(index) => setSelected((current) => current === index ? null : index)} label={`Constellation: ${constellation.title}`} />
      </Box>
      {member && <Box as="aside" className="public-sky-memory-reader" aria-label="Selected memory" aria-live="polite">
        <Flex align="start" justify="space-between" gap={3}>
          <Heading className="sky-story-title" fontFamily={'"Iowan Old Style", Georgia, serif'} size="md">{member.title}</Heading>
          <IconButton aria-label="Close memory" icon={<FiX />} variant="ghost" size="sm" onClick={() => setSelected(null)} />
        </Flex>
        <Box mt={4}><NarrationControl path={`memories/${member.story_id}`} displayText={member.summary_text}
          spokenTitle={member.title || "A remembered moment"} showTextSizeControl displayTextClassName="sky-story-text" /></Box>
        {member.image_url && <Image src={member.image_url} alt={member.title} mt={4} borderRadius="lg" maxH="230px" objectFit="cover" />}
      </Box>}
    </Flex>
    <Modal isOpen={deleteConfirmOpen} onClose={() => { if (!deleteConstellation.isPending) setDeleteConfirmOpen(false) }} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="20px" mx={4}>
        <ModalHeader>Delete this constellation?</ModalHeader>
        <ModalCloseButton isDisabled={deleteConstellation.isPending} />
        <ModalBody>
          <Text><strong>{constellation.title}</strong> and its connections will be deleted. The individual memories will remain in My Night Sky.</Text>
          {constellation.publication_id != null && <Text color="#8D5B22" mt={3}>Its Global Night Sky page will also be removed.</Text>}
          <Alert status="warning" borderRadius="lg" mt={4}><AlertIcon />This can’t be undone.</Alert>
          {deleteConstellation.isError && <Text role="alert" color="red.600" mt={3}>{String(deleteConstellation.error)}</Text>}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} isDisabled={deleteConstellation.isPending}>Keep constellation</Button>
          <Button colorScheme="red" onClick={() => deleteConstellation.mutate()} isLoading={deleteConstellation.isPending} loadingText="Deleting">
            Delete constellation
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  </Container>
}
