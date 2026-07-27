import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
} from '@xyflow/react'

import '@xyflow/react/dist/style.css'
import './App.css'

import SourceNode from './nodes/SourceNode'
import SinkNode from './nodes/SinkNode'
import OperationNode from './nodes/OperationNode'
import PropertiesPanel from './components/PropertiesPanel'
import TopBar from './components/TopBar'
import ComponentsPage from './pages/ComponentsPage'
import EquationsPage from './pages/EquationsPage'
import ResultsPage from './pages/ResultsPage'

const nodeTypes = {
  sourceNode: SourceNode,
  sinkNode: SinkNode,
  operationNode: OperationNode,
}


function toResultsStatus(status) {
  if (status === 'specified') return 'known'
  if (status === 'solved') return 'solved'
  if (status === 'calculated') return 'calculated'
  return 'calculated'
}

function buildResultsTables(snapshot, components) {
  const streamVariables = snapshot.variables
    .filter((variable) => variable.source === 'stream')
    .map((variable) => ({
      ...variable,
      property: variable.id.includes('__fraction__')
        ? 'fraction'
        : variable.id.includes('__componentFlow__')
          ? 'componentFlow'
          : variable.id.includes('__totalFlow')
            ? 'totalFlow'
            : '',
    }))

  const streams = [...new Map(
    streamVariables.map((variable) => [variable.streamId, variable.streamName]),
  ).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, {
      numeric: true,
      sensitivity: 'base',
    }))

  const byKey = new Map(
    streamVariables.map((variable) => [
      `${variable.streamId}|${variable.componentId ?? ''}|${variable.property}`,
      variable,
    ]),
  )

  const get = (streamId, componentId, property) => {
    const variable = byKey.get(`${streamId}|${componentId ?? ''}|${property}`)
    const value = Number(variable?.value)
    return Number.isFinite(value) ? value : null
  }

  const validMw = components.length > 0
    && components.every((component) => Number(component.molecularWeight) > 0)
  const basis = snapshot.calculationBasis
  const massValues = new Map()
  const molarValues = new Map()
  const massStatuses = new Map()
  const molarStatuses = new Map()

  streams.forEach((stream) => {
    const primaryTotal = get(stream.id, null, 'totalFlow')
    const totalVariable = byKey.get(`${stream.id}||totalFlow`)
    const totalStatus = toResultsStatus(totalVariable?.status)
    if (basis === 'mass') {
      massValues.set(`${stream.id}|total`, primaryTotal)
      if (primaryTotal != null) massStatuses.set(`${stream.id}|total`, totalStatus)
    } else {
      molarValues.set(`${stream.id}|total`, primaryTotal)
      if (primaryTotal != null) molarStatuses.set(`${stream.id}|total`, totalStatus)
    }

    components.forEach((component) => {
      const fraction = get(stream.id, component.id, 'fraction')
      const flow = get(stream.id, component.id, 'componentFlow')
      const fractionVariable = byKey.get(`${stream.id}|${component.id}|fraction`)
      const flowVariable = byKey.get(`${stream.id}|${component.id}|componentFlow`)
      const fractionStatus = toResultsStatus(fractionVariable?.status)
      const flowStatus = toResultsStatus(flowVariable?.status)

      if (basis === 'mass') {
        massValues.set(`${stream.id}|${component.id}|fraction`, fraction)
        massValues.set(`${stream.id}|${component.id}|flow`, flow)
        if (fraction != null) massStatuses.set(`${stream.id}|${component.id}|fraction`, fractionStatus)
        if (flow != null) massStatuses.set(`${stream.id}|${component.id}|flow`, flowStatus)
        if (validMw && flow != null) {
          molarValues.set(
            `${stream.id}|${component.id}|flow`,
            flow / Number(component.molecularWeight),
          )
          molarStatuses.set(`${stream.id}|${component.id}|flow`, 'calculated')
        }
      } else {
        molarValues.set(`${stream.id}|${component.id}|fraction`, fraction)
        molarValues.set(`${stream.id}|${component.id}|flow`, flow)
        if (fraction != null) molarStatuses.set(`${stream.id}|${component.id}|fraction`, fractionStatus)
        if (flow != null) molarStatuses.set(`${stream.id}|${component.id}|flow`, flowStatus)
        if (validMw && flow != null) {
          massValues.set(
            `${stream.id}|${component.id}|flow`,
            flow * Number(component.molecularWeight),
          )
          massStatuses.set(`${stream.id}|${component.id}|flow`, 'calculated')
        }
      }
    })
  })

  const deriveTotalsAndFractions = (map, statuses) => streams.forEach((stream) => {
    const flows = components.map((component) => (
      map.get(`${stream.id}|${component.id}|flow`)
    ))

    if (flows.every((value) => Number.isFinite(value))) {
      const total = flows.reduce((sum, value) => sum + value, 0)
      map.set(`${stream.id}|total`, total)
      statuses.set(`${stream.id}|total`, statuses.get(`${stream.id}|total`) ?? 'calculated')
      if (total > 0) {
        components.forEach((component, index) => {
          map.set(
            `${stream.id}|${component.id}|fraction`,
            flows[index] / total,
          )
          statuses.set(`${stream.id}|${component.id}|fraction`, statuses.get(`${stream.id}|${component.id}|fraction`) ?? 'calculated')
        })
      }
    }
  })

  deriveTotalsAndFractions(massValues, massStatuses)
  deriveTotalsAndFractions(molarValues, molarStatuses)

  const makeTable = (map, statuses, kind, unit, available = true, reason = '') => {
    const componentRows = components.map((component) => ({
      id: component.id,
      label: component.name,
      values: Object.fromEntries(streams.map((stream) => [
        stream.id,
        available
          ? (map.get(`${stream.id}|${component.id}|${kind}`) ?? '')
          : '',
      ])),
      statuses: Object.fromEntries(streams.map((stream) => [
        stream.id,
        available ? (statuses.get(`${stream.id}|${component.id}|${kind}`) ?? '') : '',
      ])),
    }))

    const totalRow = {
      id: '__total__',
      label: 'Total',
      values: Object.fromEntries(streams.map((stream) => {
        if (!available) return [stream.id, '']

        if (kind === 'flow') {
          return [stream.id, map.get(`${stream.id}|total`) ?? '']
        }

        const fractions = components.map((component) => (
          map.get(`${stream.id}|${component.id}|fraction`)
        ))
        return [
          stream.id,
          fractions.every((value) => Number.isFinite(value))
            ? fractions.reduce((sum, value) => sum + value, 0)
            : '',
        ]
      })),
      statuses: Object.fromEntries(streams.map((stream) => [
        stream.id,
        available
          ? (kind === 'flow'
            ? (statuses.get(`${stream.id}|total`) ?? 'calculated')
            : 'calculated')
          : '',
      ])),
    }

    return {
      available,
      reason,
      unit,
      streams,
      rows: [...componentRows, totalRow],
    }
  }

  const secondaryAvailable = validMw
  return {
    massComposition: makeTable(
      massValues,
      massStatuses,
      'fraction',
      'dimensionless',
      basis === 'mass' || secondaryAvailable,
      secondaryAvailable || basis === 'mass'
        ? ''
        : 'Molecular weights are required for mass-basis conversion.',
    ),
    massFlow: makeTable(
      massValues,
      massStatuses,
      'flow',
      'kg/h',
      basis === 'mass' || secondaryAvailable,
      secondaryAvailable || basis === 'mass'
        ? ''
        : 'Molecular weights are required for mass-basis conversion.',
    ),
    molarComposition: makeTable(
      molarValues,
      molarStatuses,
      'fraction',
      'dimensionless',
      basis === 'molar' || secondaryAvailable,
      secondaryAvailable || basis === 'molar'
        ? ''
        : 'Molecular weights are required for molar-basis conversion.',
    ),
    molarFlow: makeTable(
      molarValues,
      molarStatuses,
      'flow',
      'kmol/h',
      basis === 'molar' || secondaryAvailable,
      secondaryAvailable || basis === 'molar'
        ? ''
        : 'Molecular weights are required for molar-basis conversion.',
    ),
  }
}

