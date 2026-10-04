import { Box, Text } from "@chakra-ui/react"
import { Controls, Handle, Position, ReactFlow, useNodesInitialized, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { useEffect, useState, type CSSProperties } from "react"
import { FiStar } from "react-icons/fi"
import "@xyflow/react/dist/style.css"
import "./night-sky.css"

export type SceneStar = { title: string; image_url?: string | null; x?: number | null; y?: number | null }
export type SceneLink = { a: number; b: number }

type SceneNode = Node<{
  index: number
  star: SceneStar
  selected: boolean
  onSelect: (index: number) => void
}, "sceneStar">

function SceneStarNode({ data }: NodeProps<SceneNode>) {
  return <div className={`sky-node ${data.selected ? "active" : ""}`}>
    <Handle type="target" position={Position.Left} className="sky-node-handle" />
    <button type="button" className="sky-node-hit nodrag nopan"
      aria-label={`Explore ${data.star.title}`} aria-pressed={data.selected} onClick={() => data.onSelect(data.index)} title={data.star.title}>
      <span className="sky-node-button" style={{ "--node-tint": ["#F8D881", "#B9DDCF", "#D9C5E6", "#F4C7AF"][data.index % 4] } as CSSProperties}>
        {data.star.image_url ? <img src={data.star.image_url} alt="" /> : <FiStar aria-hidden="true" />}
        <span className="sky-node-spark" aria-hidden="true">✦</span>
      </span>
      <span className="sky-node-title">{data.star.title}</span>
    </button>
    <Handle type="source" position={Position.Right} className="sky-node-handle" />
  </div>
}
const nodeTypes = { sceneStar: SceneStarNode }

function FitScene({ starCount }: { starCount: number }) {
  const nodesInitialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!nodesInitialized || starCount === 0) return
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: .32, maxZoom: 1.15 })
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, nodesInitialized, starCount])
  return null
}

export default function SkyScene({ stars, links, selected, onSelect, label }: {
  stars: SceneStar[]
  links: SceneLink[]
  selected: number | null
  onSelect: (index: number) => void
  label: string
}) {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 600px)").matches)
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 350px)").matches)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)")
    const narrowMedia = window.matchMedia("(max-width: 350px)")
    const update = () => { setCompact(media.matches); setNarrow(narrowMedia.matches) }
    media.addEventListener("change", update)
    narrowMedia.addEventListener("change", update)
    return () => { media.removeEventListener("change", update); narrowMedia.removeEventListener("change", update) }
  }, [])
  const columns = narrow ? 1 : compact ? 2 : Math.max(2, Math.ceil(Math.sqrt(stars.length * 1.4)))
  const nodes: SceneNode[] = stars.map((star, index) => ({
    id: String(index), type: "sceneStar", draggable: false, selectable: false,
    style: { pointerEvents: "all" },
    className: selected === index ? "sky-flow-node-selected" : "",
    position: {
      x: compact ? star.x == null ? (narrow ? 70 : 30 + (index % columns) * 185) : 25 + star.x * (narrow ? 80 : 245)
        : star.x == null ? 80 + (index % columns) * 215 + (Math.floor(index / columns) % 2 ? 45 : 0) : 70 + star.x * 760,
      y: star.y == null ? 55 + Math.floor(index / columns) * 185 + (index % 2 ? 24 : 0) : 45 + star.y * 480,
    },
    data: { index, star, selected: selected === index, onSelect },
  }))
  const edges: Edge[] = links.filter(({ a, b }) => nodes[a] && nodes[b]).map(({ a, b }, index) => ({
    id: `${a}-${b}-${index}`, source: String(a), target: String(b), type: "straight", selectable: false,
    style: { stroke: selected === a || selected === b ? "#FFE4A3" : "#9BCEC0", strokeWidth: selected === a || selected === b ? 4 : 3 },
  }))
  return <Box className="scene-sky" aria-label={label}>
    <Box className="personal-sky-viewport scene-viewport">
      <ReactFlow key={`${narrow ? "narrow" : compact ? "compact" : "wide"}-${stars.length}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        defaultViewport={compact ? { x: narrow ? 30 : 12, y: 55, zoom: narrow ? .9 : .8 } : { x: 45, y: 50, zoom: 1 }}
        minZoom={.35} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} panOnDrag zoomOnPinch zoomOnScroll={false}
        zoomOnDoubleClick={false} preventScrolling={false} proOptions={{ hideAttribution: true }}>
        <FitScene starCount={stars.length} />
        <Controls position={compact ? "top-left" : "bottom-right"} showInteractive={false} />
      </ReactFlow>
      <Text className="sky-hint">Select a star to read its memory · Drag the sky to explore</Text>
    </Box>
  </Box>
}
