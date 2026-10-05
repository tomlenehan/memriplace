import {
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  Icon,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  FiArrowDown,
  FiArrowRight,
  FiBookOpen,
  FiCheck,
  FiGlobe,
  FiLogIn,
  FiLock,
  FiMic,
  FiStar,
  FiSun,
} from "react-icons/fi"

import memriPlaceLogo from "../assets/images/MemriPlaceLighterLogo.png"
import background from "../assets/images/homepage_parallax_flat/background.png"
import foreground from "../assets/images/homepage_parallax_flat/foreground3.png"
import midground from "../assets/images/homepage_parallax_flat/midground.png"
import ConnectedStarsIcon from "../components/Common/ConnectedStarsIcon"
import starscape from "../assets/images/homepage_parallax_flat/starscape.png"
import sharedConstellationSky from "../assets/images/step3.webp"
import AuthModal from "../components/Auth/AuthModal"
import ConstellationStar from "../components/Common/ConstellationStar"
import HomepageVoiceSample from "../components/Landing/HomepageVoiceSample"
import NightSkyJourney from "../components/Landing/NightSkyJourney"
import { PUBLIC_SKY_ENABLED } from "../config"

export type AuthModalMode = "login" | "signup" | "recover"

export const Route = createFileRoute("/landing")({
  component: LandingRoute,
})

function LandingRoute() {
  return <LandingPage />
}

const storybookHeading = {
  fontFamily:
    '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
  fontWeight: 600,
  letterSpacing: 0,
}

const storySteps = [
  {
    icon: FiBookOpen,
    text: "Capture one moment by writing it down or talking it through.",
    title: "Start with a memory",
    color: "#FFF0BF",
  },
  {
    icon: FiMic,
    text: "Bring related memories together in a story or constellation in your personal Night Sky.",
    title: "Connect Memories to create a story",
    color: "#DDEDE1",
  },
  {
    icon: FiStar,
    text: PUBLIC_SKY_ENABLED
      ? "Preview a constellation, choose what others can read, then share it with the Global Night Sky."
      : "When sharing is available, you can preview a constellation, choose what others can read, and share it with the Global Night Sky.",
    title: "Choose what you want to share",
    color: "#E9DFF1",
  },
]