const initialNodes = []
const initialEdges = []

let nodeId = 0
let streamCounter = 0

function getNodeId() {
  nodeId += 1
  return `node-${nodeId}`
}

function getDefaultStreamName() {
  streamCounter += 1
  return `Stream ${streamCounter}`
}

const nodeCounters = {
  sourceNode: 0,
  operationNode: 0,
  sinkNode: 0,
}

function getDefaultNodeName(nodeType) {
  nodeCounters[nodeType] += 1

  if (nodeType === 'sourceNode') {
    return `Source ${nodeCounters[nodeType]}`
  }

  if (nodeType === 'sinkNode') {
    return `Sink ${nodeCounters[nodeType]}`
  }

  return `Unit Operation ${nodeCounters[nodeType]}`
}

function getComponentId() {
  return `component-${crypto.randomUUID()}`
}

function createInitialStreamComposition(components) {
  const isPureStream = components.length === 1

  return Object.fromEntries(
    components.map((component) => [
      component.id,
      {
        fraction: isPureStream ? '1' : '',
        componentFlow: '',
      },
    ]),
  )
}

function resetEdgeSpecifications(edge, components) {
  const isPureStream = components.length === 1

  return {
    ...edge,
    data: {
      ...edge.data,
      totalFlow: '',
      composition: createInitialStreamComposition(components),
      calculatedFields:
        edge.data?.compositionInput !== 'componentFlow' && isPureStream
          ? [components[0].id]
          : [],
      remainingValue: null,
      validationMessage: '',
    },
  }
}

