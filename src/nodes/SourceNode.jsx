import { Handle, Position } from '@xyflow/react'

function SourceNode() {
  return (
    <div className="source-node">
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="source-handle"
      />
    </div>
  )
}

export default SourceNode