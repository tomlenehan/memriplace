import { Button, HStack, Text, VisuallyHidden } from "@chakra-ui/react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

const STORAGE_KEY = "memriplace-reading-text-size"
const SIZE_EVENT = "memriplace-reading-text-size-change"
// Keep this experiment dormant while we simplify the reader controls.
export const READING_TEXT_SIZE_ENABLED = false
const DEFAULT_SIZE = 100
const MIN_SIZE = 80
const MAX_SIZE = 150
const STEP = 10

interface ReadingTextSizeContextValue {
  scale: number
  decrease: () => void
  increase: () => void
}

const ReadingTextSizeContext = createContext<ReadingTextSizeContextValue | null>(null)

function readSavedSize() {
  if (typeof window === "undefined") return DEFAULT_SIZE
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(saved) && saved >= MIN_SIZE && saved <= MAX_SIZE
      ? Math.round(saved / STEP) * STEP
      : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}

export function ReadingTextSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSize] = useState(readSavedSize)

  useEffect(() => {
    const syncSize = () => setSize(readSavedSize())
    window.addEventListener("storage", syncSize)
    window.addEventListener(SIZE_EVENT, syncSize)
    return () => {
      window.removeEventListener("storage", syncSize)
      window.removeEventListener(SIZE_EVENT, syncSize)
    }
  }, [])

  const updateSize = useCallback((delta: number) => {
    const next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size + delta))
    setSize(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Keep the control usable for this session if browser storage is disabled.
    }
    window.dispatchEvent(new Event(SIZE_EVENT))
  }, [size])

  const value = useMemo(() => ({
    scale: READING_TEXT_SIZE_ENABLED ? size / 100 : 1,
    decrease: () => updateSize(-STEP),
    increase: () => updateSize(STEP),
  }), [size, updateSize])

  return <ReadingTextSizeContext.Provider value={value}>{children}</ReadingTextSizeContext.Provider>
}

export function useReadingTextSize() {
  const value = useContext(ReadingTextSizeContext)
  if (!value) throw new Error("useReadingTextSize must be used inside ReadingTextSizeProvider")
  return value
}

export function ReadingTextSizeControl() {
  const { scale, decrease, increase } = useReadingTextSize()
  const percentage = Math.round(scale * 100)

  if (!READING_TEXT_SIZE_ENABLED) return null

  return (
    <HStack role="group" aria-label="Story text size" spacing={1} flexShrink={0}>
      <Text color="#476B63" fontSize="sm" fontWeight="700" whiteSpace="nowrap">Text size</Text>
      <Button type="button" variant="outline" size="sm" minW="48px" minH="44px" px={2}
        aria-label="Decrease story text size" title="Decrease text size" onClick={decrease}
        isDisabled={percentage <= MIN_SIZE} color="#286B69" borderColor="#AFC8BA">
        A−
      </Button>
      <Button type="button" variant="outline" size="sm" minW="48px" minH="44px" px={2}
        aria-label="Increase story text size" title="Increase text size" onClick={increase}
        isDisabled={percentage >= MAX_SIZE} color="#286B69" borderColor="#AFC8BA">
        A+
      </Button>
      <VisuallyHidden aria-live="polite">Story text size: {percentage}%</VisuallyHidden>
    </HStack>
  )
}