function edgeHasSpecifications(edge) {
  if (edge.data?.totalFlow !== '') {
    return true
  }

  return Object.values(edge.data?.composition ?? {}).some(
    (value) =>
      value?.fraction !== '' ||
      value?.componentFlow !== '',
  )
}

function FlowEditor({
  isActive,
  components,
  componentStructureVersion,
  calculationBasis,
  molarBasisAvailable,
  onCalculationBasisChange,
  onStreamCountChange,
  nodes,
  setNodes,
  onNodesChange,
  edges,
  setEdges,
  onEdgesChange,
}) {
  const { screenToFlowPosition } = useReactFlow()

  useEffect(() => {
    if (isActive) return

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: false,
      })),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        selected: false,
      })),
    )
  }, [isActive, setNodes, setEdges])

  useEffect(() => {
    onStreamCountChange(edges.length)
  }, [edges.length, onStreamCountChange])

  useEffect(() => {
    if (componentStructureVersion === 0) {
      return
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) => resetEdgeSpecifications(edge, components)),
    )
  }, [componentStructureVersion, setEdges])

  useEffect(() => {
    if (
      calculationBasis !== 'molar' ||
      molarBasisAvailable
    ) {
      return
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) => resetEdgeSpecifications(edge, components)),
    )
    onCalculationBasisChange('mass')
  }, [
    calculationBasis,
    molarBasisAvailable,
    onCalculationBasisChange,
    components,
    setEdges,
  ])

  const selectedNode =
    nodes.find((node) => node.selected) ?? null

  const selectedEdge =
    edges.find((edge) => edge.selected) ?? null


  const handleCalculationBasisChange = (nextBasis) => {
    if (nextBasis === calculationBasis) {
      return
    }

    if (nextBasis === 'molar' && !molarBasisAvailable) {
      return
    }

    const hasStreamValues = edges.some(edgeHasSpecifications)

    if (
      hasStreamValues &&
      !window.confirm(
        'Changing the calculation basis will clear all stream specifications and calculated values. Continue?',
      )
    ) {
      return
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) => resetEdgeSpecifications(edge, components)),
    )
    onCalculationBasisChange(nextBasis)
  }

  const onConnect = useCallback(
    (connection) => {
      const streamName = getDefaultStreamName()

      setEdges((currentEdges) => {
        const edgeId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const sourceNode = nodes.find((node) => node.id === connection.source)
        const targetNode = nodes.find((node) => node.id === connection.target)
        const sourceHandle = sourceNode?.type === 'operationNode' ? `output-${edgeId}` : connection.sourceHandle
        const targetHandle = targetNode?.type === 'operationNode' ? `input-${edgeId}` : connection.targetHandle

        return addEdge(
          {
            ...connection,
            id: edgeId,
            sourceHandle,
            targetHandle,
            type: 'smoothstep',
            label: streamName,
            data: {
              label: streamName,
              compositionInput: 'fraction',
              totalFlow: '',
              composition: createInitialStreamComposition(components),
              calculatedFields:
                components.length === 1
                  ? [components[0].id]
                  : [],
              remainingValue: null,
              validationMessage: '',
              color: '#64748b',
              sourcePortPosition: sourceNode?.type === 'operationNode'
                ? { side: 'right', offset: 50 }
                : null,
              targetPortPosition: targetNode?.type === 'operationNode'
                ? { side: 'left', offset: 50 }
                : null,
            },
            style: { stroke: '#64748b' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          },
          currentEdges,
        )
      })
    },
    [setEdges, components, nodes],
  )

  const isValidConnection = useCallback(
    (connection) => {
      const sourceNode = nodes.find(
        (node) => node.id === connection.source,
      )
      const targetNode = nodes.find(
        (node) => node.id === connection.target,
      )

      if (!sourceNode || !targetNode) return false
      if (sourceNode.id === targetNode.id) return false

      const sourceIsAllowed =
        sourceNode.type === 'sourceNode' ||
        sourceNode.type === 'operationNode'
      const targetIsAllowed =
        targetNode.type === 'operationNode' ||
        targetNode.type === 'sinkNode'

      if (!sourceIsAllowed || !targetIsAllowed) {
        return false
      }

      const duplicateConnection = edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target &&
          edge.sourceHandle === connection.sourceHandle &&
          edge.targetHandle === connection.targetHandle,
      )

      if (duplicateConnection) return false

      if (
        sourceNode.type === 'sourceNode' &&
        edges.some((edge) => edge.source === sourceNode.id)
      ) {
        return false
      }

      if (
        targetNode.type === 'sinkNode' &&
        edges.some((edge) => edge.target === targetNode.id)
      ) {
        return false
      }

      return true
    },
    [nodes, edges],
  )

  const onEdgeClick = useCallback(
    (event, clickedEdge) => {
      event.stopPropagation()

      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          selected: edge.id === clickedEdge.id,
        })),
      )
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: false,
        })),
      )
    },
    [setEdges, setNodes],
  )

  const onPaneClick = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: false,
      })),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        selected: false,
      })),
    )
  }, [setNodes, setEdges])

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData(
      'application/reactflow',
      nodeType,
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const validateElementName = useCallback(
    (elementId, newName) => {
      const cleanName = newName.trim()

      if (!cleanName) {
        return {
          success: false,
          message: 'Name is required.',
        }
      }

      const normalizedName = cleanName.toLowerCase()
      const duplicatedNodeName = nodes.some((node) =>
        node.id !== elementId &&
        (node.data?.label ?? '').trim().toLowerCase() ===
          normalizedName,
      )
      const duplicatedStreamName = edges.some((edge) =>
        edge.id !== elementId &&
        (edge.data?.label ?? edge.label ?? '')
          .trim()
          .toLowerCase() === normalizedName,
      )

      if (duplicatedNodeName || duplicatedStreamName) {
        return {
          success: false,
          message: 'This name is already in use.',
        }
      }

      return {
        success: true,
        cleanName,
        message: '',
      }
    },
    [nodes, edges],
  )

  const updateNodeName = useCallback(
    (currentNodeId, newName) => {
      const validation = validateElementName(
        currentNodeId,
        newName,
      )

      if (!validation.success) return validation

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === currentNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: validation.cleanName,
                },
              }
            : node,
        ),
      )

      return validation
    },
    [setNodes, validateElementName],
  )

  const updateOperationImage = useCallback(
    (currentNodeId, imageData) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === currentNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  image: imageData,
                },
              }
            : node,
        ),
      )
    },
    [setNodes],
  )


  const updateStreamPortPosition = useCallback(
    (edgeId, endpoint, position) => {
      setEdges((currentEdges) => currentEdges.map((edge) => (
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                [endpoint === 'source' ? 'sourcePortPosition' : 'targetPortPosition']: position,
              },
            }
          : edge
      )))
    },
    [setEdges],
  )


  const removeOperationImage = useCallback(
    (currentNodeId) => {
      updateOperationImage(currentNodeId, null)
    },
    [updateOperationImage],
  )

  const deleteNode = useCallback(
    (currentNodeId) => {
      setNodes((currentNodes) =>
        currentNodes.filter(
          (node) => node.id !== currentNodeId,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            edge.source !== currentNodeId &&
            edge.target !== currentNodeId,
        ),
      )
    },
    [setNodes, setEdges],
  )

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()

      const nodeType = event.dataTransfer.getData(
        'application/reactflow',
      )

      if (!nodeType) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: {
          label: getDefaultNodeName(nodeType),
          image: null,
          onNameChange: updateNodeName,
          onImageChange: updateOperationImage,
          ...(nodeType === 'operationNode' ? {
            onStreamPortPositionChange: updateStreamPortPosition,
          } : {}),
        },
        ...(nodeType === 'operationNode'
          ? {
              style: {
                width: 180,
                height: 120,
              },
            }
          : {}),
      }

      setNodes((currentNodes) => [
        ...currentNodes,
        newNode,
      ])
    },
    [
      screenToFlowPosition,
      setNodes,
      updateNodeName,
      updateOperationImage,
      updateStreamPortPosition,
    ],
  )

  const onNodeClick = useCallback(
    (event, clickedNode) => {
      event.stopPropagation()

      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === clickedNode.id,
        })),
      )
      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          selected: false,
        })),
      )
    },
    [setNodes, setEdges],
  )

  const updateStreamName = useCallback(
    (edgeId, newName) => {
      const validation = validateElementName(edgeId, newName)

      if (!validation.success) return validation

      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                label: validation.cleanName,
                data: {
                  ...edge.data,
                  label: validation.cleanName,
                },
              }
            : edge,
        ),
      )

      return validation
    },
    [setEdges, validateElementName],
  )

  const updateStreamData = useCallback(
    (edgeId, changes) => {
      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          if (edge.id !== edgeId) return edge

          const nextColor = changes.color ?? edge.data?.color ?? '#64748b'

          return {
            ...edge,
            data: {
              ...edge.data,
              ...changes,
            },
            ...(changes.color
              ? {
                  style: { ...edge.style, stroke: nextColor },
                  markerEnd: { type: MarkerType.ArrowClosed, color: nextColor },
                }
              : {}),
          }
        }),
      )
    },
    [setEdges],
  )

  const deleteEdge = useCallback(
    (edgeId) => {
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.id !== edgeId),
      )
    },
    [setEdges],
  )


  const flowNodes = useMemo(() => nodes.map((node) => {
    if (node.type !== 'operationNode') return node

    const inputPorts = edges
      .filter((edge) => edge.target === node.id)
      .map((edge, index) => ({
        edgeId: edge.id,
        label: edge.data?.label ?? edge.label,
        position: edge.data?.targetPortPosition ?? { side: 'left', offset: 25 + index * 15 },
      }))
    const outputPorts = edges
      .filter((edge) => edge.source === node.id)
      .map((edge, index) => ({
        edgeId: edge.id,
        label: edge.data?.label ?? edge.label,
        position: edge.data?.sourcePortPosition ?? { side: 'right', offset: 25 + index * 15 },
      }))

    return {
      ...node,
      data: {
        ...node.data,
        inputPorts,
        outputPorts,
        onStreamPortPositionChange: updateStreamPortPosition,
      },
    }
  }), [edges, nodes, updateStreamPortPosition])


  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Blocks</h2>
        <p className="sidebar-help">
          Drag a block into the canvas.
        </p>

        <div
          className="palette-item"
          draggable
          onDragStart={(event) =>
            onDragStart(event, 'sourceNode')
          }
        >
          <div className="palette-source" />
          <span>Source</span>
        </div>

        <div
          className="palette-item"
          draggable
          onDragStart={(event) =>
            onDragStart(event, 'operationNode')
          }
        >
          <div className="palette-operation">×</div>
          <span>Unit Operation</span>
        </div>

        <div
          className="palette-item"
          draggable
          onDragStart={(event) =>
            onDragStart(event, 'sinkNode')
          }
        >
          <div className="palette-sink" />
          <span>Sink</span>
        </div>
      </aside>

      <section className="flowsheet-workspace">
        <div className="calculation-basis-bar">
          <div>
            <div className="calculation-basis-title">
              Calculation Basis
            </div>
            <div className="calculation-basis-help">
              Applies to every stream in the flowsheet.
            </div>
          </div>

          <div className="basis-toggle" role="group" aria-label="Calculation basis">
            <button
              type="button"
              className={calculationBasis === 'mass' ? 'active' : ''}
              onClick={() => handleCalculationBasisChange('mass')}
            >
              Mass
            </button>
            <button
              type="button"
              className={calculationBasis === 'molar' ? 'active' : ''}
              disabled={!molarBasisAvailable}
              title={
                molarBasisAvailable
                  ? ''
                  : 'Molar basis requires a valid Molecular Weight for every component.'
              }
              onClick={() => handleCalculationBasisChange('molar')}
            >
              Molar
            </button>
          </div>
        </div>

        {!molarBasisAvailable && (
          <div className="basis-warning">
            Molar basis becomes available when every component has a valid Molecular Weight.
          </div>
        )}

        <main className="canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            deleteKeyCode={isActive ? ['Backspace', 'Delete'] : null}
            edgesFocusable
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </main>
      </section>

      <PropertiesPanel
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        nodes={nodes}
        edges={edges}
        components={components}
        calculationBasis={calculationBasis}
        onNodeNameChange={updateNodeName}
        onStreamNameChange={updateStreamName}
        onStreamDataChange={updateStreamData}
        onImageChange={updateOperationImage}
        onRemoveImage={removeOperationImage}
        onDeleteNode={deleteNode}
        onDeleteEdge={deleteEdge}
      />
    </div>
  )
}

