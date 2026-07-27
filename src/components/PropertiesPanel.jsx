import {
  useEffect,
  useRef,
  useState,
} from 'react'

const EPSILON = 1e-9

function formatCalculatedValue(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return ''
  }

  return numericValue.toFixed(4)
}

function getNodeTypeLabel(nodeType) {
  if (nodeType === 'sourceNode') return 'Source'
  if (nodeType === 'sinkNode') return 'Sink'
  if (nodeType === 'operationNode') return 'Unit Operation'
  return 'Unknown'
}

function createCompositionCopy(composition, components) {
  return Object.fromEntries(
    components.map((component) => {
      const current = composition?.[component.id] ?? {}

      return [
        component.id,
        {
          fraction: current.fraction ?? '',
          componentFlow: current.componentFlow ?? '',
        },
      ]
    }),
  )
}

function createEmptyComposition(components) {
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

function releaseCalculatedFields({
  totalFlow,
  composition,
  calculatedFields = [],
}) {
  let nextTotalFlow = totalFlow ?? ''
  const nextComposition = { ...composition }

  calculatedFields.forEach((fieldId) => {
    if (fieldId === 'totalFlow') {
      nextTotalFlow = ''
      return
    }

    if (nextComposition[fieldId]) {
      nextComposition[fieldId] = {
        ...nextComposition[fieldId],
        fraction: '',
        componentFlow: '',
      }
    }
  })

  return {
    totalFlow: nextTotalFlow,
    composition: nextComposition,
  }
}

function solveComponentFlowInput({
  totalFlow,
  composition,
  components,
  previousCalculatedFields = [],
}) {
  const released = releaseCalculatedFields({
    totalFlow,
    composition: createCompositionCopy(
      composition,
      components,
    ),
    calculatedFields: previousCalculatedFields,
  })

  let nextTotalFlow = released.totalFlow
  const nextComposition = released.composition

  const entries = components.map((component) => ({
    componentId: component.id,
    componentFlow:
      nextComposition[component.id]?.componentFlow ?? '',
  }))

  const emptyEntries = entries.filter(
    (entry) => entry.componentFlow === '',
  )

  const specifiedFlow = entries.reduce(
    (sum, entry) =>
      sum + Number(entry.componentFlow || 0),
    0,
  )

  let calculatedFields = []
  let remainingValue = null
  let validationMessage = ''

  const hasTotal = nextTotalFlow !== ''
  const numericTotal = Number(nextTotalFlow || 0)

  /* Calculate the total when every component flow is known. */
  if (
    !hasTotal &&
    components.length > 0 &&
    emptyEntries.length === 0
  ) {
    nextTotalFlow = String(specifiedFlow)
    calculatedFields = ['totalFlow']
  }

  /* Calculate the only missing component flow from the total. */
  if (hasTotal && emptyEntries.length === 1) {
    const missingValue = numericTotal - specifiedFlow

    if (missingValue < -EPSILON) {
      validationMessage =
        'Component flows exceed the total flow.'
    } else {
      const missingId = emptyEntries[0].componentId

      nextComposition[missingId] = {
        ...nextComposition[missingId],
        componentFlow: String(Math.max(0, missingValue)),
      }

      calculatedFields = [missingId]
    }
  }

  /* Report the undistributed flow when several values are missing. */
  if (hasTotal && emptyEntries.length >= 2) {
    remainingValue = numericTotal - specifiedFlow

    if (remainingValue < -EPSILON) {
      validationMessage =
        'Component flows exceed the total flow.'
    }
  }

  const solvedTotal = Number(nextTotalFlow || 0)

  /* Derive fractions from component and total flows. */
  components.forEach((component) => {
    const current = nextComposition[component.id]
    const flow = current.componentFlow

    nextComposition[component.id] = {
      ...current,
      fraction:
        components.length === 1
          ? '1'
          : solvedTotal > 0 && flow !== ''
            ? String(Number(flow) / solvedTotal)
            : '',
    }
  })

  return {
    totalFlow: nextTotalFlow,
    composition: nextComposition,
    calculatedFields,
    remainingValue,
    validationMessage,
  }
}

function solveFractionInput({
  totalFlow,
  composition,
  components,
  previousCalculatedFields = [],
}) {
  const released = releaseCalculatedFields({
    totalFlow,
    composition: createCompositionCopy(
      composition,
      components,
    ),
    calculatedFields: previousCalculatedFields,
  })

  const nextTotalFlow = released.totalFlow
  const nextComposition = released.composition

  const entries = components.map((component) => ({
    componentId: component.id,
    fraction:
      nextComposition[component.id]?.fraction ?? '',
  }))

  const emptyEntries = entries.filter(
    (entry) => entry.fraction === '',
  )

  const specifiedFraction = entries.reduce(
    (sum, entry) => sum + Number(entry.fraction || 0),
    0,
  )

  let calculatedFields = []
  let remainingValue = null
  let validationMessage = ''

  /* A one-component stream is always pure. */
  if (components.length === 1) {
    const onlyComponentId = components[0].id

    nextComposition[onlyComponentId] = {
      ...nextComposition[onlyComponentId],
      fraction: '1',
      componentFlow:
        nextTotalFlow !== ''
          ? String(Number(nextTotalFlow))
          : '',
    }

    return {
      totalFlow: nextTotalFlow,
      composition: nextComposition,
      calculatedFields: [onlyComponentId],
      remainingValue: null,
      validationMessage: '',
    }
  }

  /* Calculate the only missing fraction as the complement to one. */
  if (emptyEntries.length === 1) {
    const missingValue = 1 - specifiedFraction

    if (missingValue < -EPSILON) {
      validationMessage = 'Fractions exceed 1.'
    } else {
      const missingId = emptyEntries[0].componentId

      nextComposition[missingId] = {
        ...nextComposition[missingId],
        fraction: String(Math.max(0, missingValue)),
      }

      calculatedFields = [missingId]
    }
  }

  /* Fill every remaining fraction with zero when the specified sum is one. */
  if (
    emptyEntries.length >= 2 &&
    Math.abs(1 - specifiedFraction) <= EPSILON
  ) {
    emptyEntries.forEach((entry) => {
      nextComposition[entry.componentId] = {
        ...nextComposition[entry.componentId],
        fraction: '0',
      }
    })

    calculatedFields = emptyEntries.map(
      (entry) => entry.componentId,
    )
  }

  /* Report the undistributed fraction when several values are missing. */
  if (
    emptyEntries.length >= 2 &&
    Math.abs(1 - specifiedFraction) > EPSILON
  ) {
    remainingValue = 1 - specifiedFraction

    if (remainingValue < -EPSILON) {
      validationMessage = 'Fractions exceed 1.'
    }
  }

  const numericTotal = Number(nextTotalFlow || 0)

  /* Derive component flows whenever the total flow is available. */
  components.forEach((component) => {
    const current = nextComposition[component.id]
    const fraction = current.fraction

    nextComposition[component.id] = {
      ...current,
      componentFlow:
        nextTotalFlow !== '' && fraction !== ''
          ? String(numericTotal * Number(fraction))
          : '',
    }
  })

  return {
    totalFlow: nextTotalFlow,
    composition: nextComposition,
    calculatedFields,
    remainingValue,
    validationMessage,
  }
}

function PropertiesPanel({
  selectedNode,
  selectedEdge,
  nodes,
  edges = [],
  components = [],
  calculationBasis = 'mass',
  onNodeNameChange,
  onStreamNameChange,
  onStreamDataChange,
  onImageChange,
  onRemoveImage,
  onDeleteNode,
  onDeleteEdge,
}) {
  const fileInputRef = useRef(null)
  const [draftName, setDraftName] = useState('')
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (selectedNode) {
      setDraftName(selectedNode.data.label ?? '')
      setNameError('')
      return
    }

    if (selectedEdge) {
      setDraftName(
        selectedEdge.data?.label ??
          selectedEdge.label ??
          '',
      )
      setNameError('')
      return
    }

    setDraftName('')
    setNameError('')
  }, [
    selectedNode?.id,
    selectedNode?.data.label,
    selectedEdge?.id,
    selectedEdge?.data?.label,
    selectedEdge?.label,
  ])

  const getNodeName = (nodeId) => {
    const node = nodes.find(
      (currentNode) => currentNode.id === nodeId,
    )

    return node?.data?.label ?? 'Unknown'
  }

  const getConnectedStreams = (nodeId, direction) => {
    return edges.filter((edge) =>
      direction === 'inlet'
        ? edge.target === nodeId
        : edge.source === nodeId,
    )
  }

  const renderConnectionList = (title, connectedEdges) => (
    <div className="connection-group">
      <div className="connection-heading">{title}</div>
      {connectedEdges.length === 0 ? (
        <div className="connection-empty">None</div>
      ) : (
        <div className="connection-list">
          {connectedEdges.map((edge) => (
            <div className="connection-item" key={edge.id}>
              <span
                className="connection-color"
                style={{ backgroundColor: edge.data?.color ?? '#64748b' }}
              />
              <span>{edge.data?.label ?? edge.label ?? 'Stream'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const saveName = () => {
    let result

    if (selectedNode) {
      result = onNodeNameChange(
        selectedNode.id,
        draftName,
      )
    } else if (selectedEdge) {
      result = onStreamNameChange(
        selectedEdge.id,
        draftName,
      )
    } else {
      return
    }

    if (!result.success) {
      setNameError(result.message)
      return
    }

    setDraftName(result.cleanName)
    setNameError('')
  }

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }

    if (event.key === 'Escape') {
      if (selectedNode) {
        setDraftName(selectedNode.data.label)
      }

      if (selectedEdge) {
        setDraftName(
          selectedEdge.data?.label ??
            selectedEdge.label ??
            '',
        )
      }

      setNameError('')
      event.currentTarget.blur()
    }
  }

  const openImagePicker = () => {
    fileInputRef.current?.click()
  }

  const handleImageFile = (event) => {
    const file = event.target.files?.[0]

    if (!file || !selectedNode) return
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()

    reader.onload = () => {
      onImageChange(selectedNode.id, reader.result)
    }

    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const quantityBasis = calculationBasis

  const compositionInput =
    selectedEdge?.data?.compositionInput ?? 'fraction'

  const totalFlow =
    selectedEdge?.data?.totalFlow ?? ''

  const calculatedFields =
    selectedEdge?.data?.calculatedFields ?? []

  const flowUnit =
    quantityBasis === 'mass' ? 'kg/h' : 'kmol/h'

  const totalLabel =
    quantityBasis === 'mass'
      ? 'Total Mass Flow'
      : 'Total Molar Flow'

  const totalSymbol =
    quantityBasis === 'mass' ? 'ṁT' : 'ṅT'

  const fractionLabel =
    quantityBasis === 'mass'
      ? 'Mass Fraction'
      : 'Mole Fraction'

  const componentFlowLabel =
    quantityBasis === 'mass'
      ? 'Component Mass Flow'
      : 'Component Molar Flow'

  const fractionSymbol =
    quantityBasis === 'mass' ? 'w' : 'x'

  const componentFlowSymbol =
    quantityBasis === 'mass' ? 'ṁ' : 'ṅ'

  const solveAndSaveStream = ({
    nextTotalFlow,
    composition,
    nextCompositionInput = compositionInput,
    previousCalculatedFields = calculatedFields,
  }) => {
    if (!selectedEdge) return

    const solver =
      nextCompositionInput === 'componentFlow'
        ? solveComponentFlowInput
        : solveFractionInput

    const result = solver({
      totalFlow: nextTotalFlow,
      composition,
      components,
      previousCalculatedFields,
    })

    onStreamDataChange(selectedEdge.id, {
      totalFlow: result.totalFlow,
      composition: result.composition,
      calculatedFields: result.calculatedFields,
      remainingValue: result.remainingValue,
      validationMessage: result.validationMessage,
    })
  }

  const handleTotalFlowChange = (value) => {
    if (!selectedEdge) return

    if (value !== '') {
      const numericValue = Number(value)

      if (
        !Number.isFinite(numericValue) ||
        numericValue < 0
      ) {
        return
      }
    }

    solveAndSaveStream({
      nextTotalFlow: value,
      composition:
        selectedEdge.data?.composition ?? {},
    })
  }

  const handleComponentFlowChange = (
    componentId,
    value,
  ) => {
    if (!selectedEdge) return

    if (value !== '') {
      const numericValue = Number(value)

      if (
        !Number.isFinite(numericValue) ||
        numericValue < 0
      ) {
        return
      }
    }

    const released = releaseCalculatedFields({
      totalFlow,
      composition: createCompositionCopy(
        selectedEdge.data?.composition ?? {},
        components,
      ),
      calculatedFields,
    })

    if (value !== '' && released.totalFlow !== '') {
      const otherFlowSum = components.reduce(
        (sum, component) => {
          if (component.id === componentId) {
            return sum
          }

          return (
            sum +
            Number(
              released.composition[component.id]
                ?.componentFlow || 0,
            )
          )
        },
        0,
      )

      const availableFlow = Math.max(
        0,
        Number(released.totalFlow) - otherFlowSum,
      )

      if (Number(value) > availableFlow + EPSILON) {
        onStreamDataChange(selectedEdge.id, {
          validationMessage:
            `Component flow cannot exceed the remaining flow of ${availableFlow.toFixed(4)} ${flowUnit}.`,
        })
        return
      }
    }

    const updatedComposition = {
      ...released.composition,
      [componentId]: {
        ...released.composition[componentId],
        componentFlow: value,
      },
    }

    const result = solveComponentFlowInput({
      totalFlow: released.totalFlow,
      composition: updatedComposition,
      components,
      previousCalculatedFields: [],
    })

    onStreamDataChange(selectedEdge.id, {
      totalFlow: result.totalFlow,
      composition: result.composition,
      calculatedFields: result.calculatedFields,
      remainingValue: result.remainingValue,
      validationMessage: result.validationMessage,
    })
  }

  const handleFractionChange = (
    componentId,
    value,
  ) => {
    if (!selectedEdge) return

    if (value !== '') {
      const numericValue = Number(value)

      if (
        !Number.isFinite(numericValue) ||
        numericValue < 0 ||
        numericValue > 1
      ) {
        return
      }
    }

    const released = releaseCalculatedFields({
      totalFlow,
      composition: createCompositionCopy(
        selectedEdge.data?.composition ?? {},
        components,
      ),
      calculatedFields,
    })

    if (value !== '') {
      const otherFractionSum = components.reduce(
        (sum, component) => {
          if (component.id === componentId) {
            return sum
          }

          return (
            sum +
            Number(
              released.composition[component.id]
                ?.fraction || 0,
            )
          )
        },
        0,
      )

      const availableFraction = Math.max(
        0,
        1 - otherFractionSum,
      )

      if (Number(value) > availableFraction + EPSILON) {
        onStreamDataChange(selectedEdge.id, {
          validationMessage:
            `Fraction cannot exceed the remaining fraction of ${availableFraction.toFixed(4)}.`,
        })
        return
      }
    }

    const updatedComposition = {
      ...released.composition,
      [componentId]: {
        ...released.composition[componentId],
        fraction: value,
      },
    }

    const result = solveFractionInput({
      totalFlow: released.totalFlow,
      composition: updatedComposition,
      components,
      previousCalculatedFields: [],
    })

    onStreamDataChange(selectedEdge.id, {
      totalFlow: result.totalFlow,
      composition: result.composition,
      calculatedFields: result.calculatedFields,
      remainingValue: result.remainingValue,
      validationMessage: result.validationMessage,
    })
  }

  const handleCompositionInputChange = (newInput) => {
    if (!selectedEdge || newInput === compositionInput) {
      return
    }

    const hasExistingComposition = Object.values(
      selectedEdge.data?.composition ?? {},
    ).some(
      (data) =>
        data.fraction !== '' ||
        data.componentFlow !== '',
    )

    if (
      hasExistingComposition &&
      !window.confirm(
        'Changing the composition input will clear the current component values. Continue?',
      )
    ) {
      return
    }

    onStreamDataChange(selectedEdge.id, {
      compositionInput: newInput,
      composition: createEmptyComposition(components),
      calculatedFields:
        newInput === 'fraction' && components.length === 1
          ? [components[0].id]
          : [],
      remainingValue: null,
      validationMessage: '',
    })
  }

  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="properties-panel">
        <h2>Properties</h2>
        <div className="properties-empty">
          Select a block or stream to edit its properties.
        </div>
      </aside>
    )
  }

  const isOperation =
    selectedNode?.type === 'operationNode'

  const totalIsCalculated =
    calculatedFields.includes('totalFlow')

  return (
    <aside className="properties-panel">
      <h2>Properties</h2>

      {selectedNode && (
        <>
          <div className="property-group">
            <label className="property-label">Type</label>
            <div className="property-value readonly-property">
              {getNodeTypeLabel(selectedNode.type)}
            </div>
          </div>

          <div className="property-group">
            <label
              className="property-label"
              htmlFor="element-name"
            >
              Name
            </label>

            <input
              id="element-name"
              className={`property-input ${
                nameError ? 'input-error' : ''
              }`}
              type="text"
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value)
                setNameError('')
              }}
              onBlur={saveName}
              onKeyDown={handleNameKeyDown}
              maxLength={30}
            />

            {nameError && (
              <div className="property-name-error">
                {nameError}
              </div>
            )}
          </div>

          {isOperation && (
            <div className="property-group">
              <label className="property-label">Image</label>

              {selectedNode.data.image ? (
                <div className="property-image-preview">
                  <img
                    src={selectedNode.data.image}
                    alt={`${selectedNode.data.label} preview`}
                  />
                </div>
              ) : (
                <div className="property-image-empty">
                  No image selected.
                </div>
              )}

              <div className="property-button-row">
                <button
                  type="button"
                  className="property-button"
                  onClick={openImagePicker}
                >
                  {selectedNode.data.image
                    ? 'Change image'
                    : 'Add image'}
                </button>

                {selectedNode.data.image && (
                  <button
                    type="button"
                    className="property-button secondary"
                    onClick={() =>
                      onRemoveImage(selectedNode.id)
                    }
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleImageFile}
              />
            </div>
          )}

          <div className="property-group">
            <label className="property-label">Connections</label>
            <div className="connections-card">
              {selectedNode.type !== 'sourceNode' &&
                renderConnectionList(
                  'Inlet streams',
                  getConnectedStreams(selectedNode.id, 'inlet'),
                )}
              {selectedNode.type !== 'sinkNode' &&
                renderConnectionList(
                  'Outlet streams',
                  getConnectedStreams(selectedNode.id, 'outlet'),
                )}
            </div>
          </div>

          <button
            type="button"
            className="delete-node-button"
            onClick={() => onDeleteNode(selectedNode.id)}
          >
            Delete block
          </button>
        </>
      )}

      {selectedEdge && (
        <>
          <div className="property-group">
            <label className="property-label">Type</label>
            <div className="property-value readonly-property">Stream</div>
          </div>

          <div className="property-group">
            <label
              className="property-label"
              htmlFor="element-name"
            >
              Name
            </label>

            <input
              id="element-name"
              className={`property-input ${
                nameError ? 'input-error' : ''
              }`}
              type="text"
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value)
                setNameError('')
              }}
              onBlur={saveName}
              onKeyDown={handleNameKeyDown}
              maxLength={30}
            />

            {nameError && (
              <div className="property-name-error">
                {nameError}
              </div>
            )}
          </div>

          <div className="property-group">
            <label className="property-label" htmlFor="stream-color">
              Stream color
            </label>
            <div className="stream-color-row">
              <input
                id="stream-color"
                className="stream-color-input"
                type="color"
                value={selectedEdge.data?.color ?? '#64748b'}
                onChange={(event) =>
                  onStreamDataChange(selectedEdge.id, {
                    color: event.target.value,
                  })
                }
              />
              <span className="stream-color-value">
                {selectedEdge.data?.color ?? '#64748b'}
              </span>
            </div>
          </div>

          <div className="property-group">
            <label className="property-label">From</label>
            <div className="property-value readonly-property">
              {getNodeName(selectedEdge.source)}
            </div>
          </div>

          <div className="property-group">
            <label className="property-label">To</label>
            <div className="property-value readonly-property">
              {getNodeName(selectedEdge.target)}
            </div>
          </div>

          <div className="property-group">
            <label className="property-label">
              Calculation Basis
              <span className="readonly-badge">Read only</span>
            </label>
            <div className="property-value readonly-property">
              {quantityBasis === 'mass' ? 'Mass' : 'Molar'}
            </div>
            <div className="calculated-note">
              Change the global basis above the flowsheet.
            </div>
          </div>

          <div className="property-group">
            <label
              className="property-label"
              htmlFor="total-flow"
            >
              {totalLabel}
            </label>

            <div className="stream-input-row">
              <input
                id="total-flow"
                className={`property-input ${
                  totalIsCalculated
                    ? 'calculated-input'
                    : ''
                }`}
                type="number"
                min="0"
                step="any"
                placeholder={totalSymbol}
                value={
                  totalIsCalculated
                    ? formatCalculatedValue(totalFlow)
                    : totalFlow
                }
                readOnly={totalIsCalculated}
                onChange={(event) =>
                  handleTotalFlowChange(
                    event.target.value,
                  )
                }
              />

              <span className="stream-unit">
                {flowUnit}
              </span>
            </div>

            {totalIsCalculated && (
              <div className="calculated-note">
                Calculated
              </div>
            )}
          </div>

          <div className="property-group">
            <label
              className="property-label"
              htmlFor="composition-input"
            >
              Composition Input
            </label>

            <select
              id="composition-input"
              className="property-input"
              value={compositionInput}
              onChange={(event) =>
                handleCompositionInputChange(
                  event.target.value,
                )
              }
            >
              <option value="fraction">
                Fraction
              </option>
              <option value="componentFlow">
                Component Flow
              </option>
            </select>
          </div>

          <div className="property-group">
            <label className="property-label">
              Components
            </label>

            {components.length === 0 ? (
              <div className="properties-empty">
                No components have been declared.
              </div>
            ) : (
              <div className="stream-composition-list">
                {components.map((component, index) => {
                  const componentNumber = index + 1
                  const componentData =
                    selectedEdge.data?.composition?.[
                      component.id
                    ] ?? {
                      fraction: '',
                      componentFlow: '',
                    }

                  const componentIsCalculated =
                    calculatedFields.includes(
                      component.id,
                    )

                  return (
                    <div
                      key={component.id}
                      className="stream-component-card"
                    >
                      <div className="stream-component-name">
                        {component.name}
                      </div>

                      {compositionInput === 'fraction' ? (
                        <>
                          <label className="property-label">
                            {fractionLabel}
                          </label>

                          <input
                            className={`property-input ${
                              componentIsCalculated
                                ? 'calculated-input'
                                : ''
                            }`}
                            type="number"
                            min="0"
                            max="1"
                            step="any"
                            placeholder={`${fractionSymbol}${componentNumber}`}
                            value={
                              componentIsCalculated
                                ? formatCalculatedValue(
                                    componentData.fraction,
                                  )
                                : componentData.fraction
                            }
                            readOnly={componentIsCalculated}
                            onChange={(event) =>
                              handleFractionChange(
                                component.id,
                                event.target.value,
                              )
                            }
                          />

                          {componentIsCalculated && (
                            <div className="calculated-note">
                              Calculated
                            </div>
                          )}

                          <label className="property-label stream-calculated-label">
                            {componentFlowLabel}
                          </label>

                          <div className="property-value stream-calculated-value">
                            {componentData.componentFlow !== ''
                              ? `${formatCalculatedValue(
                                  componentData.componentFlow,
                                )} ${flowUnit}`
                              : `${componentFlowSymbol}${componentNumber}`}
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="property-label">
                            {componentFlowLabel}
                          </label>

                          <div className="stream-input-row">
                            <input
                              className={`property-input ${
                                componentIsCalculated
                                  ? 'calculated-input'
                                  : ''
                              }`}
                              type="number"
                              min="0"
                              step="any"
                              placeholder={`${componentFlowSymbol}${componentNumber}`}
                              value={
                                componentIsCalculated
                                  ? formatCalculatedValue(
                                      componentData.componentFlow,
                                    )
                                  : componentData.componentFlow
                              }
                              readOnly={componentIsCalculated}
                              onChange={(event) =>
                                handleComponentFlowChange(
                                  component.id,
                                  event.target.value,
                                )
                              }
                            />

                            <span className="stream-unit">
                              {flowUnit}
                            </span>
                          </div>

                          {componentIsCalculated && (
                            <div className="calculated-note">
                              Calculated
                            </div>
                          )}

                          <label className="property-label stream-calculated-label">
                            {fractionLabel}
                          </label>

                          <div className="property-value stream-calculated-value">
                            {componentData.fraction !== ''
                              ? formatCalculatedValue(
                                  componentData.fraction,
                                )
                              : `${fractionSymbol}${componentNumber}`}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {selectedEdge.data?.remainingValue !== null &&
            selectedEdge.data?.remainingValue !== undefined &&
            !selectedEdge.data?.validationMessage && (
              <div className="stream-status-message">
                {compositionInput === 'fraction'
                  ? `Remaining ${quantityBasis === 'mass' ? 'mass' : 'mole'} fraction: ${Number(
                      selectedEdge.data.remainingValue,
                    ).toFixed(4)}`
                  : `Remaining ${quantityBasis === 'mass' ? 'mass' : 'molar'} flow: ${Number(
                      selectedEdge.data.remainingValue,
                    ).toFixed(4)} ${flowUnit}`}
              </div>
            )}

          {selectedEdge.data?.validationMessage && (
            <div className="stream-validation-message">
              {selectedEdge.data.validationMessage}
            </div>
          )}

          <button
            type="button"
            className="delete-node-button"
            onClick={() => onDeleteEdge(selectedEdge.id)}
          >
            Delete stream
          </button>
        </>
      )}
    </aside>
  )
}

export default PropertiesPanel
