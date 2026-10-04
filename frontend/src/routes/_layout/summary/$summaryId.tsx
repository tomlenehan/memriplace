import {
  Box,
  Alert,
  AlertIcon,
  Badge,
  Container,
  Flex,
  Heading,
  Button,
  Icon,
  Text,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Image,
  SimpleGrid,
  VStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { IoChevronBackCircleOutline } from "react-icons/io5"
import { useEffect, useState } from "react"
import { FaRegSave } from "react-icons/fa"
import { useForm, SubmitHandler } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDropzone } from "react-dropzone"
import {
  SummariesService,
  Body_summaries_update_story_summary,
  type StorySummaryPublic,
} from "../../../client"
import { FiCheck, FiGitBranch, FiImage, FiLink, FiShare2, FiTrash2 } from "react-icons/fi"
import ConstellationStar from "../../../components/Common/ConstellationStar"
import NarrationControl from "../../../components/Common/NarrationControl"
import useCustomToast from "../../../hooks/useCustomToast"
import { API_BASE_URL } from "../../../config"
import { ReadingTextSizeControl, useReadingTextSize } from "../../../components/Common/ReadingTextSize"
import { nightSkyApi } from "../../../lib/nightSkyApi"

export const Route = createFileRoute("/_layout/summary/$summaryId")({
  component: SummaryPage,
})

type Status = "idle" | "loading" | "succeeded" | "failed"

interface SummaryFormInputs {
  title: string
  summary: string
  image_url?: string
}

interface GeneratedImageOption {
  id: string
  file: File
  previewUrl: string
}