function PlaceholderPage({ title, description }) {
  return (
    <main className="placeholder-page">
      <div className="placeholder-card">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </main>
  )
}

const PROJECT_FORMAT = 'chemeflow-project'
const PROJECT_VERSION = 1

async function saveProjectFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })

  if (window.isSecureContext && typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: 'ChemEFlow project',
        accept: { 'application/json': ['.json'] },
      }],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function cleanProjectNodes(items = []) {
  return items.map((item) => ({ ...item, selected: false }))
}

function restoreProjectEdges(items = [], projectNodes = []) {
  const nodeTypesById = new Map(projectNodes.map((node) => [node.id, node.type]))
  return items.map((item, index) => {
    const edgeId = item.id || `stream-restored-${index + 1}`
    const sourceIsOperation = nodeTypesById.get(item.source) === 'operationNode'
    const targetIsOperation = nodeTypesById.get(item.target) === 'operationNode'
    return {
      ...item,
      id: edgeId,
      selected: false,
      sourceHandle: sourceIsOperation ? `output-${edgeId}` : item.sourceHandle,
      targetHandle: targetIsOperation ? `input-${edgeId}` : item.targetHandle,
      data: {
        ...item.data,
        sourcePortPosition: sourceIsOperation
          ? (item.data?.sourcePortPosition ?? { side: 'right', offset: 50 })
          : null,
        targetPortPosition: targetIsOperation
          ? (item.data?.targetPortPosition ?? { side: 'left', offset: 50 })
          : null,
      },
    }
  })
}