export function LandingPage({
  initialAuthMode = null,
}: {
  initialAuthMode?: AuthModalMode | null
} = {}) {
  const parallaxTrackRef = useRef<HTMLDivElement>(null)
  const storyStepsRef = useRef<HTMLDivElement>(null)
  const [footerModal, setFooterModal] = useState<"contact" | "legal" | null>(
    null,
  )
  const navigate = useNavigate()

  useEffect(() => {
    const track = parallaxTrackRef.current
    const scene = track?.querySelector<HTMLElement>("[data-parallax-scene]")
    if (!track || !scene) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const layers = Array.from(
      scene.querySelectorAll<HTMLElement>("[data-parallax-layer]"),
    )
    const copy = scene.querySelector<HTMLElement>("[data-parallax-copy]")
    let frame: number | null = null
    let current = 0
    let target = 0
    let lastTime = 0
    let sceneHeight = scene.offsetHeight
    let travel = 1

    const paint = (progress: number) => {
      const strength = window.innerWidth < 768 ? 0.6 : 1
      const depth = progress * strength
      // Push into the scene around the reader; near objects spread outward
      // while the horizon stays almost still. Scaling keeps every edge covered.
      const transforms: Record<string, [number, number, number]> = {
        background: [0, -sceneHeight * 0.012 * depth, 1.08 + 0.018 * depth],
        starscape: [
          -12 * depth,
          -sceneHeight * 0.075 * depth,
          1.06 + 0.08 * depth,
        ],
        midground: [
          -8 * depth,
          -sceneHeight * 0.025 * depth,
          1.08 + 0.075 * depth,
        ],
        foreground: [
          22 * depth,
          sceneHeight * 0.065 * depth,
          1.1 + 0.19 * depth,
        ],
      }
      for (const layer of layers) {
        const [x, y, scale] = transforms[layer.dataset.parallaxLayer ?? ""] ?? [
          0, 0, 1,
        ]
        layer.style.setProperty("--layer-x", `${x}px`)
        layer.style.setProperty("--layer-y", `${y}px`)
        layer.style.setProperty("--layer-scale", `${scale}`)
      }
      copy?.style.setProperty(
        "--copy-offset",
        `${-sceneHeight * 0.085 * depth}px`,
      )
      copy?.style.setProperty("--copy-opacity", `${1 - progress * 0.1}`)
    }

    const animate = (time: number) => {
      const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16
      lastTime = time
      current += (target - current) * (1 - Math.exp(-elapsed / 65))
      const settled = Math.abs(target - current) < 0.0001
      if (settled) current = target
      paint(current)
      frame = settled ? null : window.requestAnimationFrame(animate)
      if (settled) lastTime = 0
    }

    const scheduleUpdate = () => {
      const progress = Math.min(
        1,
        Math.max(0, -track.getBoundingClientRect().top / travel),
      )
      // A short ease-in avoids a sudden jump as the first scroll starts.
      target = reducedMotion.matches
        ? 0
        : (1.08 * progress * progress) / (progress + 0.08)
      if (reducedMotion.matches) {
        if (frame !== null) window.cancelAnimationFrame(frame)
        frame = null
        current = 0
        lastTime = 0
        paint(0)
      } else if (frame === null && Math.abs(target - current) >= 0.0001) {
        frame = window.requestAnimationFrame(animate)
      }
    }

    const measure = () => {
      sceneHeight = scene.offsetHeight
      travel = Math.max(track.offsetHeight - sceneHeight, 1)
      paint(current)
      scheduleUpdate()
    }

    measure()
    current = target
    paint(current)
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(track)
    resizeObserver.observe(scene)
    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", measure)
    reducedMotion.addEventListener("change", measure)

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", measure)
      reducedMotion.removeEventListener("change", measure)
    }
  }, [])

  useEffect(() => {
    const steps = storyStepsRef.current?.querySelectorAll<HTMLElement>(
      "[data-scroll-reveal]",
    )
    if (!steps?.length) return

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      for (const step of steps) step.dataset.revealed = "true"
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const step = entry.target as HTMLElement
          step.dataset.revealed = "true"
          observer.unobserve(step)
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    )

    steps.forEach((step, index) => {
      step.style.setProperty("--scroll-reveal-delay", `${index * 120}ms`)
      observer.observe(step)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <Box bg="#FAFBF2" color="#24483E" minH="100vh">
      <Box as="main">
        <Box
          ref={parallaxTrackRef}
          as="section"
          h={{ base: "112svh", md: "118svh" }}
          minH={{ base: "calc(600px + 12svh)", md: "calc(600px + 18svh)" }}
          position="relative"
          sx={{
            "@media (prefers-reduced-motion: reduce)": {
              height: "100svh",
              minHeight: "600px",
              "& [data-parallax-scene]": {
                position: "relative",
                top: "auto",
              },
            },
          }}
        >
          <Box
            data-parallax-scene="true"
            bg="#071F27"
            color="#FFF8E8"
            h="100svh"
            minH="600px"
            overflow="hidden"
            position="sticky"
            top={0}
          >
            <Image
              alt=""
              aria-hidden="true"
              data-parallax-layer="background"
              h="100%"
              maxW="none"
              objectFit="cover"
              position="absolute"
              src={background}
              top={0}
              transform="translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 0) scale(var(--layer-scale, 1.08))"
              transformOrigin="70% 70%"
              w="100%"
              zIndex={0}
            />
            <Image
              alt=""
              aria-hidden="true"
              data-parallax-layer="starscape"
              h="100%"
              inset={0}
              maxW="none"
              objectFit="cover"
              opacity={0.76}
              position="absolute"
              src={starscape}
              sx={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
              }}
              transform="translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 0) scale(var(--layer-scale, 1.06))"
              transformOrigin="70% 70%"
              w="100%"
              zIndex={1}
            />
            <Image
              alt=""
              aria-hidden="true"
              data-parallax-layer="midground"
              h="100%"
              inset={0}
              maxW="none"
              objectFit="cover"
              opacity={0.96}
              position="absolute"
              src={midground}
              sx={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
              }}
              transform="translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 0) scale(var(--layer-scale, 1.08))"
              transformOrigin="70% 75%"
              w="100%"
              zIndex={2}
            />

            <Box
              aria-hidden="true"
              bg="linear-gradient(90deg, rgba(3, 19, 24, 0.86) 0%, rgba(3, 19, 24, 0.58) 44%, rgba(3, 19, 24, 0.10) 78%, rgba(3, 19, 24, 0.02) 100%)"
              inset={0}
              position="absolute"
              zIndex={3}
            />

            <Flex
              align="center"
              justify="space-between"
              maxW="7xl"
              mx="auto"
              px={{ base: 5, md: 8 }}
              py={{ base: 5, md: 7 }}
              position="relative"
              zIndex={6}
            >
              <HStack
                as={Link}
                to="/landing"
                aria-label="MemriPlace home"
                spacing={{ base: 2, md: 3 }}
                flexShrink={0}
                borderRadius="full"
                color="#FFF8E8"
                textDecoration="none"
                transition="transform 180ms ease, color 180ms ease"
                _hover={{ color: "#F7D581", textDecoration: "none", transform: "translateY(-1px)" }}
                _focusVisible={{ outline: "3px solid #F7D581", outlineOffset: "4px" }}
              >
                <Image
                  alt=""
                  boxSize={{ base: "44px", md: "54px" }}
                  display="block"
                  objectFit="contain"
                  src={memriPlaceLogo}
                />
                <Text
                  fontSize={{ base: "md", md: "lg" }}
                  fontWeight="800"
                  letterSpacing="-.025em"
                  whiteSpace="nowrap"
                >
                  MemriPlace
                </Text>
              </HStack>
              <HStack spacing={{ base: 1, md: 3 }}>
                {PUBLIC_SKY_ENABLED && (
                  <Button
                    as={Link}
                    to="/night-sky"
                    leftIcon={<ConnectedStarsIcon />}
                    bg="rgba(9, 39, 50, 0.56)"
                    border="1px solid rgba(247, 213, 129, 0.62)"
                    boxShadow="0 2px 0 rgba(3, 19, 24, 0.34), inset 0 1px 0 rgba(255,255,255,0.12)"
                    color="#FFF3CF"
                    fontWeight="700"
                    size={{ base: "sm", md: "md" }}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: "#F7D581",
                      borderColor: "#FFE8A1",
                      boxShadow: "0 4px 0 rgba(3, 19, 24, 0.38), 0 8px 20px rgba(3, 19, 24, 0.22)",
                      color: "#163940",
                      transform: "translateY(-2px)",
                    }}
                    _active={{ transform: "translateY(1px)", boxShadow: "0 1px 0 rgba(3, 19, 24, 0.34)" }}
                    display={{ base: "none", md: "inline-flex" }}
                  >
                    Global Night Sky
                  </Button>
                )}
                <Button
                  as={Link}
                  leftIcon={<Icon as={FiLogIn} />}
                  bg="rgba(223, 241, 235, 0.14)"
                  border="1px solid rgba(211, 235, 225, 0.52)"
                  boxShadow="inset 0 1px 0 rgba(255,255,255,0.13)"
                  color="#FFF8E8"
                  fontWeight="700"
                  size={{ base: "sm", md: "md" }}
                  to="/login"
                  transition="all 0.18s ease"
                  _hover={{
                    bg: "#EAF3F1",
                    borderColor: "#FFF8E8",
                    boxShadow: "0 4px 0 rgba(3, 19, 24, 0.28), 0 8px 20px rgba(3, 19, 24, 0.18)",
                    color: "#1F5E5C",
                    transform: "translateY(-2px)",
                  }}
                  _active={{ transform: "translateY(1px)", boxShadow: "none" }}
                >
                  Log in
                </Button>
              </HStack>
            </Flex>

            <Flex
              align={{ base: "flex-start", md: "center" }}
              h="calc(100% - 84px)"
              mx="auto"
              pb={{ base: 8, md: 20 }}
              pt={{ base: 6, md: 10 }}
              px={{ base: 5, md: 8 }}
              position="relative"
              w="full"
              zIndex={4}
            >
              <Stack
                data-parallax-copy="true"
                maxW={{ base: "340px", sm: "420px", md: "760px" }}
                mx={{ base: 0, md: "max(5vw, calc((100vw - 1280px) / 2))" }}
                spacing={{ base: 4, md: 5 }}
                sx={{
                  opacity: "var(--copy-opacity, 1)",
                  transform: "translate3d(0, var(--copy-offset, 0px), 0)",
                  willChange: "transform, opacity",
                }}
              >
                <Text color="#F4D98D" fontSize="sm" fontWeight="bold">
                  Beta
                </Text>
                <Heading
                  as="h1"
                  color="#FFF8E8"
                  fontSize={{ base: "40px", sm: "54px", md: "72px" }}
                  lineHeight="1.04"
                  maxW="760px"
                  sx={storybookHeading}
                >
                  A lifetime of memories.<br />Your story in the stars.
                </Heading>
                <Text
                  color="rgba(255, 248, 232, 0.92)"
                  fontSize={{ base: "md", md: "xl" }}
                  lineHeight="1.65"
                  maxW="590px"
                >
                  Your AI-guided memory journal.
                  Capture the memories that matter, connect the ones that belong
                  together to build a night sky that’s uniquely yours.
                </Text>
                <HStack flexWrap="wrap" pt={2} spacing={3}>
                  <Button
                    as={Link}
                    rightIcon={<FiArrowRight />}
                    size="lg"
                    to="/signup"
                    variant="accent"
                  >
                    Start a memory
                  </Button>
                  <Button
                    as="a"
                    href="#how-it-works"
                    leftIcon={<FiArrowDown />}
                    size="lg"
                    variant="outline"
                    color="#FFF8E8"
                    borderColor="rgba(255, 248, 232, 0.65)"
                    bg="rgba(9, 39, 50, 0.42)"
                    _hover={{ bg: "rgba(255, 248, 232, 0.14)", borderColor: "#FFF8E8" }}
                  >
                    See how it works
                  </Button>
                </HStack>
              </Stack>
            </Flex>

            <Image
              alt=""
              aria-hidden="true"
              data-parallax-layer="foreground"
              h="100%"
              inset={0}
              maxW="none"
              objectFit="cover"
              objectPosition={{ base: "56% center", md: "center" }}
              pointerEvents="none"
              position="absolute"
              src={foreground}
              sx={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
              }}
              transform="translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 0) scale(var(--layer-scale, 1.1))"
              transformOrigin="72% 100%"
              w="100%"
              zIndex={5}
            />
          </Box>
        </Box>

        <Box
          id="how-it-works"
          bg="#FAFBF2"
          pb={{ base: 16, md: 24 }}
          pt={{ base: 10, md: 12 }}
          position="relative"
          scrollMarginTop="24px"
        >
          <Stack
            maxW="7xl"
            mx="auto"
            px={{ base: 5, md: 8 }}
            spacing={{ base: 10, md: 14 }}
          >
            <Flex
              align="center"
              direction={{ base: "column", lg: "row" }}
              gap={{ base: 8, lg: 10 }}
              justify="space-between"
            >
              <Stack flex="1" maxW="660px" minW={0} spacing={3} w="full">
                <Text color="#2E7A78" fontSize="sm" fontWeight="bold">
                  BIG STORIES START SMALL
                </Text>
                <Heading
                  as="h2"
                  fontSize={{ base: "38px", md: "58px" }}
                  lineHeight="1"
                  sx={storybookHeading}
                >
                  A familiar voice to help you find a spark.
                </Heading>
                <Text
                  color="#526A70"
                  fontSize={{ base: "md", md: "lg" }}
                  lineHeight="1.7"
                >
                  You don’t need to know where to begin. A friendly companion, a
                  gentle question, and a little curiosity are all it takes.
                </Text>
              </Stack>
              <HomepageVoiceSample />
            </Flex>

            <SimpleGrid
              columns={{ base: 1, md: 3 }}
              ref={storyStepsRef}
              spacing={{ base: 5, md: 6 }}
              sx={{
                "@media (prefers-reduced-motion: no-preference)": {
                  "& [data-scroll-reveal]": {
                    opacity: 0,
                    transform: "translate3d(0, 18px, 0)",
                    transition:
                      "opacity 650ms ease, transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: "var(--scroll-reveal-delay, 0ms)",
                  },
                  '& [data-scroll-reveal][data-revealed="true"]': {
                    opacity: 1,
                    transform: "translate3d(0, 0, 0)",
                  },
                },
              }}
            >
              {storySteps.map((step) => (
                <Stack
                  bg="white"
                  border="1px solid #E1E7D8"
                  borderRadius="26px"
                  boxShadow="0 5px 0 #E9EDDF"
                  data-revealed="false"
                  data-scroll-reveal="true"
                  key={step.title}
                  p={{ base: 6, md: 7 }}
                  spacing={4}
                >
                  <Flex align="center" color="#2E7A78" gap={3}>
                    <Flex
                      align="center"
                      bg={step.color}
                      boxSize="52px"
                      borderRadius="18px"
                      transform="rotate(-5deg)"
                      justify="center"
                    >
                      <Icon as={step.icon} boxSize={5} />
                    </Flex>
                  </Flex>
                  <Heading
                    as="h3"
                    fontSize={{ base: "28px", md: "32px" }}
                    lineHeight="1.05"
                    sx={storybookHeading}
                  >
                    {step.title}
                  </Heading>
                  <Text color="#526A70" lineHeight="1.7" maxW="330px">
                    {step.text}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          </Stack>
        </Box>

        <Box
          as="section"
          bg="#EEF3E5"
          py={{ base: 16, md: 24 }}
          borderY="1px solid #E1E8D6"
        >
          <NightSkyJourney publicSkyEnabled={PUBLIC_SKY_ENABLED} />
        </Box>

        <Box
          as="section"
          maxW="7xl"
          mx="auto"
          px={{ base: 5, md: 8 }}
          py={{ base: 16, md: 24 }}
        >
          <SimpleGrid
            columns={{ base: 1, lg: 2 }}
            gap={{ base: 10, md: 16 }}
            alignItems="center"
          >
            <Stack spacing={5}>
              <Text color="#9A6927" fontSize="sm" fontWeight="800">
                LITTLE MOMENTS LEAD TO MILESTONES.
              </Text>
              <Heading
                as="h2"
                fontSize={{ base: "38px", md: "54px" }}
                lineHeight="1.08"
                sx={storybookHeading}
              >
                Keep leveling up.
              </Heading>
              <Text color="#617569" fontSize="lg" lineHeight="1.8">
                Every new story earns you Experience Points (XP). As you level
                up, your constellations shine brighter in the Global Night Sky.
              </Text>
              <HStack spacing={3} align="start">
                <Icon as={FiSun} color="#A87930" mt={1} boxSize={5} />
                <Text color="#617569" lineHeight="1.8">
                  Save My Memories in consecutive days to build a streak. Or take
                  your time.
                </Text>
              </HStack>
            </Stack>
            <Box
              bg="linear-gradient(135deg, #FFF5D8, #F8EDD8 60%, #F0E8EF)"
              border="1px solid #EADDC1"
              borderRadius="30px"
              p={{ base: 5, md: 8 }}
              boxShadow="0 6px 0 #E9DFC9"
            >
              <HStack align="center" spacing={{ base: 2, md: 4 }} mb={5}>
                <ConstellationStar
                  w={{ base: "104px", md: "140px" }}
                  h={{ base: "104px", md: "140px" }}
                />
                <Box>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    color="#8A692E"
                    letterSpacing=".08em"
                  >
                    EVERY STORY COUNTS
                  </Text>
                  <Heading
                    as="h3"
                    fontSize={{ base: "2xl", md: "3xl" }}
                    mt={2}
                    sx={storybookHeading}
                  >
                    Look at you glow.
                  </Heading>
                </Box>
              </HStack>
              <Box
                bg="rgba(255,255,255,.9)"
                p={{ base: 4, md: 6 }}
                borderRadius="22px"
                border="1px solid #E8E3D4"
              >
                <Flex justify="space-between" align="center" gap={2} mb={4}>
                  <HStack spacing={2}>
                    <Icon as={FiStar} color="#A77727" />
                    <Text fontWeight="800" fontSize="sm">
                      Level 1 · Stargazer
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="#617569">
                    Example progress
                  </Text>
                </Flex>
                <HStack
                  gap={2}
                  aria-label="Example: three of four stories saved toward the next level"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <Flex
                      key={i}
                      flex="1"
                      align="center"
                      justify="center"
                      h="42px"
                      bg={i < 3 ? "#DDECDD" : "#F5F3EA"}
                      color="#52735E"
                      borderRadius="12px"
                      border={
                        i < 3 ? "1px solid #C5DBC8" : "1px dashed #C7CEBF"
                      }
                    >
                      {i < 3 ? <FiCheck /> : <FiStar />}
                    </Flex>
                  ))}
                </HStack>
                <Text fontSize="sm" mt={3} color="#617569">
                  75 / 100 XP · One more story to level 2
                </Text>
              </Box>
              <Flex justify="space-between" gap={2} mt={5} flexWrap="wrap">
                {["✧ Stargazer", "✦ Story explorer", "✶ Memory keeper"].map(
                  (label) => (
                    <Text
                      key={label}
                      fontSize="xs"
                      fontWeight="700"
                      color="#7E6849"
                      py={1}
                    >
                      {label}
                    </Text>
                  ),
                )}
              </Flex>
            </Box>
          </SimpleGrid>
        </Box>

        <Box
          as="section"
          maxW="7xl"
          mx="auto"
          px={{ base: 5, md: 8 }}
          pb={{ base: 16, md: 24 }}
        >
          <SimpleGrid
            columns={{ base: 1, md: 2 }}
            gap={{ base: 5, md: 6 }}
            alignItems="stretch"
          >
            <Flex
              bg="#EEEAF3"
              border="1px solid #E0D9E8"
              borderRadius="30px"
              p={{ base: 6, md: 8 }}
              direction="column"
              justify="space-between"
              minH={{ md: "380px" }}
            >
              <Flex
                aria-hidden="true"
                boxSize={{ base: "64px", md: "76px" }}
                flexShrink={0}
                bg="#FAF8FD"
                border="2px solid white"
                boxShadow="0 5px 0 #DDD4E7"
                borderRadius="24px"
                align="center"
                justify="center"
                transform="rotate(-5deg)"
              >
                <Icon as={FiLock} boxSize={{ base: 7, md: 8 }} color="#7E6D94" />
              </Flex>
              <Stack spacing={3} mt={{ base: 8, md: 10 }}>
                <Text color="#7E6D94" fontWeight="800" fontSize="sm">
                  PRIVATE BY DEFAULT
                </Text>
                <Heading
                  as="h2"
                  fontSize={{ base: "32px", md: "36px" }}
                  lineHeight="1.1"
                  sx={storybookHeading}
                >
                  Your Night Sky is yours.
                </Heading>
                <Text
                  color="#646071"
                  fontSize={{ base: "md", md: "lg" }}
                  lineHeight="1.8"
                >
                  My Memories start private. Nothing is
                  shared automatically.
                </Text>
              </Stack>
            </Flex>

            <Box
              position="relative"
              overflow="hidden"
              border="1px solid #1B3B49"
              borderRadius="30px"
              bg="#102E3A"
              color="#FFF8E8"
              minH={{ base: "420px", md: "380px" }}
              isolation="isolate"
            >
              <Image
                src={sharedConstellationSky}
                alt="One bright constellation among other stories in the Global Night Sky"
                position="absolute"
                inset={0}
                zIndex={-2}
                w="100%"
                h="100%"
                objectFit="cover"
                objectPosition="center"
              />
              <Box
                aria-hidden="true"
                position="absolute"
                inset={0}
                zIndex={-1}
                bgGradient="linear(to-b, rgba(8, 31, 40, 0.18) 0%, rgba(8, 31, 40, 0.2) 34%, rgba(8, 31, 40, 0.94) 100%)"
              />
              <Flex
                position="relative"
                minH={{ base: "420px", md: "380px" }}
                direction="column"
                justify="space-between"
                p={{ base: 6, md: 8 }}
              >
                <HStack
                  align="center"
                  alignSelf="start"
                  bg="rgba(8, 31, 40, 0.72)"
                  border="1px solid rgba(255, 248, 232, 0.38)"
                  borderRadius="full"
                  px={4}
                  py={2}
                  spacing={2}
                >
                  <Icon as={FiGlobe} aria-hidden="true" />
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.12em">
                    GLOBAL NIGHT SKY
                  </Text>
                </HStack>
                <Stack spacing={3} maxW="520px" mt={10}>
                  <Text color="#F4D98D" fontWeight="800" fontSize="sm">
                    {PUBLIC_SKY_ENABLED ? "SHARED BY CHOICE" : "COMING SOON"}
                  </Text>
                  <Heading
                    as="h3"
                    fontSize={{ base: "30px", md: "36px" }}
                    lineHeight="1.1"
                    sx={storybookHeading}
                  >
                    {PUBLIC_SKY_ENABLED
                      ? "Share your constellation with the Memri community."
                      : "Your sky stays private while sharing is on its way."}
                  </Heading>
                  <Text color="rgba(255, 248, 232, 0.9)" lineHeight="1.7">
                    {PUBLIC_SKY_ENABLED
                      ? "Preview it before publishing. Choose which stories and images readers can open. Your original conversations and voice transcripts stay private."
                      : "When public sharing is available, you’ll be able to preview a constellation and choose which stories and images readers can open."}
                  </Text>
                </Stack>
              </Flex>
            </Box>
          </SimpleGrid>
        </Box>

        <Box
          as="section"
          bg="#24483E"
          color="#FFF8E8"
          py={{ base: 16, md: 20 }}
          position="relative"
          overflow="hidden"
          textAlign="center"
        >
          <Box
            aria-hidden="true"
            position="absolute"
            inset={0}
            opacity={0.15}
            bgImage="radial-gradient(#F4D58A 1px, transparent 1px)"
            bgSize="38px 38px"
          />
          <Stack
            maxW="750px"
            mx="auto"
            px={{ base: 5, md: 8 }}
            spacing={5}
            align="center"
            position="relative"
          >
            <Icon as={FiStar} boxSize={8} color="#F4D58A" />
            <Heading
              as="h2"
              fontSize={{ base: "40px", md: "60px" }}
              lineHeight="1.05"
              sx={storybookHeading}
            >
              Start filling your
              <br />
              Night Sky with stories
              <br />
              that illuminate
            </Heading>
            <Text color="#D6E2D4" fontSize="lg" lineHeight="1.7">
              Let’s find the first spark.
            </Text>
            <Button
              as={Link}
              rightIcon={<FiArrowRight />}
              size="lg"
              to="/signup"
              variant="accent"
              mt={2}
            >
              Start a memory
            </Button>
            <HStack color="#D6E2D4" spacing={2} fontSize="sm">
              <Icon as={FiLock} />
              <Text>Private by default. Shared on your terms.</Text>
            </HStack>
          </Stack>
        </Box>
      </Box>

      <Flex
        align="center"
        bg="#1B3B32"
        color="rgba(255, 248, 232, 0.7)"
        direction={{ base: "column", sm: "row" }}
        gap={2}
        justify="space-between"
        px={{ base: 5, md: 8 }}
        py={5}
      >
        <Text fontSize="sm">MemriPlace. Stories worth keeping.</Text>
        <HStack spacing={{ base: 4, md: 5 }} flexWrap="wrap" justify="center">
          {PUBLIC_SKY_ENABLED && (
            <Button
              as={Link}
              to="/night-sky"
              color="inherit"
              fontSize="sm"
              fontWeight="500"
              minW="auto"
              p={0}
              variant="link"
              textDecoration="underline"
              textUnderlineOffset="3px"
            >
              Global Night Sky
            </Button>
          )}
          <Button
            color="inherit"
            fontSize="sm"
            fontWeight="500"
            minW="auto"
            onClick={() => setFooterModal("contact")}
            p={0}
            textDecoration="underline"
            textUnderlineOffset="3px"
            variant="link"
          >
            Contact us
          </Button>
          <Button
            as={Link}
            color="inherit"
            fontSize="sm"
            fontWeight="500"
            minW="auto"
            p={0}
            textDecoration="underline"
            textUnderlineOffset="3px"
            to="/privacy"
            variant="link"
          >
            Privacy
          </Button>
          <Button
            as={Link}
            color="inherit"
            fontSize="sm"
            fontWeight="500"
            minW="auto"
            p={0}
            textDecoration="underline"
            textUnderlineOffset="3px"
            to="/terms"
            variant="link"
          >
            Terms
          </Button>
          <Text fontSize="sm">© {new Date().getFullYear()}</Text>
        </HStack>
      </Flex>
      <Modal
        isCentered
        isOpen={footerModal === "contact"}
        onClose={() => setFooterModal(null)}
      >
        <ModalOverlay bg="rgba(3, 19, 24, 0.72)" backdropFilter="blur(8px)" />
        <ModalContent bg="#FFFDF7" borderRadius="24px" mx={4}>
          <ModalHeader color="#24483E" fontFamily="Georgia, serif" pt={7}>
            Contact us
          </ModalHeader>
          <ModalCloseButton color="#526A70" top={5} />
          <ModalBody color="#526A70" lineHeight="1.75" pb={7}>
            <Text>
              Questions, ideas, or a story about how MemriPlace is working for
              you? We’d love to hear from you.
            </Text>
            <Button
              as="a"
              colorScheme="teal"
              href="mailto:Lenehan3@gmail.com"
              mt={5}
              variant="outline"
            >
              Lenehan3@gmail.com
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal
        isCentered
        isOpen={footerModal === "legal"}
        onClose={() => setFooterModal(null)}
        size={{ base: "sm", md: "lg" }}
      >
        <ModalOverlay bg="rgba(3, 19, 24, 0.72)" backdropFilter="blur(8px)" />
        <ModalContent bg="#FFFDF7" borderRadius="24px" mx={4}>
          <ModalHeader color="#24483E" fontFamily="Georgia, serif" pt={7}>
            Privacy & terms
          </ModalHeader>
          <ModalCloseButton color="#526A70" top={5} />
          <ModalBody color="#526A70" lineHeight="1.75" pb={7}>
            <Stack spacing={5}>
              <Box>
                <Heading
                  as="h3"
                  color="#24483E"
                  fontSize="lg"
                  mb={2}
                  sx={storybookHeading}
                >
                  Your privacy
                </Heading>
                <Text>
                  {PUBLIC_SKY_ENABLED ? (
                    <>
                      Your stories and personal night sky are private by
                      default. You may share an individual story or explicitly
                      publish a reviewed constellation to the Global Night Sky.
                      Only its overview and the story texts and images you
                      select are included. Original conversations and voice
                      transcripts remain private. You can remove a published
                      constellation at any time.
                    </>
                  ) : (
                    <>
                      Your stories are private by default and are not shown in a
                      Global Night Sky. You choose whether to share an
                      individual story. We use your account and story
                      information to provide MemriPlace and keep your night sky
                      available to you.
                    </>
                  )}
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h3"
                  color="#24483E"
                  fontSize="lg"
                  mb={2}
                  sx={storybookHeading}
                >
                  Terms of use
                </Heading>
                <Text>
                  Please use MemriPlace responsibly and only share stories you
                  have the right to share. The service is designed to help you
                  preserve memories; it does not replace professional, legal,
                  medical, or emergency support.
                </Text>
              </Box>
              <Text fontSize="sm">
                Questions about privacy or these terms? Email{" "}
                <Button
                  as="a"
                  color="#2E7A78"
                  fontSize="inherit"
                  fontWeight="600"
                  href="mailto:Lenehan3@gmail.com"
                  minW="auto"
                  p={0}
                  textDecoration="underline"
                  textUnderlineOffset="3px"
                  variant="link"
                >
                  Lenehan3@gmail.com
                </Button>
                .
              </Text>
            </Stack>
          </ModalBody>
        </ModalContent>
      </Modal>
      {initialAuthMode && (
        <AuthModal
          isOpen
          mode={initialAuthMode}
          onClose={() => navigate({ to: "/landing" })}
        />
      )}
    </Box>
  )
}

export default LandingPage
