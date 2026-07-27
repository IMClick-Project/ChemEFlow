import { Handle, Position } from '@xyflow/react'

function SinkNode() {
  return (
    <div className="sink-node">
      <Handle
        id="input"
        type="target"
        position={Position.Left}
        className="sink-handle"
      />
    </div>
  )
}

export default SinkNode