function App() {
  const [activeTab, setActiveTab] = useState('components')
  const [resultsSnapshot, setResultsSnapshot] = useState(null)
  const externalFingerprintRef = useRef('')
  const projectFileInputRef = useRef(null)
  const [equationProjectNodes, setEquationProjectNodes] = useState([])
  const [projectLoadVersion, setProjectLoadVersion] = useState(0)
  const [components, setComponents] = useState([])
  const [streamCount, setStreamCount] = useState(0)
  const [componentStructureVersion, setComponentStructureVersion] =
    useState(0)
  const [calculationBasis, setCalculationBasis] =
    useState('mass')
  const [nodes, setNodes, onNodesChange] =
    useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] =
    useEdgesState(initialEdges)

  const hasInvalidMolecularWeight = components.some(
    (component) => {
      if (!component.hasMolecularWeight) return false

      const molecularWeight = Number(component.molecularWeight)

      return (
        component.molecularWeight === '' ||
        !Number.isFinite(molecularWeight) ||
        molecularWeight <= 0
      )
    },
  )

  const hasEmptyComponentName = components.some(
    (component) => !component.name.trim(),
  )

  const normalizedComponentNames = components.map(
    (component) => component.name.trim().toLowerCase(),
  )

  const hasDuplicateComponentNames =
    new Set(normalizedComponentNames).size !==
    normalizedComponentNames.length

  const invalidStreams = edges.filter(
    (edge) => (edge.data?.validationMessage ?? '').trim(),
  )

  const allComponentsHaveValidMolecularWeight =
    components.length > 0 &&
    components.every((component) => {
      const molecularWeight = Number(component.molecularWeight)

      return (
        component.hasMolecularWeight &&
        component.molecularWeight !== '' &&
        Number.isFinite(molecularWeight) &&
        molecularWeight > 0
      )
    })

  const externalFingerprint = useMemo(() => JSON.stringify({ components, edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, data: edge.data })), nodes: nodes.map((node) => ({ id: node.id, type: node.type, data: node.data })), calculationBasis }), [calculationBasis, components, edges, nodes])

  useEffect(() => {
    if (!externalFingerprintRef.current) {
      externalFingerprintRef.current = externalFingerprint
      return
    }
    if (externalFingerprintRef.current !== externalFingerprint) {
      externalFingerprintRef.current = externalFingerprint
      setResultsSnapshot(null)
      if (activeTab === 'results') setActiveTab('equations')
    }
  }, [activeTab, externalFingerprint])

  const handleModelSolved = useCallback((snapshot) => {
    const enriched = { ...snapshot, calculationBasis, tables: buildResultsTables({ ...snapshot, calculationBasis }, components) }
    setResultsSnapshot(enriched)
  }, [calculationBasis, components])

  const handleModelInvalidated = useCallback(() => {
    setResultsSnapshot(null)
    setActiveTab((current) => current === 'results' ? 'equations' : current)
  }, [])

  const confirmComponentStructureChange = () => {
    if (streamCount === 0) return true

    return window.confirm(
      'Changing the component list will reset all stream composition data. Continue?',
    )
  }

  const addComponent = () => {
    if (!confirmComponentStructureChange()) return

    setComponents((currentComponents) => {
      const usedNumbers = currentComponents.map((component) => {
        const match = component.name.match(/^Component (\d+)$/)
        return match ? Number(match[1]) : 0
      })
      const newComponentNumber =
        Math.max(0, ...usedNumbers) + 1

      return [
        ...currentComponents,
        {
          id: getComponentId(),
          name: `Component ${newComponentNumber}`,
          hasMolecularWeight: false,
          molecularWeight: '',
        },
      ]
    })

    setComponentStructureVersion(
      (currentVersion) => currentVersion + 1,
    )
  }

  const updateComponent = (componentId, changes) => {
    setComponents((currentComponents) =>
      currentComponents.map((component) =>
        component.id === componentId
          ? { ...component, ...changes }
          : component,
      ),
    )
  }

  const changeComponentProperty = (
    componentId,
    changes,
  ) => {
    if (
      streamCount > 0 &&
      !window.confirm(
        'Changing component properties will reset all stream specifications. Continue?',
      )
    ) {
      return false
    }

    updateComponent(componentId, changes)

    setComponentStructureVersion(
      (currentVersion) => currentVersion + 1,
    )

    return true
  }

  const deleteComponent = (componentId) => {
    if (!confirmComponentStructureChange()) return

    setComponents((currentComponents) =>
      currentComponents.filter(
        (component) => component.id !== componentId,
      ),
    )
    setComponentStructureVersion(
      (currentVersion) => currentVersion + 1,
    )
  }

  const clearFlowsheetSelection = () => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false })),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({ ...edge, selected: false })),
    )
  }

  const handleTabChange = (nextTab) => {
    clearFlowsheetSelection()

    if (nextTab === 'components') {
      setActiveTab('components')
      return
    }

    if (components.length === 0) {
      window.alert(
        'Declare at least one component before continuing.',
      )
      setActiveTab('components')
      return
    }

    if (hasEmptyComponentName) {
      window.alert(
        'Every component must have a name before continuing.',
      )
      setActiveTab('components')
      return
    }

    if (hasDuplicateComponentNames) {
      window.alert(
        'Component names must be unique before continuing.',
      )
      setActiveTab('components')
      return
    }

    if (hasInvalidMolecularWeight) {
      window.alert(
        'Complete or remove every invalid Molecular Weight property before continuing.',
      )
      setActiveTab('components')
      return
    }

    if (nextTab === 'results' && !resultsSnapshot) {
      window.alert('Results are available only after the global Solve reports Model solved.')
      setActiveTab('equations')
      return
    }

    if (
      ['equations', 'results'].includes(nextTab) &&
      invalidStreams.length > 0
    ) {
      const streamNames = invalidStreams
        .map((edge) => edge.data?.label ?? edge.label ?? 'Unnamed stream')
        .join(', ')

      window.alert(
        `Resolve the stream validation errors before continuing: ${streamNames}.`,
      )
      setActiveTab('flowsheet')
      return
    }

    setActiveTab(nextTab)
  }

  const handleEquationProjectNodesChange = useCallback((nextNodes) => {
    setEquationProjectNodes(nextNodes)
  }, [])

  const saveProject = useCallback(async () => {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const project = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: now.toISOString(),
      app: 'ChemEFlow',
      model: {
        components,
        calculationBasis,
        nodes: cleanProjectNodes(nodes),
        edges: cleanProjectNodes(edges),
        equationNodes: cleanProjectNodes(equationProjectNodes),
      },
    }
    try {
      await saveProjectFile(`chemeflow_project_${date}.chemeflow.json`, project)
    } catch (error) {
      if (error?.name === 'AbortError') return
      console.error('Could not save the ChemEFlow project:', error)
      window.alert(`Could not save the project. ${error?.message ?? 'Unknown save error.'}`)
    }
  }, [calculationBasis, components, edges, equationProjectNodes, nodes])

  const requestOpenProject = useCallback(() => {
    projectFileInputRef.current?.click()
  }, [])

  const openProjectFile = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const project = JSON.parse(await file.text())
      if (project?.format !== PROJECT_FORMAT || !project?.model) {
        throw new Error('This is not a valid ChemEFlow project file.')
      }
      if (Number(project.version) > PROJECT_VERSION) {
        throw new Error('This project was created with a newer ChemEFlow format.')
      }

      const model = project.model
      if (!Array.isArray(model.components) || !Array.isArray(model.nodes) || !Array.isArray(model.edges) || !Array.isArray(model.equationNodes)) {
        throw new Error('The project file is incomplete or damaged.')
      }

      if ((components.length || nodes.length || edges.length || equationProjectNodes.length)
        && !window.confirm('Opening a project will replace the current model. Continue?')) {
        return
      }

      setResultsSnapshot(null)
      setComponents(model.components)
      setCalculationBasis(model.calculationBasis === 'molar' ? 'molar' : 'mass')
      setNodes(cleanProjectNodes(model.nodes))
      setEdges(restoreProjectEdges(model.edges, model.nodes))
      setEquationProjectNodes(cleanProjectNodes(model.equationNodes))
      setStreamCount(model.edges.length)
      // Do not trigger the component-structure reset here: the loaded edges
      // already contain the saved stream specifications and calculated fields.
      setProjectLoadVersion((value) => value + 1)
      externalFingerprintRef.current = ''
      setActiveTab('components')

      const loadedNodeNumbers = model.nodes
        .map((node) => Number(String(node.id).match(/^node-(\d+)$/)?.[1] ?? 0))
      nodeId = Math.max(nodeId, 0, ...loadedNodeNumbers)
      const loadedStreamNumbers = model.edges
        .map((edge) => Number(String(edge.data?.label ?? edge.label ?? '').match(/(?:Stream\s*)?(\d+)$/i)?.[1] ?? 0))
      streamCounter = Math.max(streamCounter, model.edges.length, ...loadedStreamNumbers)

      window.alert('Project opened. Press Solve again to generate current Results.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The project could not be opened.')
    }
  }, [components.length, edges.length, equationProjectNodes.length, nodes.length, setEdges, setNodes])

  return (
    <div className="application-shell">
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        resultsEnabled={Boolean(resultsSnapshot)}
        onSaveProject={saveProject}
        onOpenProject={requestOpenProject}
      />
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,.chemeflow.json,application/json"
        className="project-file-input"
        onChange={openProjectFile}
      />

      <div className="application-content">
        <div
          className={`tab-page ${
            activeTab === 'components' ? 'active' : ''
          }`}
        >
          <ComponentsPage
            components={components}
            onAddComponent={addComponent}
            onUpdateComponent={updateComponent}
            onChangeComponentProperty={changeComponentProperty}
            onDeleteComponent={deleteComponent}
          />
        </div>

        <div
          className={`tab-page ${
            activeTab === 'flowsheet' ? 'active' : ''
          }`}
        >
          <ReactFlowProvider>
            <FlowEditor
              isActive={activeTab === 'flowsheet'}
              components={components}
              componentStructureVersion={componentStructureVersion}
              calculationBasis={calculationBasis}
              molarBasisAvailable={allComponentsHaveValidMolecularWeight}
              onCalculationBasisChange={setCalculationBasis}
              onStreamCountChange={setStreamCount}
              nodes={nodes}
              setNodes={setNodes}
              onNodesChange={onNodesChange}
              edges={edges}
              setEdges={setEdges}
              onEdgesChange={onEdgesChange}
            />
          </ReactFlowProvider>
        </div>

        <div
          className={`tab-page ${
            activeTab === 'equations' ? 'active' : ''
          }`}
        >
          <EquationsPage
            isActive={activeTab === 'equations'}
            components={components}
            edges={edges}
            calculationBasis={calculationBasis}
            onSolved={handleModelSolved}
            onInvalidated={handleModelInvalidated}
            projectNodes={equationProjectNodes}
            projectLoadVersion={projectLoadVersion}
            onProjectNodesChange={handleEquationProjectNodesChange}
          />
        </div>

        <div
          className={`tab-page ${
            activeTab === 'results' ? 'active' : ''
          }`}
        >
          <ResultsPage snapshot={resultsSnapshot} />
        </div>
      </div>
    </div>
  )
}

export default App
