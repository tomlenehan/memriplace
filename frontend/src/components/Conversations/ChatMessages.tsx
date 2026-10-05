import { Box, Flex, HStack, Icon, Text, VStack, useColorModeValue } from "@chakra-ui/react";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useRef } from "react";
import { FiHeart, FiUser } from "react-icons/fi";
import { useReadingTextSize } from "../Common/ReadingTextSize";
import { fetchMessages, clearMessages } from "../../redux/chatSlice";
import { RootState, AppDispatch } from "../../redux/store";
import type { ChatMessagePublic } from "../../client";

const EMPTY_MESSAGES: ChatMessagePublic[] = []
const EMPTY_MESSAGE_IDS: number[] = []

interface ChatMessagesProps {
  conversationId: number;
}

const ChatMessages = ({ conversationId }: ChatMessagesProps) => {
  const dispatch: AppDispatch = useDispatch();
  const messages = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.messages : EMPTY_MESSAGES,
  );
  const streamingMessageIds = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.streamingMessageIds : EMPTY_MESSAGE_IDS,
  );
  const status = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.status : "loading",
  );
  const error = useSelector((state: RootState) =>
    state.chat.conversationId === conversationId ? state.chat.error : null,
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const bgColor = useColorModeValue("#FBF9F1", "ui.dark");
  const textColor = useColorModeValue("#17353B", "ui.light");
  const { scale } = useReadingTextSize();

  useEffect(() => {
    dispatch(clearMessages(conversationId));
    dispatch(fetchMessages(conversationId));
  }, [conversationId, dispatch]);

  useEffect(() => {
    if (
      messages.length > previousMessageCountRef.current &&
      messages.slice(previousMessageCountRef.current).some((message) => message.sender_type === "user")
    ) {
      stickToBottomRef.current = true;
    }
    previousMessageCountRef.current = messages.length;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container && stickToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  if (status === 'loading') {
    return <Text px={5} py={4} color="#66807E">Opening this memory…</Text>;
  }

  if (status === 'failed') {
    return <Text px={5} py={4} color="red.500">Error loading messages: {error}</Text>;
  }

  return (
    <Box
      ref={scrollContainerRef}
      flex="1"
      overflowY="auto"
      px={{ base: 4, md: 7 }}
      py={{ base: 5, md: 7 }}
      bg={bgColor}
      minH={0}
      onScroll={(event) => {
        const container = event.currentTarget;
        stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      }}
    >
      <VStack spacing={5} align="stretch" maxW="760px" mx="auto">
        {messages.map((message) => {
          const isStreaming = streamingMessageIds.includes(message.id);
          return (
            <Flex
              key={message.id}
              justify={message.sender_type === "user" ? "flex-end" : "flex-start"}
            >
              <Box
                maxW={{ base: "92%", md: "82%" }}
                bg={message.sender_type === "user" ? "#E7F0E8" : message.sender_type === "final" ? "#F8EBD3" : "white"}
                border="1px solid"
                borderColor={message.sender_type === "user" ? "#D3E4D8" : message.sender_type === "final" ? "#EEDDAD" : "#EAE6DB"}
                px={{ base: 4, md: 5 }}
                py={4}
                borderRadius={message.sender_type === "user" ? "22px 22px 7px 22px" : "22px 22px 22px 7px"}
                boxShadow="0 5px 14px rgba(39,62,61,0.035)"
                color={textColor}
              >
                <HStack spacing={2} mb={2} color={message.sender_type === "user" ? "#4B8D82" : "#D07F5C"}>
                  <Icon as={message.sender_type === "user" ? FiUser : FiHeart} boxSize={3} />
                  <Text fontSize="10px" fontWeight="800" letterSpacing="0.1em" textTransform="uppercase">
                    {message.sender_type === "user" ? "You" : message.sender_type === "final" ? "Memory note" : "MemriPlace"}
                  </Text>
                  {isStreaming && (
                    <Text as="span" fontSize="10px" fontWeight="700" letterSpacing="0.04em" aria-live="polite">
                      {message.sender_type === "user" ? "LIVE TRANSCRIPT" : "SPEAKING"}
                    </Text>
                  )}
                </HStack>
                <Text whiteSpace="pre-wrap" lineHeight="1.7" fontSize="sm"
                  style={{ fontSize: `calc(0.875rem * ${scale})` }} aria-live={isStreaming ? "polite" : undefined}>
                  {message.content || (isStreaming && message.sender_type === "user" ? "Listening…" : "")}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </VStack>
    </Box>
  );
};

export default ChatMessages;
