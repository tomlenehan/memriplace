import { API_BASE_URL } from "../config"

export type SkyLink = { a: number; b: number }
export type Member = {
  story_id: number
  title: string
  summary_text: string
  image_url: string | null
  x: number | null
  y: number | null
  share_story: boolean
  share_image: boolean
}
export type Constellation = {
  id: number
  title: string
  overview: string
  source_hash: string | null
  proposal_text: string | null
  proposal_source_hash: string | null
  created_at: string
  modified_at: string
  publication_id: number | null
  members: Member[]
  links: { story_a_id: number; story_b_id: number }[]
}
export type MemoryConstellationImpact = { id: number; title: string; is_public: boolean }
export type MembershipStatus = {
  enabled: boolean
  plan: "free" | "plus"
  status: string
  is_paid: boolean
  public_memory_limit: number | null
  shared_memory_count: number
  shared_memory_ids: number[]
  current_period_end: string | null
  cancel_at_period_end: boolean
}
export type ConstellationWrite = {
  title: string
  overview: string
  members: Pick<Member, "story_id" | "x" | "y" | "share_story" | "share_image">[]
  links: { story_a_id: number; story_b_id: number }[]
  source_hash?: string | null
}
export type SkyStar = {
  index: number
  title: string
  story_text: string | null
  image_url: string | null
  x: number | null
  y: number | null
}
export type PublicConstellation = {
  id: number | null
  title: string
  overview: string
  author_name: string
  author_level: number
  votes: number
  revision: number
  published_at: string | null
  stars: SkyStar[]
  links: SkyLink[]
  preview_token: string | null
}
export type SkyCluster = {
  id: number
  title: string
  overview_excerpt: string
  author_name: string
  author_level: number
  star_count: number
  votes: number
  published_at: string
  preview_stars: { x: number; y: number }[]
  preview_links: { a: number; b: number }[]
}
export type SkyPage = { data: SkyCluster[]; count: number }
export type SkyReport = { id: number; publication_id: number; user_id: number; reason: string; status: string; created_at: string }

async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const token = localStorage.getItem("access_token")
  if (authenticated && !token) throw new Error("Please sign in again")
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || "Something went wrong. Please try again.")
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export const nightSkyApi = {
  membership: (excludingConstellationId?: number) => request<MembershipStatus>(
    `/membership/me${excludingConstellationId == null ? "" : `?excluding_constellation_id=${excludingConstellationId}`}`,
  ),
  list: () => request<Constellation[]>("/constellations/"),
  get: (id: number) => request<Constellation>(`/constellations/${id}`),
  memoryConstellations: (storyId: number) => request<MemoryConstellationImpact[]>(`/summaries/${storyId}/constellations`),
  create: (body: ConstellationWrite) => request<Constellation>("/constellations/", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: ConstellationWrite) => request<Constellation>(`/constellations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: number) => request<void>(`/constellations/${id}`, { method: "DELETE" }),
  proposeOverview: (id: number, refresh = false) => request<{ overview: string; source_hash: string }>(`/constellations/${id}/propose-overview?refresh=${refresh}`, { method: "POST" }),
  preview: (id: number, author_name: string) => request<PublicConstellation>(`/night-sky/preview/${id}`, { method: "POST", body: JSON.stringify({ author_name }) }),
  publish: (id: number, author_name: string, preview_token: string) => request<PublicConstellation>(`/night-sky/publish/${id}`, { method: "POST", body: JSON.stringify({ author_name, preview_token }) }),
  unpublish: (id: number) => request<void>(`/night-sky/publish/${id}`, { method: "DELETE" }),
  browse: (sort: "recent" | "celebrated" = "recent", skip = 0) => request<SkyPage>(`/night-sky/?sort=${sort}&skip=${skip}`, {}, false),
  publicDetail: (id: number) => request<PublicConstellation>(`/night-sky/${id}`, {}, false),
  voteStatus: (id: number) => request<{ votes: number; voted: boolean }>(`/night-sky/${id}/vote`),
  vote: (id: number) => request<{ votes: number; voted: boolean }>(`/night-sky/${id}/vote`, { method: "POST" }),
  unvote: (id: number) => request<{ votes: number; voted: boolean }>(`/night-sky/${id}/vote`, { method: "DELETE" }),
  report: (id: number, reason: string) => request<void>(`/night-sky/${id}/report`, { method: "POST", body: JSON.stringify({ reason }) }),
  reports: () => request<SkyReport[]>("/night-sky/admin/reports"),
  resolveReport: (id: number) => request<void>(`/night-sky/admin/reports/${id}/resolve`, { method: "POST" }),
  hidePublication: (id: number) => request<void>(`/night-sky/admin/${id}`, { method: "DELETE" }),
}
