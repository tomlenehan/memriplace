import {
  Box,
  Button,
  Link as ChakraLink,
  Container,
  HStack,
  Heading,
  Image,
  Stack,
  Text,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import memriPlaceLogo from "../../assets/images/MemriPlaceLighterLogo.png"
import { PUBLIC_SKY_ENABLED } from "../../config"

type LegalPageKind = "privacy" | "terms"

export default function LegalPage({ kind }: { kind: LegalPageKind }) {
  const isPrivacy = kind === "privacy"

  return (
    <Box bg="#FAFBF2" color="#24483E" minH="100vh" py={{ base: 8, md: 16 }}>
      <Container maxW="760px" px={{ base: 5, md: 8 }}>
        <HStack justify="space-between" mb={{ base: 10, md: 14 }}>
          <ChakraLink
            as={Link}
            aria-label="Return to MemriPlace home"
            to="/landing"
          >
            <Image
              alt="MemriPlace"
              h={{ base: "36px", md: "44px" }}
              objectFit="contain"
              src={memriPlaceLogo}
            />
          </ChakraLink>
          <Button as={Link} size="sm" to="/landing" variant="outline">
            Back home
          </Button>
        </HStack>

        <Box
          bg="#FFFDF7"
          border="1px solid"
          borderColor="#DDE5E1"
          borderRadius={{ base: "18px", md: "24px" }}
          boxShadow="0 12px 30px rgba(39, 62, 61, 0.06)"
          p={{ base: 6, md: 12 }}
        >
          <Text
            color="#2F7D7A"
            fontSize="sm"
            fontWeight="700"
            letterSpacing="0.14em"
            textTransform="uppercase"
          >
            MemriPlace
          </Text>
          <Heading
            color="#24483E"
            fontFamily="Georgia, serif"
            fontSize={{ base: "3xl", md: "5xl" }}
            mt={3}
          >
            {isPrivacy ? "Privacy policy" : "Terms of service"}
          </Heading>
          <Text color="#617569" mt={3}>
            Last updated September 29, 2026
          </Text>

          {isPrivacy ? (
            <Stack color="#526A70" lineHeight="1.8" mt={10} spacing={7}>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  What MemriPlace does
                </Heading>
                <Text>
                  MemriPlace helps you preserve personal stories through guided
                  text or voice conversations. We use your account information,
                  conversations, saved stories, and night-sky relationships to
                  provide the service to you.
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Your stories are private by default
                </Heading>
                <Text>
                  My memories, conversations, voice transcripts, and personal
                  night sky are private unless you choose to share them.{" "}
                  {PUBLIC_SKY_ENABLED
                    ? "You may explicitly publish a reviewed constellation to the Global Night Sky; only the story details and images you select are included."
                    : "MemriPlace does not currently publish your stories to the Global Night Sky."}
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  AI and voice conversations
                </Heading>
                <Text>
                  When you use AI or voice features, the content you provide is
                  sent to the service providers needed to transcribe,
                  understand, and respond to your conversation. Do not share
                  information you do not want processed by those providers.
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Your choices
                </Heading>
                <Text>
                  You can edit or delete your account and saved stories from
                  MemriPlace. You can also remove anything you have chosen to
                  publish. Questions about privacy can be sent to{" "}
                  <ChakraLink
                    color="#2F7D7A"
                    href="mailto:Lenehan3@gmail.com"
                    textDecoration="underline"
                  >
                    Lenehan3@gmail.com
                  </ChakraLink>
                  .
                </Text>
              </Box>
            </Stack>
          ) : (
            <Stack color="#526A70" lineHeight="1.8" mt={10} spacing={7}>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Using MemriPlace
                </Heading>
                <Text>
                  MemriPlace is designed to help you preserve and reflect on
                  personal memories. You are responsible for the content you
                  provide and for making sure you have the right to share any
                  story, image, or recording you publish.
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Your account
                </Heading>
                <Text>
                  Keep your sign-in information secure. You are responsible for
                  activity on your account. Do not use MemriPlace to impersonate
                  another person, harass anyone, or store unlawful content.
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Important limits
                </Heading>
                <Text>
                  AI responses are offered as conversational assistance and may
                  be incomplete or inaccurate. MemriPlace is not a substitute
                  for professional, legal, medical, or emergency support.
                </Text>
              </Box>
              <Box>
                <Heading
                  as="h2"
                  color="#24483E"
                  fontFamily="Georgia, serif"
                  fontSize="xl"
                  mb={2}
                >
                  Questions
                </Heading>
                <Text>
                  If you have questions about these terms, contact{" "}
                  <ChakraLink
                    color="#2F7D7A"
                    href="mailto:Lenehan3@gmail.com"
                    textDecoration="underline"
                  >
                    Lenehan3@gmail.com
                  </ChakraLink>
                  .
                </Text>
              </Box>
            </Stack>
          )}
        </Box>
      </Container>
    </Box>
  )
}
