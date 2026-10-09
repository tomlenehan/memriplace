import type { ConversationPublic, StorySummaryPublic } from "../client"

const PENDING_SUGGESTION_KEY = "pendingStorySuggestion"
const PENDING_SUGGESTION_TTL_MS = 3 * 60 * 1000

type PendingSuggestion = { conversationId: number; expiresAt: number }

function readPendingSuggestion(): PendingSuggestion | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(PENDING_SUGGESTION_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingSuggestion
    if (!Number.isInteger(pending?.conversationId) || !Number.isFinite(pending?.expiresAt) || pending.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(PENDING_SUGGESTION_KEY)
      return null
    }
    return pending
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_SUGGESTION_KEY)
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
    return null
  }
}

export function markStorySuggestionPending(conversationId: number) {
  if (typeof window === "undefined") return
  const pending: PendingSuggestion = {
    conversationId,
    expiresAt: Date.now() + PENDING_SUGGESTION_TTL_MS,
  }
  try {
    window.sessionStorage.setItem(PENDING_SUGGESTION_KEY, JSON.stringify(pending))
  } catch {
    // Suggestions remain optional; storage must never block saving a memory.
  }
}

export function clearStorySuggestionPending(conversationId?: number) {
  if (typeof window === "undefined") return
  const pending = readPendingSuggestion()
  if (conversationId == null || pending?.conversationId === conversationId) {
    try {
      window.sessionStorage.removeItem(PENDING_SUGGESTION_KEY)
    } catch {
      // Ignore storage restrictions; the marker also expires automatically.
    }
  }
}

export function pendingStorySuggestionParentId(conversations?: ConversationPublic[]) {
  const pending = readPendingSuggestion()
  if (!pending) return null
  if (conversations?.some((conversation) => conversation.parent_conversation_id === pending.conversationId)) {
    clearStorySuggestionPending(pending.conversationId)
    return null
  }
  return pending.conversationId
}

export function organizeStoryPaths(conversations: ConversationPublic[], memories: StorySummaryPublic[]) {
  const completedConversationIds = new Set(memories.map((memory) => memory.conversation_id))
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]))
  const memoryByConversationId = new Map(memories.map((memory) => [memory.conversation_id, memory]))
  const available = conversations.filter((conversation) => !completedConversationIds.has(conversation.id))
  const newestFirst = (a: ConversationPublic, b: ConversationPublic) =>
    b.created_at.localeCompare(a.created_at) || b.id - a.id
  const inProgress = available
    .filter((conversation) => conversation.status === "active" || conversation.status === "ready_for_summary")
    .sort(newestFirst)
  const childrenByParent = new Map<number, ConversationPublic[]>()
  for (const conversation of conversations) {
    const parentId = conversation.parent_conversation_id
    if (parentId == null || !completedConversationIds.has(parentId)) continue
    const children = childrenByParent.get(parentId) ?? []
    children.push(conversation)
    childrenByParent.set(parentId, children)
  }
  const newestMemoryWithFollowUps = [...memories]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .find((memory) => childrenByParent.has(memory.conversation_id))
  const suggested = newestMemoryWithFollowUps
    ? (childrenByParent.get(newestMemoryWithFollowUps.conversation_id) ?? [])
      .filter((conversation) => conversation.status === "inactive")
      .sort(newestFirst)
      .slice(0, 2)
    : []
  const sourceTitle = (conversation: ConversationPublic) => {
    const parentId = conversation.parent_conversation_id
    if (parentId == null) return null
    const memoryTitle = memoryByConversationId.get(parentId)?.title?.trim()
    return memoryTitle || byId.get(parentId)?.node_title?.trim() || null
  }

  return { inProgress, suggested, sourceTitle, memoryByConversationId, byId }
}
