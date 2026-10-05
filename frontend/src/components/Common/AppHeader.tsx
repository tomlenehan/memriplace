import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  Icon,
  IconButton,
  Image,
  Stack,
  Text,
  Tooltip,
  useDisclosure,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  FiCreditCard,
  FiStar,
  FiLogOut,
  FiMenu,
  FiSettings,
} from "react-icons/fi"

import memriPlaceMark from "../../assets/images/MemriPlaceLighterLogo.png"
import useAuth from "../../hooks/useAuth"
import ConnectedStarsIcon from "./ConnectedStarsIcon"
import UserMenu from "./UserMenu"
import { PUBLIC_SKY_ENABLED } from "../../config"
import { nightSkyApi } from "../../lib/nightSkyApi"

const links = [
  { label: "My Night Sky", to: "/conversations", icon: FiStar },
  { label: "Global Night Sky", to: "/night-sky", icon: ConnectedStarsIcon },
  { label: "Membership", to: "/membership", icon: FiCreditCard },
] as const

function AppHeader() {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { user, logout } = useAuth()
  const membershipQuery = useQuery({
    queryKey: ["membership"],
    queryFn: () => nightSkyApi.membership(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
  const visibleLinks = links.filter((item) =>
    (item.to !== "/night-sky" || PUBLIC_SKY_ENABLED) &&
    (item.to !== "/membership" || membershipQuery.data?.enabled === true),
  )

  return (
    <Box
      as="header"
      bg="rgba(255,253,247,0.94)"
      borderBottom="1px solid"
      borderColor="ui.line"
      position="sticky"
      top={0}
      zIndex={20}
      backdropFilter="blur(12px)"
    >
      <Flex
        align="center"
        h={{ base: "68px", md: "80px" }}
        maxW="7xl"
        mx="auto"
        px={{ base: 4, md: 8 }}
        gap={{ base: 2, md: 5 }}
      >
        <Tooltip label="Go to MemriPlace home" hasArrow openDelay={450}>
          <HStack
            as={Link}
            to="/"
            aria-label="MemriPlace home"
            spacing={{ base: 0, sm: 2.5 }}
            flexShrink={0}
            borderRadius="full"
            color="#244C48"
            _hover={{ color: "#1F6B65", textDecoration: "none", transform: "translateY(-1px)" }}
            _focusVisible={{ outline: "3px solid", outlineColor: "ui.accent", outlineOffset: "3px" }}
          >
            <Image
              alt=""
              display="block"
              h={{ base: "44px", md: "52px" }}
              objectFit="contain"
              src={memriPlaceMark}
              w={{ base: "48px", md: "54px" }}
            />
            <Text
              display={{ base: "none", sm: "block" }}
              fontSize={{ sm: "md", md: "lg" }}
              fontWeight="800"
              letterSpacing="-.025em"
              whiteSpace="nowrap"
            >
              MemriPlace
            </Text>
          </HStack>
        </Tooltip>

        <HStack
          as="nav"
          aria-label="Main navigation"
          display={{ base: "none", md: "flex" }}
          flex="1"
          justify="center"
          spacing={1}
        >
          {visibleLinks.map((item) => (
            <Button
              key={item.label}
              as={Link}
              to={item.to}
              search={item.to === "/conversations" ? {} : undefined}
              variant="ghost"
              leftIcon={<Icon as={item.icon} />}
              borderRadius="full"
              color="ui.ink"
              fontSize="md"
              minH="48px"
              px={4}
              activeProps={{
                style: {
                  background: "#EAF3F1",
                  color: "#1F5E5C",
                  fontWeight: 700,
                },
              }}
              _hover={{ bg: "ui.secondary", color: "ui.mainDark" }}
            >
              {item.label}
            </Button>
          ))}
          {user?.is_superuser && (
            <Button
              as={Link}
              to="/admin"
              variant="ghost"
              color="ui.ink"
              fontSize="md"
              minH="48px"
              px={4}
              _hover={{ bg: "ui.secondary", color: "ui.mainDark" }}
            >
              Admin
            </Button>
          )}
        </HStack>

        <Flex
          align="center"
          gap={{ base: 1, md: 3 }}
          ml={{ base: "auto", md: 0 }}
        >
          <Button
            aria-label="Log out"
            onClick={logout}
            variant="ghost"
            color="ui.main"
            fontWeight="700"
            minH="44px"
            minW={{ base: "44px", md: "auto" }}
            px={{ base: 0, md: 3 }}
            _hover={{ bg: "#EAF3F1", color: "ui.mainDark" }}
          >
            <Icon as={FiLogOut} mr={{ base: 0, md: 2 }} />
            <Box as="span" display={{ base: "none", md: "inline" }}>
              Log out
            </Box>
          </Button>
          <UserMenu />
          <IconButton
            aria-label="Open navigation menu"
            display={{ base: "inline-flex", md: "none" }}
            icon={<FiMenu />}
            onClick={onOpen}
            variant="ghost"
            fontSize="22px"
            minW="44px"
            minH="44px"
          />
        </Flex>
      </Flex>

      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent bg="ui.light">
          <DrawerCloseButton minW="44px" minH="44px" />
          <DrawerBody pt={12}>
            <Stack as="nav" aria-label="Main navigation" spacing={2}>
              {visibleLinks.map((item) => (
                <Button
                  key={item.label}
                  as={Link}
                  to={item.to}
                  search={item.to === "/conversations" ? {} : undefined}
                  onClick={onClose}
                  justifyContent="flex-start"
                  leftIcon={<Icon as={item.icon} />}
                  variant="ghost"
                  minH="54px"
                  fontSize="lg"
                  color="ui.ink"
                  activeProps={{
                    style: {
                      background: "#EAF3F1",
                      color: "#1F5E5C",
                      fontWeight: 700,
                    },
                  }}
                >
                  {item.label}
                </Button>
              ))}
              {user?.is_superuser && (
                <Button
                  as={Link}
                  to="/admin"
                  onClick={onClose}
                  justifyContent="flex-start"
                  variant="ghost"
                  minH="54px"
                  fontSize="lg"
                  color="ui.ink"
                >
                  Admin
                </Button>
              )}
              <Button
                as={Link}
                to="/settings"
                onClick={onClose}
                justifyContent="flex-start"
                leftIcon={<FiSettings />}
                variant="ghost"
                minH="54px"
                color="ui.ink"
                fontSize="lg"
                _hover={{ bg: "ui.secondary" }}
              >
                My account
              </Button>
              <Button
                onClick={() => {
                  onClose()
                  logout()
                }}
                justifyContent="flex-start"
                leftIcon={<FiLogOut />}
                variant="ghost"
                color="ui.main"
                minH="54px"
                fontSize="lg"
                _hover={{ bg: "#EAF3F1", color: "ui.mainDark" }}
              >
                Log out
              </Button>
            </Stack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  )
}

export default AppHeader
