import { Box, Flex, Icon, Text, useColorModeValue } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import {
  FiGitBranch,
  FiHome,
  FiSettings,
  FiUsers,
} from "react-icons/fi";
import ConnectedStarsIcon from "./ConnectedStarsIcon";
import useAuth from "../../hooks/useAuth";
import { PUBLIC_SKY_ENABLED } from "../../config";

const items = [
  { icon: FiHome, title: "Home", path: "/" },
  { icon: FiGitBranch, title: "My Night Sky", path: "/conversations" },
  { icon: ConnectedStarsIcon, title: "Global Night Sky", path: "/night-sky" },
  { icon: FiSettings, title: "Settings", path: "/settings" },
];

interface SidebarItemsProps {
  onClose?: () => void;
}

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const textColor = useColorModeValue("ui.ink", "ui.light");
  const mutedColor = useColorModeValue("ui.muted", "gray.400");
  const bgActive = useColorModeValue("#EAF3F1", "#34424A");
  const activeColor = useColorModeValue("ui.mainDark", "white");
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  const finalItems = items.filter((item) => item.path !== "/night-sky" || PUBLIC_SKY_ENABLED);

  if (user?.is_superuser) {
    finalItems.push({ icon: FiUsers, title: "Admin", path: "/admin" });
  }

  const listItems = finalItems.map(({ icon, title, path }) => (
    <Flex
      as={Link}
      to={path}
      w="100%"
      minH="44px"
      px={3}
      py={2}
      mb={1}
      key={title}
      activeProps={{
        style: {
          background: bgActive,
          borderRadius: "8px",
          color: activeColor,
          fontWeight: 700,
        },
      }}
      color={textColor}
      onClick={onClose}
      align="center"
      borderRadius="8px"
      transition="background 0.2s ease, color 0.2s ease"
      _hover={{ bg: "ui.secondary", color: "ui.mainDark" }}
    >
      <Icon as={icon} alignSelf="center" color={mutedColor} boxSize={5} />
      <Text ml={3}>{title}</Text>
    </Flex>
  ));

  return <Box>{listItems}</Box>;
};

export default SidebarItems;
