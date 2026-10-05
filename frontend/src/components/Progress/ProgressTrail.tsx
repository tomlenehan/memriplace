import {
  Box,
  Flex,
  HStack,
  Icon,
  Progress,
  Skeleton,
  Text,
  Tooltip,
} from "@chakra-ui/react"
import { FiCheck, FiStar, FiSun } from "react-icons/fi"
import useMemoryProgress from "../../hooks/useMemoryProgress"

export default function ProgressTrail() {
  const { data, isLoading, isError } = useMemoryProgress()
  if (isLoading) return <Skeleton h="96px" borderRadius="24px" mb={6} />
  if (isError || !data)
    return (
      <Text fontSize="sm" color="ui.muted" mb={5}>
        Your progress is temporarily unavailable. My memories are still here.
      </Text>
    )
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${data.today}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 6 + i)
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString(undefined, {
        weekday: "short",
        timeZone: "UTC",
      }),
    }
  })
  return (
    <Flex
      as="section"
      aria-label="Your story progress"
      bg="white"
      border="1px solid #E6E8DC"
      borderRadius="24px"
      p={{ base: 4, md: 5 }}
      gap={{ base: 4, md: 8 }}
      mb={6}
      align="center"
      flexWrap="wrap"
      boxShadow="0 4px 0 #ECEEE3"
    >
      <HStack spacing={3} flex="1" minW="200px">
        <Flex
          align="center"
          justify="center"
          boxSize="48px"
          flexShrink={0}
          bg="#FFF0BF"
          color="#896120"
          borderRadius="17px"
          transform="rotate(-6deg)"
        >
          <Icon as={FiStar} boxSize={6} />
        </Flex>
        <Box flex="1">
          <Flex justify="space-between" gap={4} mb={2}>
            <Text fontWeight="800" fontSize="sm">
              Level {data.level} ·{" "}
              {data.level < 3
                ? "Stargazer"
                : data.level < 6
                  ? "Story explorer"
                  : "Memory keeper"}
            </Text>
            <Text color="ui.muted" fontSize="xs">
              {data.total_xp} XP
            </Text>
          </Flex>
          <Progress
            aria-label="Experience toward next level"
            value={(data.level_xp / data.next_level_xp) * 100}
            h="9px"
            borderRadius="full"
            bg="#EEF1E6"
            sx={{ "& > div": { bg: "#76AB8D", borderRadius: "full" } }}
          />
          <Text fontSize="xs" color="ui.muted" mt={1.5}>
            {data.next_level_xp - data.level_xp} XP to your next level · 25 XP
            per saved story
          </Text>
        </Box>
      </HStack>
      <Box>
        <HStack mb={2} justify="space-between">
          <HStack spacing={1.5}>
            <Icon as={FiSun} color="#A86C2B" />
            <Text fontSize="sm" fontWeight="800">
              {data.streak} day streak
            </Text>
          </HStack>
          <Text fontSize="xs" color="ui.muted">
            Best: {data.best_streak}
          </Text>
        </HStack>
        <HStack
          spacing={2}
          aria-label="Saved stories over the last seven days, UTC"
        >
          {dates.map(({ key, label }) => (
            <Tooltip
              key={key}
              label={`${label}, ${key} (UTC): ${
                data.active_dates.includes(key)
                  ? "story saved"
                  : "no story saved"
              }`}
            >
              <Flex
                aria-label={`${label}: ${
                  data.active_dates.includes(key) ? "complete" : "no activity"
                }`}
                boxSize="29px"
                align="center"
                justify="center"
                borderRadius="full"
                bg={data.active_dates.includes(key) ? "#DDEEE2" : "#F4F4EC"}
                color="#426F60"
                border={
                  key === data.today
                    ? "2px solid #83AC94"
                    : "2px solid transparent"
                }
              >
                {data.active_dates.includes(key) ? (
                  <FiCheck />
                ) : (
                  <Text fontSize="10px">{label[0]}</Text>
                )}
              </Flex>
            </Tooltip>
          ))}
        </HStack>
        <Text fontSize="10px" mt={1.5} color="ui.muted">
          A saved story marks your day · UTC
        </Text>
      </Box>
    </Flex>
  )
}