function SummaryPage() {
  const { scale } = useReadingTextSize()
  const { summaryId } = Route.useParams<{ summaryId: string }>() // Correct type for summaryId
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SummaryFormInputs>()
  const [status, setStatus] = useState<Status>("idle")
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [newImageUploaded, setNewImageUploaded] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [pendingImageUrl, setPendingImageUrl] = useState<string | undefined>()
  const [generatedImageFile, setGeneratedImageFile] = useState<File | undefined>()
  const [generatedImageOptions, setGeneratedImageOptions] = useState<GeneratedImageOption[]>([])
  const [selectedGeneratedImageId, setSelectedGeneratedImageId] = useState<string | undefined>()
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [conversationId, setConversationId] = useState<number | undefined>(undefined)
  const [currentStory, setCurrentStory] = useState<StorySummaryPublic | undefined>()
  const [shareFeedback, setShareFeedback] = useState("")
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const showToast = useCustomToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const memoryConstellationsQuery = useQuery({
    queryKey: ["memoryConstellations", Number(summaryId)],
    queryFn: () => nightSkyApi.memoryConstellations(Number(summaryId)),
    enabled: Boolean(currentStory),
  })
  const deleteMemory = useMutation({
    mutationFn: () => SummariesService.deleteStorySummary({ id: Number(summaryId) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summaries"] }),
        queryClient.invalidateQueries({ queryKey: ["constellations"] }),
        queryClient.invalidateQueries({ queryKey: ["storyRelationships"] }),
        queryClient.invalidateQueries({ queryKey: ["memoryConstellations"] }),
      ])
      setDeleteConfirmOpen(false)
      showToast("Memory deleted", "The memory and its associated constellations were deleted.", "success")
      await navigate({ to: "/conversations" })
    },
    onError: (error) => showToast("Couldn’t delete memory", `${error}`, "error"),
  })

  const { getRootProps, getInputProps, acceptedFiles } = useDropzone({
    accept: { "image/*": [".jpeg", ".jpg", ".png"] },
    onDrop: () => {
      setNewImageUploaded(true)
      setGeneratedImageFile(undefined)
      setGeneratedImageOptions([])
      setSelectedGeneratedImageId(undefined)
    },
  })

  useEffect(() => {
    const file = acceptedFiles[0]
    if (!file) {
      setPendingImageUrl(undefined)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPendingImageUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [acceptedFiles])

  const displayedImageUrl = newImageUploaded ? pendingImageUrl : imageUrl

  useEffect(() => {
    setImageLoadFailed(false)
  }, [displayedImageUrl])

  const fetchSummary = async (summaryId: string) => {
    setStatus("loading")
    try {
      const token = localStorage.getItem("access_token")
      if (!token) {
        throw new Error("No access token found")
      }

      const response = await SummariesService.readStorySummary({
        id: Number(summaryId),
      })

      setValue("summary", response.summary_text || "")
      setValue("title", response.title || "")
      setImageUrl(response.image_url || undefined)
      setConversationId(response.conversation_id)
      setCurrentStory(response)
      setStatus("succeeded")
      console.log("Initial image URL:", response.image_url)
    } catch (error) {
      console.error(error)
      setStatus("failed")
    }
  }

  useEffect(() => {
    if (summaryId) {
      fetchSummary(summaryId)
    }
  }, [summaryId, setValue])

  const onSubmit: SubmitHandler<SummaryFormInputs> = async (data) => {
    setIsSaving(true)
    try {
      const formData: Body_summaries_update_story_summary = {
        title: data.title,
        summary_text: data.summary,
        image: generatedImageFile ?? acceptedFiles[0] ?? null,
      }

      const response = await SummariesService.updateStorySummary({
        id: Number(summaryId),
        formData,
      })
      await queryClient.invalidateQueries({ queryKey: ["summaries"] })

      showToast("Success!", "Summary updated successfully.", "success")
      setStatus("succeeded")

      setImageUrl(response.image_url || undefined)
      setCurrentStory(response)
      setNewImageUploaded(false)
      setGeneratedImageFile(undefined)
      setGeneratedImageOptions([])
      setSelectedGeneratedImageId(undefined)
      await navigate({ to: "/conversations" })
    } catch (error) {
      console.error(error)
      setIsSaving(false)
      showToast("Something went wrong.", `${error}`, "error")
      setStatus("failed")
    } finally {
      setIsSaving(false)
    }
  }

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true)
    try {
      const token = localStorage.getItem("access_token")
      if (!token) throw new Error("Please sign in again before creating an image.")

      const response = await fetch(`${API_BASE_URL}/api/v1/summaries/${summaryId}/generate-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: watch("title"),
          summary_text: watch("summary"),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || "Could not create an image.")

      const binary = atob(result.image_base64)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const mimeType = result.mime_type || "image/png"
      const imageCount = generatedImageOptions.length + 1
      const generatedImage: GeneratedImageOption = {
        id: `generated-${imageCount}`,
        file: new File([bytes], `memriplace-story-${imageCount}.png`, { type: mimeType }),
        previewUrl: `data:${mimeType};base64,${result.image_base64}`,
      }
      setGeneratedImageOptions((current) => [...current, generatedImage])
      setSelectedGeneratedImageId(generatedImage.id)
      setGeneratedImageFile(generatedImage.file)
      setPendingImageUrl(generatedImage.previewUrl)
      setNewImageUploaded(true)
      setImageLoadFailed(false)
      showToast(
        imageCount === 1 ? "Your story art is ready" : "Two illustrations are ready",
        imageCount === 1
          ? "You can generate one alternative before choosing your favorite."
          : "Choose the illustration you want to save with this memory.",
        "success",
      )
    } catch (error) {
      console.error(error)
      showToast("Image could not be created", `${error}`, "error")
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const selectGeneratedImage = (image: GeneratedImageOption) => {
    setSelectedGeneratedImageId(image.id)
    setGeneratedImageFile(image.file)
    setPendingImageUrl(image.previewUrl)
    setNewImageUploaded(true)
    setImageLoadFailed(false)
  }

  const copyLink = async () => {
    try {
      const url = window.location.href
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const field = document.createElement("textarea")
        field.value = url
        field.style.position = "fixed"
        field.style.opacity = "0"
        document.body.appendChild(field)
        field.select()
        const copied = document.execCommand("copy")
        document.body.removeChild(field)
        if (!copied) throw new Error("Clipboard unavailable")
      }
      setShareFeedback("Link copied. Share this memory with someone you care about.")
    } catch {
      setShareFeedback("Couldn’t copy the link. You can copy it from your browser’s address bar.")
    }
  }

  const shareMemory = async () => {
    setShareFeedback("")
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: watch("title") || "A memory from MemriPlace",
        text: "A memory from MemriPlace",
        url: window.location.href,
      })
      setShareFeedback("Thanks for sharing this memory.")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      await copyLink()
    }
  }

  if (!summaryId) {
    return <Box>Error: No summary ID provided</Box>
  }

  return (
    <Container maxW="5xl" minH="100vh" px={{ base: 0, md: 4 }} display="flex" flexDirection="column">
      <Flex justifyContent="space-between" alignItems="center" pt={8} gap={3}>
        <Button as={Link} to="/conversations" variant="outline">
          <Box as={IoChevronBackCircleOutline} size="20px" mr={2} />
          Your memories
        </Button>
        {conversationId && (
          <Button as={Link} to="/conversation/$conversationId" params={{ conversationId: String(conversationId) }} variant="ghost" rightIcon={<FiGitBranch />}>
            Revisit conversation
          </Button>
        )}
      </Flex>

      <Flex mt={6} p={{ base: 4, md: 6 }} bg="#F0F5E7" border="1px solid #DFE7D5" borderRadius="24px" align="center" gap={3}>
        <ConstellationStar boxSize={{ base: "80px", md: "112px" }} />
        <Box>
          <Text fontSize="xs" color="#63816C" fontWeight="800" letterSpacing=".1em">
            A LITTLE LIGHT, KEPT FOREVER
          </Text>
          <Heading size="lg" mt={1}>
            One more piece of your story.
          </Heading>
          <Text color="ui.muted" mt={2} fontSize="sm">
            Make it sound like you, add a photo, or connect it to another memory.
          </Text>
          {currentStory && watch("summary") === currentStory.summary_text && watch("title") === currentStory.title &&
            <Box mt={4}><NarrationControl path={`memories/${currentStory.id}`} /></Box>}
          {currentStory && (watch("summary") !== currentStory.summary_text || watch("title") !== currentStory.title) &&
            <Text fontSize="sm" color="ui.muted" mt={3}>Save your changes to hear this version.</Text>}
        </Box>
      </Flex>
      <Flex flex="1" direction="column" mt={4} bg="white" borderRadius="24px" border="1px solid #E5E8DC">
        <Box flex="1" overflowY="auto" p={4}>
          {status === "loading" ? (
            <Text>Loading summary...</Text>
          ) : status === "failed" ? (
            <Text>Error loading summary</Text>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)}>
                <FormControl isInvalid={!!errors.title}>
                  <FormLabel>Title</FormLabel>
                  <Input type="text" placeholder={"Enter a meaningful title for your memory here"} {...register("title", { required: "Title is required" })} />
                  {errors.title && <Text color="red.500">{errors.title.message}</Text>}
                </FormControl>
                <FormControl mt={4} isInvalid={!!errors.summary}>
                  <Flex align="center" justify="space-between" flexWrap="wrap" gap={2} mb={2}>
                    <FormLabel mb={0}>Your memory</FormLabel>
                    <ReadingTextSizeControl />
                  </Flex>
                  <Textarea
                    minHeight={280}
                    bg="#FFFEF9"
                    lineHeight="1.8"
                    style={{ fontSize: `calc(1rem * ${scale})` }}
                    {...register("summary", {
                      required: "Summary is required",
                    })}
                  />
                  {errors.summary && <Text color="red.500">{errors.summary.message}</Text>}
                </FormControl>
                <FormControl mt={4}>
                  <FormLabel htmlFor="image">Upload Image</FormLabel>
                  <Box
                    {...getRootProps()}
                    border="2px dashed"
                    borderColor="gray.300"
                    borderRadius="md"
                    p={4}
                    w="full"
                    maxW="400px"
                    textAlign="left"
                    cursor="pointer"
                  >
                    <input {...getInputProps()} />
                    <Text>Drag 'n' drop an image here, or click to select one</Text>
                  </Box>
                  <Button
                    type="button"
                    mt={3}
                    leftIcon={<Icon as={FiImage} />}
                    variant="outline"
                    onClick={handleGenerateImage}
                    isLoading={isGeneratingImage}
                    isDisabled={
                      !watch("summary")?.trim() ||
                      isSaving ||
                      generatedImageOptions.length >= 2
                    }
                  >
                    {generatedImageOptions.length === 0
                      ? "Create story illustration"
                      : generatedImageOptions.length === 1
                        ? "Generate one alternative"
                        : "Two illustrations ready"}
                  </Button>
                  <Text fontSize="xs" color="ui.muted" mt={1}>
                    Optional · sends this summary to OpenAI · up to two images at about $0.006 each
                  </Text>
                  <VStack mt={3} align="stretch" maxW="400px">
                    {generatedImageOptions.length === 2 ? (
                      <>
                        <Text fontSize="sm" color="ui.ink" fontWeight="700">
                          Choose the illustration to save
                        </Text>
                        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                          {generatedImageOptions.map((image, index) => {
                            const isSelected = selectedGeneratedImageId === image.id
                            return (
                              <Box
                                as="button"
                                type="button"
                                key={image.id}
                                onClick={() => selectGeneratedImage(image)}
                                textAlign="left"
                                position="relative"
                                overflow="hidden"
                                borderRadius="18px"
                                border="2px solid"
                                borderColor={isSelected ? "ui.main" : "#DFE7D5"}
                                boxShadow={isSelected ? "0 0 0 3px #EAF3F1" : "none"}
                                _hover={{ borderColor: "ui.main" }}
                                _focusVisible={{ outline: "3px solid", outlineColor: "#F6D986", outlineOffset: "3px" }}
                              >
                                <Image
                                  src={image.previewUrl}
                                  alt={`Generated story illustration ${index + 1}`}
                                  w="full"
                                  h="156px"
                                  objectFit="cover"
                                />
                                <Flex align="center" justify="space-between" px={3} py={2} bg="#FFFEF9">
                                  <Text fontSize="sm" fontWeight="700" color="ui.ink">
                                    Illustration {index + 1}
                                  </Text>
                                  {isSelected && <Icon as={FiCheck} color="ui.main" boxSize={5} />}
                                </Flex>
                              </Box>
                            )
                          })}
                        </SimpleGrid>
                        <Text fontSize="xs" color="ui.muted">
                          Your selected illustration will be saved with this memory.
                        </Text>
                      </>
                    ) : displayedImageUrl && !imageLoadFailed ? (
                      <Image
                        src={displayedImageUrl}
                        alt={newImageUploaded ? "Selected image preview" : "Current memory"}
                        w="full"
                        maxH="240px"
                        objectFit="cover"
                        borderRadius="18px"
                        border="1px solid #DFE7D5"
                        onError={() => setImageLoadFailed(true)}
                      />
                    ) : (
                      <Flex align="center" gap={3} p={4} bg="#F6F7EF" border="1px solid #E2E7D8" borderRadius="18px" color="ui.muted">
                        <Flex align="center" justify="center" boxSize="42px" flexShrink={0} bg="white" borderRadius="14px">
                          <Icon as={FiImage} boxSize={5} />
                        </Flex>
                        <Box>
                          <Text color="ui.ink" fontWeight="700" fontSize="sm">
                            {imageLoadFailed ? "This photo couldn’t be loaded" : "No photo added yet"}
                          </Text>
                          <Text fontSize="xs" mt={1}>
                            {imageLoadFailed ? "Choose another image to replace it." : "Add one if it helps bring this memory to life."}
                          </Text>
                        </Box>
                      </Flex>
                    )}
                    {acceptedFiles.length > 0 &&
                      newImageUploaded &&
                      !generatedImageFile &&
                      acceptedFiles.map((file) => (
                        <Text color="green" key={file.name}>
                          {file.name}
                        </Text>
                      ))}
                    {generatedImageOptions.length === 1 && (
                      <Text fontSize="xs" color="ui.muted">
                        Like this illustration? Save it now, or generate one alternative to compare.
                      </Text>
                    )}
                  </VStack>
                </FormControl>
                <Button mt={4} rightIcon={<FaRegSave />} variant="primary" type="submit" isLoading={isSaving}>
                  Save
                </Button>
                <Button mt={4} marginLeft={2} rightIcon={<FiShare2 />} variant="accent" type="button" onClick={shareMemory}>
                  Share
                </Button>
                <Button mt={4} marginLeft={2} rightIcon={<FiLink />} variant="ghost" type="button" onClick={copyLink}>
                  Copy link
                </Button>
                {shareFeedback && <Text role="status" fontSize="sm" color="ui.muted" mt={3}>{shareFeedback}</Text>}
                <Box mt={7} pt={4} borderTop="1px solid #E5E8DC">
                  <Button type="button" variant="outline" colorScheme="red" leftIcon={<Icon as={FiTrash2} />}
                    onClick={() => {
                      setDeleteConfirmOpen(true)
                      void memoryConstellationsQuery.refetch()
                    }}>
                    Delete memory
                  </Button>
                </Box>
              </form>
            </>
          )}
        </Box>
      </Flex>
      <Modal isOpen={deleteConfirmOpen} onClose={() => { if (!deleteMemory.isPending) setDeleteConfirmOpen(false) }} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="20px" mx={4}>
          <ModalHeader>Delete this memory?</ModalHeader>
          <ModalCloseButton isDisabled={deleteMemory.isPending} />
          <ModalBody>
            <Text>
              “{watch("title") || currentStory?.title || "This memory"}” will be permanently deleted.
            </Text>
            {memoryConstellationsQuery.isPending ? <Text color="ui.muted" mt={4}>Checking which constellations include this memory…</Text>
              : memoryConstellationsQuery.isError ? <Box mt={4}>
                <Text color="red.600">We couldn’t check which constellations would be affected. Please try again before deleting.</Text>
                <Button size="sm" mt={2} variant="outline" onClick={() => void memoryConstellationsQuery.refetch()}>Retry</Button>
              </Box>
                : memoryConstellationsQuery.data?.length ? <Box mt={4}>
                  <Text fontWeight="750">These constellations will also be deleted:</Text>
                  <VStack align="stretch" spacing={2} mt={2}>
                    {memoryConstellationsQuery.data.map((constellation) => <Flex key={constellation.id} align="center" justify="space-between" gap={3}>
                      <Text>{constellation.title}</Text>
                      {constellation.is_public && <Badge colorScheme="orange" flexShrink={0}>Public share</Badge>}
                    </Flex>)}
                  </VStack>
                  <Text color="ui.muted" fontSize="sm" mt={3}>
                    Their constellation stories and public pages will be removed. The other memories will remain in your night sky.
                  </Text>
                </Box> : <Text color="ui.muted" mt={4}>This memory isn’t part of any constellation.</Text>}
            <Alert status="warning" borderRadius="lg" mt={4}>
              <AlertIcon />This action can’t be undone.
            </Alert>
            {deleteMemory.isError && <Text role="alert" color="red.600" mt={3}>{String(deleteMemory.error)}</Text>}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} isDisabled={deleteMemory.isPending}>Keep memory</Button>
            <Button colorScheme="red" onClick={() => deleteMemory.mutate()} isLoading={deleteMemory.isPending}
              loadingText="Deleting" isDisabled={!memoryConstellationsQuery.isSuccess || memoryConstellationsQuery.isFetching}>
              {memoryConstellationsQuery.data?.length ? "Delete memory and constellations" : "Delete memory"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  )
}

export default SummaryPage
