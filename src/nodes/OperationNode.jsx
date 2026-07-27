import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

const SIDE_TO_POSITION = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

function normalizePort(port, fallbackSide, fallbackOffset = 50) {
  return {
    side: ['left', 'right', 'top', 'bottom'].includes(port?.side) ? port.side : fallbackSide,
    offset: Math.min(92, Math.max(8, Number(port?.offset) || fallbackOffset)),
  }
}

function handleStyle(port) {
  if (port.side === 'left' || port.side === 'right') {
    return { top: `${port.offset}%`, transform: 'translateY(-50%)' }
  }
  return { left: `${port.offset}%`, transform: 'translateX(-50%)' }
}

function gripStyle(port) {
  if (port.side === 'left') return { left: 9, top: `${port.offset}%`, transform: 'translateY(-50%)' }
  if (port.side === 'right') return { right: 9, top: `${port.offset}%`, transform: 'translateY(-50%)' }
  if (port.side === 'top') return { top: 9, left: `${port.offset}%`, transform: 'translateX(-50%)' }
  return { bottom: 9, left: `${port.offset}%`, transform: 'translateX(-50%)' }
}

function nearestPortPosition(event, element) {
  const rect = element.getBoundingClientRect()
  const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left))
  const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top))
  const distances = {
    left: x,
    right: rect.width - x,
    top: y,
    bottom: rect.height - y,
  }
  const side = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0]
  const rawOffset = side === 'left' || side === 'right'
    ? (y / Math.max(rect.height, 1)) * 100
    : (x / Math.max(rect.width, 1)) * 100
  return { side, offset: Math.round(Math.min(92, Math.max(8, rawOffset))) }
}

function OperationNode({ id, data, selected }) {
  const nodeRef = useRef(null)
  const updateNodeInternals = useUpdateNodeInternals()
  const inputPorts = useMemo(
    () => (data.inputPorts ?? []).map((item, index) => ({
      ...item,
      position: normalizePort(item.position, 'left', 25 + index * 15),
    })),
    [data.inputPorts],
  )
  const outputPorts = useMemo(
    () => (data.outputPorts ?? []).map((item, index) => ({
      ...item,
      position: normalizePort(item.position, 'right', 25 + index * 15),
    })),
    [data.outputPorts],
  )

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, inputPorts, outputPorts, updateNodeInternals])

  const startPortDrag = useCallback((event, edgeId, endpoint) => {
    event.preventDefault()
    event.stopPropagation()

    const move = (moveEvent) => {
      if (!nodeRef.current) return
      data.onStreamPortPositionChange?.(
        edgeId,
        endpoint,
        nearestPortPosition(moveEvent, nodeRef.current),
      )
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }, [data])

  return (
    <div ref={nodeRef} className="operation-node">
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={100}
        keepAspectRatio={false}
      />

      {/* Generic handles are only for creating a new stream. */}
      <Handle
        id="input-new"
        type="target"
        position={Position.Left}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        className="operation-input-handle operation-new-port"
        title="Create inlet stream"
      />
      <Handle
        id="output-new"
        type="source"
        position={Position.Right}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        className="operation-output-handle operation-new-port"
        title="Create outlet stream"
      />

      {inputPorts.map((port) => (
        <div key={`input-${port.edgeId}`}>
          <Handle
            id={`input-${port.edgeId}`}
            type="target"
            position={SIDE_TO_POSITION[port.position.side]}
            style={handleStyle(port.position)}
            className="operation-input-handle movable-operation-port"
            title={`${port.label || 'Stream'} inlet`}
          />
          {selected && (
            <button
              type="button"
              className="operation-port-grip operation-port-grip-input nodrag"
              style={gripStyle(port.position)}
              onPointerDown={(event) => startPortDrag(event, port.edgeId, 'target')}
              title={`Move inlet of ${port.label || 'stream'}`}
              aria-label={`Move inlet of ${port.label || 'stream'}`}
            />
          )}
        </div>
      ))}

      <div className="operation-content">
        <div className="operation-name">{data.label}</div>
        <div className="operation-image-area">
          {data.image ? (
            <img className="operation-image" src={data.image} alt={data.label} />
          ) : (
            <div className="operation-placeholder">×</div>
          )}
        </div>
      </div>

      {outputPorts.map((port) => (
        <div key={`output-${port.edgeId}`}>
          <Handle
            id={`output-${port.edgeId}`}
            type="source"
            position={SIDE_TO_POSITION[port.position.side]}
            style={handleStyle(port.position)}
            className="operation-output-handle movable-operation-port"
            title={`${port.label || 'Stream'} outlet`}
          />
          {selected && (
            <button
              type="button"
              className="operation-port-grip operation-port-grip-output nodrag"
              style={gripStyle(port.position)}
              onPointerDown={(event) => startPortDrag(event, port.edgeId, 'source')}
              title={`Move outlet of ${port.label || 'stream'}`}
              aria-label={`Move outlet of ${port.label || 'stream'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default OperationNode
