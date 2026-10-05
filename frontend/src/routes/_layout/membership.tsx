import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  List,
  ListIcon,
  ListItem,
  SimpleGrid,
  Spinner,
  Text,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiArrowLeft, FiCheck, FiLock, FiStar } from "react-icons/fi"

import { nightSkyApi } from "../../lib/nightSkyApi"

export const Route = createFileRoute("/_layout/membership")({ component: MembershipPage })

function MembershipPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly")
  const membership = useQuery({ queryKey: ["membership"], queryFn: () => nightSkyApi.membership() })

  return <Container maxW="5xl" px={0}>
    <Button as={Link} to="/conversations" variant="ghost" leftIcon={<FiArrowLeft />} color="#286B69" fontWeight="800" mb={5}>
      My night sky
    </Button>
    <Box bg="linear-gradient(115deg, #173E4A, #205D5A)" border="1px solid #355B64" borderRadius="8px" boxShadow="0 12px 30px rgba(20, 53, 58, .14)" color="#FFF9EA" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
      <HStack color="#F5D785" fontSize="xs" fontWeight="900" letterSpacing=".12em"><FiStar /> YOUR MEMRIPLACE MEMBERSHIP</HStack>
      <Heading fontFamily={'"Iowan Old Style", Georgia, serif'} fontSize={{ base: "3xl", md: "4xl" }} mt={3}>
        Keep sharing the stories that connect us.
      </Heading>
      <Text color="#D0E2D9" fontSize={{ base: "md", md: "lg" }} mt={3} maxW="48rem">
        Your memories stay private unless you choose to share them. Membership plans are being prepared; your current sharing remains unrestricted.
      </Text>
    </Box>

    {membership.isPending ? <Flex justify="center" py={12}><Spinner color="#4B8D82" size="lg" /></Flex> : membership.isError ?
      <Alert status="error" mt={5} borderRadius="8px">
        <AlertIcon />
        <Text flex="1">We couldn’t load your membership.</Text>
        <Button size="sm" variant="link" onClick={() => void membership.refetch()}>Try again</Button>
      </Alert> : <>
        {!membership.data.enabled ? <Alert status="info" mt={5} borderRadius="8px">
          <AlertIcon />Memberships are a preview and can’t be purchased yet. You won’t be asked to upgrade, and current sharing is unrestricted.
        </Alert> : membership.data.is_paid ? <Alert status="success" mt={5} borderRadius="8px">
          <AlertIcon />MemriPlace Plus is active on your account.
          {membership.data.current_period_end && <Text ml={2}>Current period ends {new Date(membership.data.current_period_end).toLocaleDateString()}.</Text>}
        </Alert> : <Alert status="info" mt={5} borderRadius="8px">
          <AlertIcon />Free includes one memory with its story or photo shared publicly. Your private memories are unlimited.
        </Alert>}

        <Flex align={{ base: "stretch", sm: "center" }} justify="space-between" direction={{ base: "column", sm: "row" }} gap={4} mt={8} mb={4}>
          <Box>
            <Heading size="md" color="#17353B">Choose your plan</Heading>
            <Text color="#61777A" mt={1}>Keep your memories private. Share only what you choose.</Text>
          </Box>
          <HStack role="group" aria-label="Billing period" spacing={0} border="1px solid #C8D8CE" borderRadius="8px" p="3px" bg="#EEF4ED" alignSelf={{ base: "flex-start", sm: "auto" }}>
            {(["monthly", "yearly"] as const).map((period) => <Button key={period} size="sm" height="36px" aria-pressed={billingPeriod === period}
              onClick={() => setBillingPeriod(period)} variant="ghost" borderRadius="6px" color={billingPeriod === period ? "#17353B" : "#52716C"}
              bg={billingPeriod === period ? "#DDE5D9" : "transparent"} fontWeight="800" _hover={{ bg: "#DDE5D9" }}>
              {period === "yearly" ? "Yearly · save 30%" : "Monthly"}
            </Button>)}
          </HStack>
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Box border="1px solid #DDE5D9" borderRadius="8px" bg="#FFFEFA" p={{ base: 5, md: 6 }}>
            <Text color="#52716C" fontSize="xs" fontWeight="900" letterSpacing=".1em">FREE</Text>
            <Heading color="#17353B" mt={2} fontSize="3xl">$0</Heading>
            <Text color="#61777A" mt={1}>A quiet place to begin.</Text>
            <List spacing={3} mt={6} color="#315A54">
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />{membership.data.enabled ? "One memory story or photo shared publicly" : "Share memories publicly without a membership limit"}</ListItem>
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />Unlimited private memories and constellations</ListItem>
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />Choose what readers can see</ListItem>
            </List>
            <Button mt={7} w="full" variant="outline" borderColor="#9ABBB0" color="#315A54" isDisabled>
              {membership.data.is_paid ? "Free plan" : "Your current plan"}
            </Button>
          </Box>

          <Box border="2px solid #DDBB60" borderRadius="8px" bg="#FFF8E5" p={{ base: 5, md: 6 }} boxShadow="0 8px 20px rgba(97, 78, 32, .08)">
            <Flex align="center" justify="space-between" gap={2}>
              <Text color="#8A6729" fontSize="xs" fontWeight="900" letterSpacing=".1em">MEMRIPLACE PLUS</Text>
              <Text bg="#F5D785" color="#17353B" borderRadius="999px" px={3} py={1} fontSize="xs" fontWeight="900">MORE ROOM TO SHARE</Text>
            </Flex>
            <Heading color="#17353B" mt={2} fontSize="3xl">
              {billingPeriod === "yearly" ? "$24.99" : "$2.99"}
              <Text as="span" color="#61777A" fontFamily="body" fontSize="md" fontWeight="600"> / {billingPeriod === "yearly" ? "year" : "month"}</Text>
            </Heading>
            <Text color="#61777A" mt={1}>{billingPeriod === "yearly" ? "About $2.08 per month, billed yearly." : "Billed monthly. Cancel any time."}</Text>
            <List spacing={3} mt={6} color="#315A54">
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />Share as many full memory stories and photos as you like</ListItem>
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />Let more of your memories shine in the Global Night Sky</ListItem>
              <ListItem><ListIcon as={FiCheck} color="#4B8D82" />Your private memories remain yours</ListItem>
            </List>
            <Button mt={7} w="full" leftIcon={<FiLock />} variant="primary" isDisabled>
              {membership.data.is_paid ? "Plus is active" : membership.data.enabled ? "Subscriptions opening soon" : "Preview only"}
            </Button>
            <Text color="#7C6A45" fontSize="sm" mt={3} textAlign="center">
              {membership.data.enabled ? "Checkout is being set up. You won’t be charged from this page." : "Planned pricing only; there is no checkout or upgrade requirement."}
            </Text>
          </Box>
        </SimpleGrid>
      </>}
  </Container>
}
