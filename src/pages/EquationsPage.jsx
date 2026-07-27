import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  NodeResizer,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'

function formatValue(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return value

  return numericValue.toFixed(4)
}

function makeVariableId(streamId, field, componentId = '') {
  return [streamId, field, componentId].filter(Boolean).join('__')
}


function formatVariableReference(variable, { includeDescription = false } = {}) {
  if (!variable) return 'Unknown variable'

  const symbol = variable.symbol || variable.name || variable.id
  if (variable.source !== 'stream') {
    return includeDescription && variable.label
      ? `${variable.label} (${symbol})`
      : symbol
  }

  const streamName = String(variable.streamName ?? '').trim() || 'Unnamed stream'
  const parts = [streamName]
  if (variable.componentName) parts.push(variable.componentName)
  parts.push(includeDescription && variable.label ? `${variable.label} (${symbol})` : symbol)
  return parts.join(' · ')
}

function compareInventoryVariables(left, right) {
  const leftIsStream = left.source === 'stream'
  const rightIsStream = right.source === 'stream'

  if (leftIsStream !== rightIsStream) return leftIsStream ? -1 : 1

  if (leftIsStream && rightIsStream) {
    const streamComparison = String(left.streamName ?? '').localeCompare(
      String(right.streamName ?? ''),
      undefined,
      { numeric: true, sensitivity: 'base' },
    )
    if (streamComparison !== 0) return streamComparison

    const componentComparison = String(left.componentName ?? '').localeCompare(
      String(right.componentName ?? ''),
      undefined,
      { numeric: true, sensitivity: 'base' },
    )
    if (componentComparison !== 0) return componentComparison

    return String(left.symbol ?? left.label ?? '').localeCompare(
      String(right.symbol ?? right.label ?? ''),
      undefined,
      { numeric: true, sensitivity: 'base' },
    )
  }

  return String(left.name ?? left.symbol ?? '').localeCompare(
    String(right.name ?? right.symbol ?? ''),
    undefined,
    { numeric: true, sensitivity: 'base' },
  )
}

function getBasisLabels(calculationBasis) {
  const isMass = calculationBasis === 'mass'

  return {
    basisName: isMass ? 'Mass' : 'Molar',
    totalFlowName: isMass ? 'Total mass flow' : 'Total molar flow',
    componentFlowName: isMass
      ? 'Component mass flow'
      : 'Component molar flow',
    fractionName: isMass ? 'Mass fraction' : 'Mole fraction',
    totalSymbol: isMass ? 'ṁT' : 'ṅT',
    componentFlowSymbol: isMass ? 'ṁi' : 'ṅi',
    fractionSymbol: isMass ? 'wi' : 'xi',
    flowUnit: isMass ? 'kg/h' : 'kmol/h',
  }
}

function buildVariableRegistry(edges, components, calculationBasis) {
  const labels = getBasisLabels(calculationBasis)
  const registry = []

  const addVariable = ({
    edge,
    field,
    component = null,
    label,
    symbol,
    unit,
    value,
    status,
    relation = '',
  }) => {
    registry.push({
      id: makeVariableId(edge.id, field, component?.id),
      name: component
        ? `${edge.data?.label ?? edge.label ?? 'Unnamed stream'} · ${component.name} · ${label}`
        : `${edge.data?.label ?? edge.label ?? 'Unnamed stream'} · ${label}`,
      label,
      symbol,
      unit,
      value,
      status,
      source: 'stream',
      streamId: edge.id,
      streamName: edge.data?.label ?? edge.label ?? 'Unnamed stream',
      componentId: component?.id ?? null,
      componentName: component?.name ?? null,
      relation,
    })
  }

  edges.forEach((edge) => {
    const data = edge.data ?? {}
    const compositionInput = data.compositionInput ?? 'fraction'
    const calculatedFields = data.calculatedFields ?? []
    const totalFlow = data.totalFlow ?? ''

    addVariable({
      edge,
      field: 'totalFlow',
      label: labels.totalFlowName,
      symbol: labels.totalSymbol,
      unit: labels.flowUnit,
      value: totalFlow,
      status:
        totalFlow === ''
          ? 'unknown'
          : calculatedFields.includes('totalFlow')
            ? 'calculated'
            : 'specified',
      relation: calculatedFields.includes('totalFlow')
        ? `Sum of the ${labels.componentFlowName.toLowerCase()} values`
        : '',
    })

    components.forEach((component, componentIndex) => {
      const componentData = data.composition?.[component.id] ?? {}
      const componentNumber = componentIndex + 1
      const fraction = componentData.fraction ?? ''
      const componentFlow = componentData.componentFlow ?? ''
      const selectedFieldIsCalculated = calculatedFields.includes(component.id)

      const fractionIsCalculated =
        fraction !== '' &&
        (compositionInput === 'componentFlow' || selectedFieldIsCalculated)

      addVariable({
        edge,
        field: 'fraction',
        component,
        label: labels.fractionName,
        symbol: `${labels.fractionSymbol.replace('i', '')}${componentNumber}`,
        unit: 'dimensionless',
        value: fraction,
        status:
          fraction === ''
            ? 'unknown'
            : fractionIsCalculated
              ? 'calculated'
              : 'specified',
        relation: fractionIsCalculated
          ? components.length === 1
            ? 'Single-component stream: fraction = 1'
            : compositionInput === 'componentFlow'
              ? `${labels.componentFlowSymbol.replace('i', '')}${componentNumber} / ${labels.totalSymbol}`
              : 'Composition closure: 1 − sum of specified fractions'
          : '',
      })

      const componentFlowIsCalculated =
        componentFlow !== '' &&
        (compositionInput === 'fraction' || selectedFieldIsCalculated)

      addVariable({
        edge,
        field: 'componentFlow',
        component,
        label: labels.componentFlowName,
        symbol: `${labels.componentFlowSymbol.replace('i', '')}${componentNumber}`,
        unit: labels.flowUnit,
        value: componentFlow,
        status:
          componentFlow === ''
            ? 'unknown'
            : componentFlowIsCalculated
              ? 'calculated'
              : 'specified',
        relation: componentFlowIsCalculated
          ? compositionInput === 'fraction'
            ? `${labels.totalSymbol} × ${labels.fractionSymbol.replace('i', '')}${componentNumber}`
            : components.length === 1
              ? `${labels.totalSymbol}`
              : `${labels.totalSymbol} − sum of specified component flows`
          : '',
      })
    })
  })

  return {
    registry,
    known: registry.filter((variable) => variable.status === 'specified'),
    calculated: registry.filter((variable) => variable.status === 'calculated'),
    unknown: registry.filter((variable) => variable.status === 'unknown'),
    solved: registry.filter((variable) => variable.status === 'solved'),
    labels,
  }
}


function nearlyEqual(left, right, absoluteTolerance = 1e-8, relativeTolerance = 1e-8) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= absoluteTolerance + relativeTolerance * scale
}

function propagateStreamRelations(inputVariables, components) {
  const variables = inputVariables.map((variable) => ({ ...variable }))
  const variablesById = new Map(variables.map((variable) => [variable.id, variable]))
  const streamIds = [...new Set(
    variables
      .filter((variable) => variable.source === 'stream')
      .map((variable) => variable.streamId),
  )]
  const conflicts = []
  const conflictKeys = new Set()
  const tolerance = 1e-9

  const addConflict = (key, conflict) => {
    if (conflictKeys.has(key)) return
    conflictKeys.add(key)
    conflicts.push(conflict)
  }

  const numericValue = (variable) => {
    if (!variable || variable.value === '') return null
    const value = Number(variable.value)
    return Number.isFinite(value) ? value : null
  }

  const setCalculated = (variable, value, relation) => {
    if (!variable || variable.status !== 'unknown' || !Number.isFinite(value)) return false

    const isFraction = variable.id.includes('__fraction__')
    const isFlow =
      variable.id.includes('__totalFlow') ||
      variable.id.includes('__componentFlow__')

    if (isFlow && value < -tolerance) {
      addConflict(`physical:${variable.id}`, {
        streamId: variable.streamId,
        streamName: variable.streamName,
        message: `${variable.name}: calculated flow ${formatValue(value)} ${variable.unit} would be negative.`,
      })
      return false
    }

    if (isFraction && (value < -tolerance || value > 1 + tolerance)) {
      addConflict(`physical:${variable.id}`, {
        streamId: variable.streamId,
        streamName: variable.streamName,
        message: `${variable.name}: calculated fraction ${formatValue(value)} is outside 0 to 1.`,
      })
      return false
    }

    variable.value = Math.abs(value) <= tolerance ? 0 : value
    variable.status = 'calculated'
    variable.relation = relation
    return true
  }

  let changed = true
  let iteration = 0
  const maxIterations = Math.max(10, variables.length * 3)

  while (changed && iteration < maxIterations) {
    changed = false
    iteration += 1

    streamIds.forEach((streamId) => {
      const total = variablesById.get(makeVariableId(streamId, 'totalFlow'))
      const fractions = components.map((component) =>
        variablesById.get(makeVariableId(streamId, 'fraction', component.id)),
      )
      const componentFlows = components.map((component) =>
        variablesById.get(makeVariableId(streamId, 'componentFlow', component.id)),
      )

      components.forEach((component, index) => {
        const fraction = fractions[index]
        const componentFlow = componentFlows[index]
        const totalValue = numericValue(total)
        const fractionValue = numericValue(fraction)
        const componentFlowValue = numericValue(componentFlow)
        const unknowns = [total, fraction, componentFlow].filter(
          (variable) => variable?.status === 'unknown',
        )

        if (unknowns.length === 1) {
          const unknown = unknowns[0]
          if (unknown === componentFlow && totalValue !== null && fractionValue !== null) {
            changed = setCalculated(
              componentFlow,
              totalValue * fractionValue,
              `${fraction.symbol} × ${total.symbol}`,
            ) || changed
          } else if (unknown === fraction && totalValue !== null && componentFlowValue !== null) {
            if (Math.abs(totalValue) > tolerance) {
              changed = setCalculated(
                fraction,
                componentFlowValue / totalValue,
                `${componentFlow.symbol} / ${total.symbol}`,
              ) || changed
            } else if (Math.abs(componentFlowValue) > tolerance) {
              addConflict(`zero-total:${streamId}:${component.id}`, {
                streamId,
                streamName: total?.streamName,
                message: `${component.name}: a zero total flow cannot contain a nonzero component flow.`,
              })
            }
          } else if (unknown === total && fractionValue !== null && componentFlowValue !== null) {
            if (Math.abs(fractionValue) > tolerance) {
              changed = setCalculated(
                total,
                componentFlowValue / fractionValue,
                `${componentFlow.symbol} / ${fraction.symbol}`,
              ) || changed
            } else if (Math.abs(componentFlowValue) > tolerance) {
              addConflict(`zero-fraction:${streamId}:${component.id}`, {
                streamId,
                streamName: total?.streamName,
                message: `${component.name}: a zero fraction cannot correspond to a nonzero component flow.`,
              })
            }
          }
        } else if (unknowns.length === 0 && totalValue !== null && fractionValue !== null && componentFlowValue !== null) {
          const expected = totalValue * fractionValue
          if (!nearlyEqual(componentFlowValue, expected)) {
            addConflict(`component-relation:${streamId}:${component.id}`, {
              streamId,
              streamName: total?.streamName,
              message: `${component.name}: ${componentFlow.symbol} = ${formatValue(componentFlowValue)}, but ${fraction.symbol} * ${total.symbol} = ${formatValue(expected)}.`,
            })
          }
        }
      })

      const knownFractionValues = fractions.map(numericValue)
      const unknownFractions = fractions.filter((variable) => variable?.status === 'unknown')
      const knownFractionSum = knownFractionValues.reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      )

      if (unknownFractions.length === 1) {
        changed = setCalculated(
          unknownFractions[0],
          1 - knownFractionSum,
          '1 − sum of the other fractions',
        ) || changed
      } else if (unknownFractions.length === 0 && fractions.length > 0) {
        if (!nearlyEqual(knownFractionSum, 1)) {
          addConflict(`fraction-closure:${streamId}`, {
            streamId,
            streamName: total?.streamName,
            message: `Fraction closure: sum = ${formatValue(knownFractionSum)}, expected 1.0000.`,
          })
        }
      }

      const totalValue = numericValue(total)
      const knownFlowValues = componentFlows.map(numericValue)
      const unknownFlows = componentFlows.filter((variable) => variable?.status === 'unknown')
      const knownFlowSum = knownFlowValues.reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      )

      if (total?.status === 'unknown' && unknownFlows.length === 0) {
        changed = setCalculated(
          total,
          knownFlowSum,
          'Sum of component flows',
        ) || changed
      } else if (totalValue !== null && unknownFlows.length === 1) {
        changed = setCalculated(
          unknownFlows[0],
          totalValue - knownFlowSum,
          'Total flow − sum of the other component flows',
        ) || changed
      } else if (totalValue !== null && unknownFlows.length === 0) {
        if (!nearlyEqual(knownFlowSum, totalValue)) {
          addConflict(`flow-closure:${streamId}`, {
            streamId,
            streamName: total?.streamName,
            message: `Flow closure: component flows sum to ${formatValue(knownFlowSum)} ${total.unit}, but total flow is ${formatValue(totalValue)} ${total.unit}.`,
          })
        }
      }
    })
  }

  return { variables, conflicts }
}

function CompactVariableCard({ variable, status }) {
  return (
    <article className={`equation-variable-card compact ${status}`}>
      <div className="equation-variable-heading">
        <strong>{variable.streamName}</strong>
        <span>{variable.symbol}</span>
      </div>

      <div className="equation-variable-description">
        {variable.componentName
          ? `${variable.componentName} · ${variable.label}`
          : variable.label}
      </div>

      {status !== 'unknown' && (
        <div className="equation-variable-value">
          {formatValue(variable.value)}{' '}
          {variable.unit === 'dimensionless' ? '' : variable.unit}
        </div>
      )}

      {variable.relation && (
        <div className="equation-variable-relation">
          {variable.relation}
        </div>
      )}
    </article>
  )
}

function CompactVariableSection({ title, variables, status }) {
  return (
    <section className="equation-inventory-section">
      <div className="equation-inventory-heading">
        <h2>{title}</h2>
        <span className="equation-count">{variables.length}</span>
      </div>

      {variables.length === 0 ? (
        <div className="equation-empty-state compact">None</div>
      ) : (
        <div className="equation-variable-list compact">
          {variables.map((variable) => (
            <CompactVariableCard
              key={variable.id}
              variable={variable}
              status={status}
            />
          ))}
        </div>
      )}
    </section>
  )
}


function EditableBlockTitle({ value, onCommit }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!isEditing) setDraft(value)
  }, [isEditing, value])

  const commit = () => {
    const cleanValue = draft.trim()
    onCommit(cleanValue || value)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        className="equation-block-title-input nodrag nowheel"
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(value)
            setIsEditing(false)
          }
        }}
      />
    )
  }

  return (
    <span
      className="equation-block-title"
      title="Double-click to rename"
      onDoubleClick={(event) => {
        event.stopPropagation()
        setDraft(value)
        setIsEditing(true)
      }}
    >
      {value}
    </span>
  )
}

function VariableDeclarationNode({ id, data, selected }) {
  const validation = data.validation ?? {}
  const isSpecified = data.status === 'specified'

  const updateField = (field, value) => {
    data.onChange?.(id, field, value)
  }

  return (
    <div className={`variable-declaration-node ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={260}
        lineClassName="equation-node-resize-line"
        handleClassName="equation-node-resize-handle"
      />
      <div className="variable-declaration-node-header">
        <EditableBlockTitle
          value={data.label}
          onCommit={(value) => data.onRename?.(id, value)}
        />
        <strong>Declare</strong>
      </div>

      <div className="variable-declaration-node-body nodrag nowheel">
        <label>
          <span>Name</span>
          <input
            className={validation.name ? 'input-error' : ''}
            value={data.name ?? ''}
            placeholder="Conversion"
            onChange={(event) => updateField('name', event.target.value)}
          />
        </label>
        {validation.name && (
          <small className="declaration-error">{validation.name}</small>
        )}

        <div className="declaration-grid">
          <label>
            <span>Symbol</span>
            <input
              value={data.symbol ?? ''}
              placeholder="X"
              onChange={(event) => updateField('symbol', event.target.value)}
            />
          </label>

          <label>
            <span>Unit</span>
            <input
              value={data.unit ?? ''}
              placeholder="dimensionless"
              onChange={(event) => updateField('unit', event.target.value)}
            />
          </label>
        </div>

        {validation.symbol && (
          <small className="declaration-warning">{validation.symbol}</small>
        )}

        <label>
          <span>Status</span>
          <select
            value={data.status ?? 'unknown'}
            onChange={(event) => updateField('status', event.target.value)}
          >
            <option value="unknown">Unknown</option>
            <option value="specified">Specified</option>
          </select>
        </label>

        {isSpecified && (
          <label>
            <span>Value</span>
            <input
              className={validation.value ? 'input-error' : ''}
              type="number"
              step="any"
              value={data.value ?? ''}
              placeholder="0.80"
              onChange={(event) => updateField('value', event.target.value)}
            />
          </label>
        )}

        {validation.value && (
          <small className="declaration-error">{validation.value}</small>
        )}
      </div>
    </div>
  )
}


function LinearCoefficientCell({ value, aliases, forbiddenIds = [], onChange, ariaLabel, isB = false }) {
  const normalizedAliases = (Array.isArray(aliases) ? aliases : [])
    .filter((item) => item && item.alias)
  const forbidden = new Set(Array.isArray(forbiddenIds) ? forbiddenIds : [])
  const selectableAliases = normalizedAliases.filter((item) => (
    !forbidden.has(item.variableId)
    && (item.status !== 'unknown' || Boolean(item.producerId))
  ))
  const selectedAlias = normalizedAliases.find((item) => item.alias === value)
  const numericValue = String(value ?? '').trim() !== '' && Number.isFinite(Number(value))
  const legacyExpression = !numericValue && !selectedAlias && String(value ?? '').trim() !== ''
  const mode = selectedAlias ? 'variable' : legacyExpression ? 'expression' : 'constant'

  const changeMode = (nextMode) => {
    if (nextMode === 'variable') {
      onChange(selectableAliases[0]?.alias ?? '')
    } else {
      onChange('')
    }
  }

  return (
    <div className={`linear-coefficient-cell ${isB ? 'b' : ''}`}>
      <select
        className="linear-coefficient-kind"
        value={mode}
        aria-label={`${ariaLabel} type`}
        onChange={(event) => changeMode(event.target.value)}
      >
        <option value="constant">Constant</option>
        <option value="variable" disabled={selectableAliases.length === 0}>Variable</option>
        {legacyExpression && <option value="expression">Expression (legacy)</option>}
      </select>

      {mode === 'variable' ? (
        <select
          className="linear-coefficient-value variable"
          value={value ?? ''}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select variable</option>
          {selectableAliases.map((item) => {
            const statusLabel = item.status === 'specified'
              ? 'Known'
              : item.status === 'solved'
                ? 'Solved'
                : item.status === 'calculated'
                  ? 'Calculated'
                  : `Unknown · produced by ${item.producerLabel || 'another block'}`
            return (
              <option key={item.alias} value={item.alias}>
                {item.label} — {statusLabel}
              </option>
            )
          })}
        </select>
      ) : (
        <input
          className="linear-coefficient-value"
          type={mode === 'constant' ? 'number' : 'text'}
          step="any"
          value={value ?? ''}
          aria-label={ariaLabel}
          placeholder={mode === 'constant' ? '0' : 'Legacy expression'}
          readOnly={mode === 'expression'}
          title={mode === 'expression' ? 'This expression was created in an earlier version. Change the type to Constant or Variable to replace it.' : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

function LinearSystemNode({ id, data, selected }) {
  const size = Number(data.size ?? 2)
  const [sizeDraft, setSizeDraft] = useState(String(size))
  const variableIds = data.variableIds ?? []
  const unknownVariables = data.unknownVariables ?? []
  const assignments = data.assignments ?? new Map()
  const matrix = data.matrix ?? []
  const constants = data.constants ?? []
  const analysis = data.analysis ?? null
  const analysisStatus = data.analysisStatus ?? 'idle'
  const analysisError = data.analysisError ?? ''
  const allVariablesSelected =
    variableIds.length === size && variableIds.every(Boolean)
  const allCoefficientsComplete =
    matrix.length === size &&
    matrix.every(
      (row) => row.length === size && row.every((value) => value !== ''),
    ) &&
    constants.length === size &&
    constants.every((value) => value !== '')
  const canAnalyze = allVariablesSelected && allCoefficientsComplete

  useEffect(() => {
    setSizeDraft(String(size))
  }, [size])

  const commitSize = () => {
    const nextSize = Number(sizeDraft)

    if (!Number.isInteger(nextSize) || nextSize < 1) {
      window.alert('System size n must be a positive integer.')
      setSizeDraft(String(size))
      return
    }

    if (nextSize === size) return

    if (nextSize > 30) {
      const continueWithLargeSystem = window.confirm(
        `A ${nextSize} × ${nextSize} system contains ${nextSize * nextSize} coefficients and may be difficult to edit visually. Continue?`,
      )
      if (!continueWithLargeSystem) {
        setSizeDraft(String(size))
        return
      }
    }

    if (nextSize < size) {
      const removedVariables = variableIds.slice(nextSize).some(Boolean)
      const removedRows = matrix
        .slice(nextSize)
        .some((row) => row.some((value) => value !== ''))
      const removedColumns = matrix
        .slice(0, nextSize)
        .some((row) => row.slice(nextSize).some((value) => value !== ''))
      const removedConstants = constants.slice(nextSize).some((value) => value !== '')

      if (
        (removedVariables || removedRows || removedColumns || removedConstants) &&
        !window.confirm(
          'Reducing n will remove selected variables and matrix values outside the new system size. Continue?',
        )
      ) {
        setSizeDraft(String(size))
        return
      }
    }

    data.onSizeChange?.(id, nextSize)
  }

  const classificationLabel = {
    unique: 'Ready to solve',
    underdetermined: 'Underdetermined',
    inconsistent: 'Inconsistent',
  }

  return (
    <div className={`linear-system-node ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={430}
        minHeight={360}
        lineClassName="equation-node-resize-line"
        handleClassName="equation-node-resize-handle"
      />
      <div className="linear-system-node-header">
        <EditableBlockTitle
          value={data.label}
          onCommit={(value) => data.onRename?.(id, value)}
        />
        <strong>A·x = b</strong>
      </div>

      <div className="linear-system-node-body nodrag nowheel">
        <label className="linear-system-size-field">
          <span>System size, n</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={sizeDraft}
            onChange={(event) => setSizeDraft(event.target.value)}
            onBlur={commitSize}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                setSizeDraft(String(size))
                event.currentTarget.blur()
              }
            }}
          />
          <small>{size} × {size} system</small>
        </label>

        <div className="linear-system-variable-list">
          <div className="linear-system-section-title">Unknown variables</div>
          {Array.from({ length: size }, (_, index) => {
            const selectedId = variableIds[index] ?? ''

            return (
              <label key={index} className="linear-system-variable-field">
                <span>x{index + 1}</span>
                <select
                  value={selectedId}
                  onChange={(event) =>
                    data.onVariableChange?.(id, index, event.target.value)
                  }
                >
                  <option value="">Select an unknown</option>
                  {unknownVariables.map((variable) => {
                    const owner = assignments.get(variable.id)
                    const usedHere = selectedId === variable.id
                    const unavailable = Boolean(
                      owner && owner.id !== id && !usedHere,
                    )

                    return (
                      <option
                        key={variable.id}
                        value={variable.id}
                        disabled={unavailable}
                      >
                        {formatVariableReference(variable, { includeDescription: true })}
                        {unavailable ? ` — Assigned to ${owner.label}` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            )
          })}
        </div>

        <div className="linear-system-section-title">Coefficient matrix</div>
        <small className="linear-system-expression-help">For every value in A and b, choose a numeric constant or a variable that is available now or produced by another equation block.</small>
        <div className="linear-system-table-scroll">
          <div
            className="linear-system-table"
            style={{ '--matrix-size': size }}
          >
            <div className="linear-system-table-corner" aria-hidden="true" />
            {Array.from({ length: size }, (_, columnIndex) => (
              <div
                key={`header-${columnIndex}`}
                className="linear-system-column-heading"
              >
                x{columnIndex + 1}
              </div>
            ))}
            <div className="linear-system-column-heading b">b</div>

            {Array.from({ length: size }, (_, rowIndex) => (
              <div className="linear-system-table-row" key={`row-${rowIndex}`}>
                <div className="linear-system-row-heading">Eq{rowIndex + 1}</div>
                {Array.from({ length: size }, (_, columnIndex) => (
                  <LinearCoefficientCell
                    key={`${rowIndex}-${columnIndex}`}
                    value={matrix[rowIndex]?.[columnIndex] ?? ''}
                    aliases={data.expressionAliases}
                    forbiddenIds={variableIds}
                    ariaLabel={`a${rowIndex + 1}${columnIndex + 1}`}
                    onChange={(nextValue) =>
                      data.onMatrixChange?.(id, rowIndex, columnIndex, nextValue)
                    }
                  />
                ))}
                <LinearCoefficientCell
                  isB
                  value={constants[rowIndex] ?? ''}
                  aliases={data.expressionAliases}
                  forbiddenIds={variableIds}
                  ariaLabel={`b${rowIndex + 1}`}
                  onChange={(nextValue) =>
                    data.onConstantChange?.(id, rowIndex, nextValue)
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="linear-system-analyze-button"
          disabled={!canAnalyze || analysisStatus === 'loading'}
          onClick={() => data.onAnalyze?.(id)}
        >
          {analysisStatus === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>

        {!allVariablesSelected && (
          <small className="linear-system-requirement-message">Select exactly {size} unknown variables.</small>
        )}
        {allVariablesSelected && !allCoefficientsComplete && (
          <small className="linear-system-requirement-message">Complete every value in A and b.</small>
        )}
        {analysisError && (
          <small className="linear-system-analysis-error">{analysisError}</small>
        )}

        {analysis && (
          <div
            className={`linear-system-analysis ${
              analysis.physicalErrors?.length
                ? 'error'
                : analysis.solved && analysis.classification === 'unique'
                  ? 'solved'
                  : analysis.classification === 'unique'
                    ? 'pending'
                    : analysis.classification
            }`}
          >
            <div className="linear-system-analysis-heading">
              <strong>
                {analysis.physicalErrors?.length
                  ? 'Physically invalid result'
                  : analysis.solved && analysis.classification === 'unique'
                    ? 'Solved — unique solution'
                    : classificationLabel[analysis.classification]}
              </strong>
              <span>{analysis.engine}</span>
            </div>
            <div className="linear-system-ranks">
              <span>rank(A) = {analysis.rankA}</span>
              <span>rank([A|b]) = {analysis.rankAugmented}</span>
              <span>n = {analysis.variableCount}</span>
              {Number.isFinite(analysis.residual) && (
                <span>Residual = {analysis.residual.toExponential(3)}</span>
              )}
            </div>
            {analysis.solved && analysis.dependenciesResolved?.length > 0 && (
              <div className="linear-system-physical-errors">
                <strong>Dependencies resolved before solving:</strong>
                {analysis.dependenciesResolved.map((label) => (
                  <small key={label}>{label}</small>
                ))}
              </div>
            )}
            {analysis.physicalErrors?.length > 0 && (
              <div className="linear-system-physical-errors">
                <strong>Mathematically valid, but not physically admissible.</strong>
                {analysis.physicalErrors.map((error) => (
                  <small key={error.variableId}>{error.message}</small>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


function makeDefaultFunctionExpression() {
  return {
    operands: [],
    operators: [],
    pendingOperator: '',
  }
}

function getFunctionExpression(data) {
  if (data.expression) return data.expression
  return {
    operands: data.operands ?? makeDefaultFunctionExpression().operands,
    operators: data.operators ?? [],
    pendingOperator: data.pendingOperator ?? '',
  }
}

function isFunctionExpressionComplete(expression) {
  const operands = expression?.operands ?? []
  const operators = expression?.operators ?? []
  if (operands.length < 1 || operators.length !== operands.length - 1 || expression?.pendingOperator) return false

  return operands.every((operand) => {
    if (operand.type === 'constant') return operand.value !== '' && Number.isFinite(Number(operand.value))
    if (operand.type === 'variable') return Boolean(operand.variableId)
    if (operand.type === 'group') return isFunctionExpressionComplete(operand.expression)
    return false
  })
}

function evaluateFunctionExpression(expression, variablesById) {
  const operands = expression?.operands ?? []
  const operators = expression?.operators ?? []
  const values = operands.map((operand) => {
    if (operand.type === 'constant') {
      const value = Number(operand.value)
      return Number.isFinite(value) ? value : null
    }
    if (operand.type === 'group') {
      const nested = evaluateFunctionExpression(operand.expression, variablesById)
      return nested.status === 'ready' ? nested.value : null
    }
    const variable = variablesById.get(operand.variableId)
    const value = Number(variable?.value)
    return variable && variable.value !== '' && Number.isFinite(value) ? value : null
  })
  if (values.some((value) => value === null)) return { status: 'waiting' }

  const valueStack = [values[0]]
  const operatorStack = []
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const apply = () => {
    const operator = operatorStack.pop()
    const right = valueStack.pop()
    const left = valueStack.pop()
    if (operator === '/' && Math.abs(right) <= 1e-12) throw new Error('Division by zero.')
    valueStack.push(operator === '+' ? left + right : operator === '-' ? left - right : operator === '*' ? left * right : left / right)
  }
  operators.forEach((operator, index) => {
    while (operatorStack.length && precedence[operatorStack.at(-1)] >= precedence[operator]) apply()
    operatorStack.push(operator)
    valueStack.push(values[index + 1])
  })
  while (operatorStack.length) apply()
  return { status: 'ready', value: valueStack[0] }
}


function collectExpressionVariableIds(expression, output = new Set()) {
  ;(expression?.operands ?? []).forEach((operand) => {
    if (operand.type === 'variable' && operand.variableId) {
      output.add(operand.variableId)
    }

    if (operand.type === 'group') {
      collectExpressionVariableIds(operand.expression, output)
    }
  })

  return output
}

function getMissingExpressionVariableIds(expression, variablesById) {
  return [...collectExpressionVariableIds(expression)].filter((variableId) => {
    const variable = variablesById.get(variableId)
    if (!variable || variable.value === '') return true
    return !Number.isFinite(Number(variable.value))
  })
}

function buildFunctionDependencyAnalysis(nodes) {
  const producerByVariable = new Map()
  const functionNodes = nodes.filter((node) => node.type === 'targetFunction')
  const functionNodeIds = new Set(functionNodes.map((node) => node.id))

  nodes.forEach((node) => {
    if (node.type === 'linearSystem') {
      ;(node.data.variableIds ?? []).forEach((variableId) => {
        if (variableId) producerByVariable.set(variableId, node.id)
      })
    }

    if (node.type === 'targetFunction' && node.data.targetId) {
      producerByVariable.set(node.data.targetId, node.id)
    }
  })

  const dependenciesByNode = new Map()
  functionNodes.forEach((node) => {
    const dependencies = new Set()
    collectExpressionVariableIds(getFunctionExpression(node.data)).forEach(
      (variableId) => {
        const producerId = producerByVariable.get(variableId)
        if (producerId && functionNodeIds.has(producerId)) {
          dependencies.add(producerId)
        }
      },
    )
    dependenciesByNode.set(node.id, dependencies)
  })

  const cycleNodeIds = new Set()
  const state = new Map()
  const stack = []

  const visit = (nodeId) => {
    const nodeState = state.get(nodeId) ?? 0
    if (nodeState === 2) return

    if (nodeState === 1) {
      const cycleStart = stack.lastIndexOf(nodeId)
      stack.slice(Math.max(0, cycleStart)).forEach((id) => cycleNodeIds.add(id))
      cycleNodeIds.add(nodeId)
      return
    }

    state.set(nodeId, 1)
    stack.push(nodeId)
    ;(dependenciesByNode.get(nodeId) ?? []).forEach(visit)
    stack.pop()
    state.set(nodeId, 2)
  }

  functionNodes.forEach((node) => visit(node.id))

  return {
    producerByVariable,
    dependenciesByNode,
    cycleNodeIds,
  }
}

function FunctionExpressionEditor({
  expression,
  groupPath = [],
  depth = 0,
  data,
  nodeId,
}) {
  const operands = expression?.operands ?? []
  const operators = expression?.operators ?? []
  const pendingOperator = expression?.pendingOperator ?? ''

  const handleExpressionDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const blockKind = event.dataTransfer.getData(
      'application/chemeflow-expression-block',
    )
    if (!blockKind) return
    data.onDropExpressionBlock?.(nodeId, groupPath, blockKind)
  }

  return (
    <div
      className={`function-expression-list block-workspace ${depth ? 'nested' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleExpressionDrop}
    >
      {depth > 0 && <span className="function-group-paren">(</span>}

      <div className="function-expression-content">
        {operands.length === 0 ? (
          <div className="function-expression-drop-hint">Drop here</div>
        ) : (
          <div className="function-expression-chain block-chain">
            {operands.map((operand, index) => (
              <div className="function-token" key={index}>
                {index > 0 && (
                  <select
                    className="function-operator-block orange-block"
                    value={operators[index - 1] ?? '+'}
                    aria-label={`Operator ${index}`}
                    onChange={(event) =>
                      data.onOperatorChange?.(
                        nodeId,
                        groupPath,
                        index - 1,
                        event.target.value,
                      )
                    }
                  >
                    <option>+</option>
                    <option>-</option>
                    <option>*</option>
                    <option>/</option>
                  </select>
                )}

                <div className={`function-value-block orange-block ${operand.type}`}>
                  {operand.type === 'variable' && (
                    <select
                      className="function-value-input"
                      value={operand.variableId ?? ''}
                      title={formatVariableReference((data.allVariables ?? []).find((variable) => variable.id === operand.variableId), { includeDescription: true })}
                      onChange={(event) =>
                        data.onOperandValueChange?.(
                          nodeId,
                          groupPath,
                          index,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">Variable</option>
                      {[...(data.allVariables ?? [])]
                        .filter((variable) => variable.id !== data.targetId)
                        .sort(compareInventoryVariables)
                        .map((variable) => (
                          <option key={variable.id} value={variable.id}>
                            {formatVariableReference(variable, { includeDescription: true })}
                          </option>
                        ))}
                    </select>
                  )}

                  {operand.type === 'constant' && (
                    <input
                      className="function-value-input constant-input"
                      type="number"
                      step="any"
                      value={operand.value ?? ''}
                      placeholder="Constant"
                      style={{
                        width: `${Math.max(4, String(operand.value ?? '').length + 1)}ch`,
                      }}
                      onChange={(event) =>
                        data.onOperandValueChange?.(
                          nodeId,
                          groupPath,
                          index,
                          event.target.value,
                        )
                      }
                    />
                  )}

                  {operand.type === 'group' && (
                    <FunctionExpressionEditor
                      expression={operand.expression}
                      groupPath={[...groupPath, index]}
                      depth={depth + 1}
                      data={data}
                      nodeId={nodeId}
                    />
                  )}

                  <button
                    type="button"
                    className="function-remove"
                    onClick={() => data.onRemoveOperand?.(nodeId, groupPath, index)}
                    aria-label="Remove expression block"
                    title="Remove block"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {pendingOperator && (
          <div className="function-pending-operator orange-block">
            {pendingOperator}
            <small>Drop value</small>
          </div>
        )}
      </div>

      {depth > 0 && <span className="function-group-paren">)</span>}
    </div>
  )
}

function TargetVariableFunctionNode({ id, data, selected }) {
  const expression = getFunctionExpression(data)
  return (
    <div className={`target-function-node ${selected ? 'selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={360} minHeight={350} lineClassName="equation-node-resize-line" handleClassName="equation-node-resize-handle" />
      <div className="target-function-node-header">
        <EditableBlockTitle value={data.label} onCommit={(value) => data.onRename?.(id, value)} />
        <strong>f(x)</strong>
      </div>
      <div className="target-function-node-body nodrag nowheel">
        <label><span>Target variable</span><select value={data.targetId ?? ''} onChange={(e)=>data.onTargetChange?.(id,e.target.value)}><option value="">Select an unknown</option>{[...(data.targetVariables ?? [])].sort(compareInventoryVariables).map(v=><option key={v.id} value={v.id} disabled={data.assignments?.has(v.id) && data.assignments.get(v.id).id!==id}>{formatVariableReference(v, { includeDescription: true })}</option>)}</select></label>
        <div className="linear-system-section-title">Expression</div>
        <FunctionExpressionEditor expression={expression} data={data} nodeId={id} />
        <div className={`function-status ${data.functionStatus??'incomplete'}`}>
          <strong>{data.functionStatusLabel ?? 'Incomplete'}</strong>
          {data.functionMessage && <small>{data.functionMessage}</small>}
          {data.functionValue !== null && data.functionValue !== undefined && <div>{formatValue(data.functionValue)}</div>}
          {data.solveDiagnostics?.solved && data.solveDiagnostics.dependenciesResolved?.length > 0 && (
            <div className="target-dependency-history">
              <strong>Dependencies resolved during Solve:</strong>
              {data.solveDiagnostics.dependenciesResolved.map((dependency) => (
                <small key={dependency.variableId}>
                  {dependency.label} — {dependency.relation}
                </small>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const equationNodeTypes = {
  variableDeclaration: VariableDeclarationNode,
  linearSystem: LinearSystemNode,
  targetFunction: TargetVariableFunctionNode,
}

let equationBlockCounter = 0

function makeEmptyMatrix(size, previous = []) {
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from(
      { length: size },
      (_, columnIndex) => previous[rowIndex]?.[columnIndex] ?? '',
    ),
  )
}

function makeEmptyVector(size, previous = []) {
  return Array.from(
    { length: size },
    (_, rowIndex) => previous[rowIndex] ?? '',
  )
}


function makeLinearExpressionAlias(variable, index = 0) {
  const raw = variable.source === 'stream'
    ? [variable.streamName, variable.componentName, variable.symbol].filter(Boolean).join('_')
    : (variable.name || variable.symbol || `variable_${index + 1}`)
  const normalized = String(raw)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ṁ/g, 'm')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const candidate = normalized || `variable_${index + 1}`
  return (/^[A-Za-z_]/.test(candidate) ? candidate : `v_${candidate}`).toLowerCase()
}

function buildLinearExpressionAliases(variables) {
  const aliases = new Map()
  const used = new Set()
  const variableList = Array.isArray(variables) ? variables : []
  variableList.forEach((variable, index) => {
    const base = makeLinearExpressionAlias(variable, index)
    let alias = base
    let suffix = 2
    while (used.has(alias)) alias = `${base}_${suffix++}`
    used.add(alias)
    aliases.set(alias, variable)
  })
  return aliases
}

function tokenizeLinearExpression(expression) {
  const text = String(expression ?? '').trim()
  if (!text) throw new Error('Incomplete expression.')
  const tokens = []
  let index = 0
  while (index < text.length) {
    const rest = text.slice(index)
    const whitespace = rest.match(/^\s+/)
    if (whitespace) { index += whitespace[0].length; continue }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
    if (number) { tokens.push({ type:'number', value:Number(number[0]) }); index += number[0].length; continue }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)
    if (identifier) { tokens.push({ type:'identifier', value:identifier[0] }); index += identifier[0].length; continue }
    const char = rest[0]
    if ('+-*/()'.includes(char)) { tokens.push({ type:char, value:char }); index += 1; continue }
    throw new Error(`Unsupported character "${char}".`)
  }
  return tokens
}

function evaluateLinearExpression(expression, variables, forbiddenIds = new Set()) {
  const aliases = buildLinearExpressionAliases(variables)
  const tokens = tokenizeLinearExpression(expression)
  let position = 0
  const dependencies = new Set()
  const missing = new Set()

  const parsePrimary = () => {
    const token = tokens[position]
    if (!token) throw new Error('Incomplete expression.')
    if (token.type === 'number') { position += 1; return token.value }
    if (token.type === 'identifier') {
      position += 1
      const variable = aliases.get(token.value)
      if (!variable) throw new Error(`Unknown variable alias: ${token.value}.`)
      dependencies.add(variable.id)
      if (forbiddenIds.has(variable.id)) throw new Error(`Nonlinear coefficient: ${token.value} is an unknown of this Linear System.`)
      const value = Number(variable.value)
      if (variable.status === 'unknown' || !Number.isFinite(value)) { missing.add(variable.id); return 0 }
      return value
    }
    if (token.type === '(') {
      position += 1
      const value = parseAddSubtract()
      if (tokens[position]?.type !== ')') throw new Error('Missing closing parenthesis.')
      position += 1
      return value
    }
    if (token.type === '+' || token.type === '-') {
      position += 1
      const value = parsePrimary()
      return token.type === '-' ? -value : value
    }
    throw new Error('Invalid expression.')
  }
  const parseMultiplyDivide = () => {
    let value = parsePrimary()
    while (tokens[position]?.type === '*' || tokens[position]?.type === '/') {
      const operator = tokens[position++].type
      const right = parsePrimary()
      if (operator === '/' && Math.abs(right) < 1e-15 && missing.size === 0) throw new Error('Division by zero.')
      value = operator === '*' ? value * right : value / right
    }
    return value
  }
  function parseAddSubtract() {
    let value = parseMultiplyDivide()
    while (tokens[position]?.type === '+' || tokens[position]?.type === '-') {
      const operator = tokens[position++].type
      const right = parseMultiplyDivide()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }
  const value = parseAddSubtract()
  if (position !== tokens.length) throw new Error('Invalid expression.')
  if (missing.size) return { status:'waiting', missing:[...missing], dependencies:[...dependencies] }
  if (!Number.isFinite(value)) throw new Error('Expression produced a non-finite value.')
  return { status:'ready', value, dependencies:[...dependencies] }
}

function evaluateLinearSystemExpressions(matrix, constants, variables, variableIds) {
  const matrixRows = Array.isArray(matrix) ? matrix : []
  const constantValues = Array.isArray(constants) ? constants : []
  const forbiddenIds = new Set(Array.isArray(variableIds) ? variableIds : [])
  const dependencies = new Set()
  const missing = new Set()
  const numericMatrix = matrixRows.map((row) => (Array.isArray(row) ? row : []).map((expression) => {
    const result = evaluateLinearExpression(expression, variables, forbiddenIds)
    result.dependencies?.forEach((id) => dependencies.add(id))
    result.missing?.forEach((id) => missing.add(id))
    return result.status === 'ready' ? result.value : 0
  }))
  const numericConstants = constantValues.map((expression) => {
    const result = evaluateLinearExpression(expression, variables, forbiddenIds)
    result.dependencies?.forEach((id) => dependencies.add(id))
    result.missing?.forEach((id) => missing.add(id))
    return result.status === 'ready' ? result.value : 0
  })
  return missing.size
    ? { status:'waiting', missing:[...missing], dependencies:[...dependencies] }
    : { status:'ready', matrix:numericMatrix, constants:numericConstants, dependencies:[...dependencies] }
}

function getMatrixTolerance(matrix) {
  const largestValue = matrix.reduce(
    (largest, row) =>
      row.reduce(
        (rowLargest, value) => Math.max(rowLargest, Math.abs(value)),
        largest,
      ),
    0,
  )

  return Number.EPSILON * Math.max(1, largestValue) * 1e6
}

function calculateMatrixRank(inputMatrix, tolerance) {
  const matrix = inputMatrix.map((row) => [...row])
  const rowCount = matrix.length
  const columnCount = matrix[0]?.length ?? 0
  let pivotRow = 0

  for (let column = 0; column < columnCount && pivotRow < rowCount; column += 1) {
    let bestRow = pivotRow

    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[bestRow][column])) {
        bestRow = row
      }
    }

    if (Math.abs(matrix[bestRow][column]) <= tolerance) continue

    ;[matrix[pivotRow], matrix[bestRow]] = [matrix[bestRow], matrix[pivotRow]]

    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      const factor = matrix[row][column] / matrix[pivotRow][column]
      if (Math.abs(factor) <= tolerance) continue

      for (let nextColumn = column; nextColumn < columnCount; nextColumn += 1) {
        matrix[row][nextColumn] -= factor * matrix[pivotRow][nextColumn]
      }
    }

    pivotRow += 1
  }

  return pivotRow
}

function solveUniqueSystem(matrixInput, constantsInput, tolerance) {
  const size = matrixInput.length
  const augmented = matrixInput.map((row, index) => [
    ...row,
    constantsInput[index],
  ])

  for (let column = 0; column < size; column += 1) {
    let bestRow = column

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[bestRow][column])) {
        bestRow = row
      }
    }

    if (Math.abs(augmented[bestRow][column]) <= tolerance) {
      throw new Error('The system is numerically singular.')
    }

    ;[augmented[column], augmented[bestRow]] = [
      augmented[bestRow],
      augmented[column],
    ]

    const pivot = augmented[column][column]
    for (let nextColumn = column; nextColumn <= size; nextColumn += 1) {
      augmented[column][nextColumn] /= pivot
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue

      const factor = augmented[row][column]
      if (Math.abs(factor) <= tolerance) continue

      for (let nextColumn = column; nextColumn <= size; nextColumn += 1) {
        augmented[row][nextColumn] -= factor * augmented[column][nextColumn]
      }
    }
  }

  return augmented.map((row) => row[size])
}

function calculateLinearSystemResidual(matrix, constants, solution) {
  if (!Array.isArray(solution)) return null
  const squaredError = matrix.reduce((total, row, rowIndex) => {
    const predicted = row.reduce(
      (sum, coefficient, columnIndex) => sum + coefficient * solution[columnIndex],
      0,
    )
    const difference = predicted - constants[rowIndex]
    return total + difference * difference
  }, 0)
  return Math.sqrt(squaredError)
}


function analyzeLinearSystemInJavaScript(matrix, constants) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Matrix A must contain at least one row.')
  }

  const size = matrix.length
  if (
    matrix.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== size ||
        row.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error('Matrix A must be a square matrix of finite numbers.')
  }

  if (
    !Array.isArray(constants) ||
    constants.length !== size ||
    constants.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Vector b must contain exactly n finite numbers.')
  }

  const augmented = matrix.map((row, index) => [...row, constants[index]])
  const tolerance = getMatrixTolerance(augmented)
  const rankA = calculateMatrixRank(matrix, tolerance)
  const rankAugmented = calculateMatrixRank(augmented, tolerance)

  let classification = 'unique'
  let solution = null

  if (rankA < rankAugmented) {
    classification = 'inconsistent'
  } else if (rankA < size) {
    classification = 'underdetermined'
  } else {
    solution = solveUniqueSystem(matrix, constants, tolerance)
  }

  return {
    engine: 'JavaScript fallback',
    variableCount: size,
    rankA,
    rankAugmented,
    classification,
    solution,
  }
}


async function analyzeLinearSystemWithPythonFallback(matrix, constants, timeoutMs = 2500) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${apiUrl}/linear-system/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matrix, constants }),
      signal: controller.signal,
    })

    const payload = await response.json()
    if (!response.ok) {
      const detail = Array.isArray(payload.detail)
        ? payload.detail.map((item) => item.msg).join(' ')
        : payload.detail
      throw new Error(detail || 'The Python engine could not solve the system.')
    }

    return payload
  } catch (error) {
    console.warn('Python linear-system solve failed; using JavaScript fallback.', error)
    return analyzeLinearSystemInJavaScript(matrix, constants)
  } finally {
    window.clearTimeout(timeoutId)
  }
}


function validatePhysicalSolution(variableIds, solution, streamRegistry) {
  if (!Array.isArray(solution)) return []

  const variablesById = new Map(
    streamRegistry.map((variable) => [variable.id, variable]),
  )
  const tolerance = 1e-9

  return solution.flatMap((value, index) => {
    const variableId = variableIds[index]
    const variable = variablesById.get(variableId)
    if (!variable || variable.source !== 'stream') return []

    if (!Number.isFinite(value)) {
      return [{
        variableId,
        message: `x${index + 1} is not a finite value.`,
      }]
    }

    const isFraction = variableId.includes('__fraction__')
    const isFlow =
      variableId.includes('__totalFlow') ||
      variableId.includes('__componentFlow__')

    if (isFlow && value < -tolerance) {
      return [{
        variableId,
        message: `x${index + 1} = ${formatValue(value)} ${variable.unit}: stream flows cannot be negative.`,
      }]
    }

    if (isFraction && (value < -tolerance || value > 1 + tolerance)) {
      return [{
        variableId,
        message: `x${index + 1} = ${formatValue(value)}: stream fractions must be between 0 and 1.`,
      }]
    }

    return []
  })
}


function PythonEngineStatus() {
  const [status, setStatus] = useState('checking')
  const [engine, setEngine] = useState('Python')

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 2500)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Backend unavailable')
        return response.json()
      })
      .then((data) => {
        setEngine(data.engine || 'Python')
        setStatus('online')
      })
      .catch(() => setStatus('offline'))
      .finally(() => window.clearTimeout(timeoutId))

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const label =
    status === 'online'
      ? 'Connected'
      : status === 'offline'
        ? 'Not running'
        : 'Checking'

  return (
    <div className={`python-engine-status ${status}`}>
      <div>
        <span>Calculation engine</span>
        <strong>{engine}</strong>
      </div>
      <b>{label}</b>
    </div>
  )
}

function EquationWorkspace({ isActive, registry, labels, hasStreams, components, onSolved, onInvalidated, projectNodes = [], projectLoadVersion = 0, onProjectNodesChange }) {
  const [equationNodes, setEquationNodes, onEquationNodesChange] =
    useNodesState(projectNodes)
  const [globalSolvedValues, setGlobalSolvedValues] = useState(new Map())
  const [modelSolveState, setModelSolveState] = useState({ status: 'idle', message: '' })
  const [blockResolutionOrder, setBlockResolutionOrder] = useState([])
  const semanticFingerprintRef = useRef('')
  const { screenToFlowPosition } = useReactFlow()
  const lastLoadedProjectVersionRef = useRef(projectLoadVersion)
  const skipNextVariableSelectionCleanupRef = useRef(false)

  useEffect(() => {
    if (lastLoadedProjectVersionRef.current === projectLoadVersion) return
    lastLoadedProjectVersionRef.current = projectLoadVersion
    // The selectable-variable inventory still reflects the previous project during
    // this effect cycle. Skip its cleanup once so saved variableIds, including
    // references to Variable Declaration nodes, are not erased before the loaded
    // declarations are rebuilt.
    skipNextVariableSelectionCleanupRef.current = true
    setEquationNodes((projectNodes ?? []).map((node) => ({ ...node, selected: false })))
    setGlobalSolvedValues(new Map())
    setModelSolveState({ status: 'idle', message: '' })
    setBlockResolutionOrder([])
  }, [projectLoadVersion, projectNodes, setEquationNodes])

  useEffect(() => {
    onProjectNodesChange?.(equationNodes.map((node) => ({ ...node, selected: false })))
  }, [equationNodes, onProjectNodesChange])

  const updateDeclarationField = useCallback(
    (nodeId, field, value) => {
      setEquationNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  [field]: value,
                },
              }
            : node,
        ),
      )
    },
    [setEquationNodes],
  )


  const renameEquationBlock = useCallback(
    (nodeId, nextLabel) => {
      const cleanLabel = nextLabel.trim()
      if (!cleanLabel) return

      setEquationNodes((currentNodes) => {
        const duplicated = currentNodes.some(
          (node) =>
            node.id !== nodeId &&
            (node.data.label ?? '').trim().toLowerCase() ===
              cleanLabel.toLowerCase(),
        )

        if (duplicated) {
          window.alert('Equation block names must be unique.')
          return currentNodes
        }

        return currentNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, label: cleanLabel } }
            : node,
        )
      })
    },
    [setEquationNodes],
  )

  const updateLinearSystemSize = useCallback(
    (nodeId, nextSize) => {
      setEquationNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node

          const currentVariables = node.data.variableIds ?? []
          return {
            ...node,
            data: {
              ...node.data,
              size: nextSize,
              variableIds: Array.from(
                { length: nextSize },
                (_, index) => currentVariables[index] ?? '',
              ),
              matrix: makeEmptyMatrix(nextSize, node.data.matrix ?? []),
              constants: makeEmptyVector(nextSize, node.data.constants ?? []),
              analysis: null,
              analysisStatus: 'idle',
              analysisError: '',
            },
          }
        }),
      )
    },
    [setEquationNodes],
  )

  const updateLinearSystemVariable = useCallback(
    (nodeId, index, variableId) => {
      setEquationNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node

          const variableIds = [...(node.data.variableIds ?? [])]
          const duplicateIndex = variableIds.findIndex(
            (candidate, candidateIndex) =>
              candidateIndex !== index && candidate === variableId,
          )

          if (variableId && duplicateIndex >= 0) {
            window.alert('A variable can only appear once in the same system.')
            return node
          }

          variableIds[index] = variableId
          return {
            ...node,
            data: {
              ...node.data,
              variableIds,
              analysis: null,
              analysisStatus: 'idle',
              analysisError: '',
            },
          }
        }),
      )
    },
    [setEquationNodes],
  )

  const updateLinearSystemMatrix = useCallback(
    (nodeId, rowIndex, columnIndex, value) => {
      setEquationNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node

          const size = Number(node.data.size ?? 2)
          const matrix = makeEmptyMatrix(size, node.data.matrix ?? [])
          matrix[rowIndex][columnIndex] = value

          return {
            ...node,
            data: {
              ...node.data,
              matrix,
              analysis: null,
              analysisStatus: 'idle',
              analysisError: '',
            },
          }
        }),
      )
    },
    [setEquationNodes],
  )

  const updateLinearSystemConstant = useCallback(
    (nodeId, rowIndex, value) => {
      setEquationNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node

          const size = Number(node.data.size ?? 2)
          const constants = makeEmptyVector(size, node.data.constants ?? [])
          constants[rowIndex] = value

          return {
            ...node,
            data: {
              ...node.data,
              constants,
              analysis: null,
              analysisStatus: 'idle',
              analysisError: '',
            },
          }
        }),
      )
    },
    [setEquationNodes],
  )

  const declarationValidation = useMemo(() => {
    const declarationNodes = equationNodes.filter(
      (node) => node.type === 'variableDeclaration',
    )
    const names = declarationNodes.map((node) =>
      (node.data.name ?? '').trim().toLowerCase(),
    )
    const symbols = declarationNodes.map((node) =>
      (node.data.symbol ?? '').trim().toLowerCase(),
    )

    return new Map(
      declarationNodes.map((node, index) => {
        const name = names[index]
        const symbol = symbols[index]
        const numericValue = Number(node.data.value)
        const validation = {}

        if (!name) validation.name = 'Name is required.'
        else if (names.filter((candidate) => candidate === name).length > 1) {
          validation.name = 'Variable names must be unique.'
        }

        if (
          symbol &&
          symbols.filter((candidate) => candidate === symbol).length > 1
        ) {
          validation.symbol = 'This symbol is already used.'
        }

        if (
          node.data.status === 'specified' &&
          (node.data.value === '' || !Number.isFinite(numericValue))
        ) {
          validation.value = 'A finite numeric value is required.'
        }

        return [node.id, validation]
      }),
    )
  }, [equationNodes])

  const declaredVariables = useMemo(
    () =>
      equationNodes
        .filter((node) => node.type === 'variableDeclaration')
        .map((node) => {
          const validation = declarationValidation.get(node.id) ?? {}
          const name = (node.data.name ?? '').trim()
          const isSpecified = node.data.status === 'specified'
          const validValue = Number.isFinite(Number(node.data.value))
          const isValid = Object.keys(validation).length === 0

          return {
            id: `user__${node.id}`,
            name: name || 'Unnamed variable',
            label: 'Declared variable',
            symbol: (node.data.symbol ?? '').trim() || '—',
            unit: (node.data.unit ?? '').trim() || 'dimensionless',
            value: isSpecified && validValue ? node.data.value : '',
            status: isValid && isSpecified ? 'specified' : 'unknown',
            source: 'declaration',
            streamId: null,
            streamName: 'User variable',
            componentId: null,
            componentName: name || 'Unnamed variable',
            relation: isSpecified ? 'Declared by the student' : '',
          }
        }),
    [declarationValidation, equationNodes],
  )


  const analyzeLinearSystem = useCallback(
    async (nodeId) => {
      const node = equationNodes.find((candidate) => candidate.id === nodeId)
      if (!node) return

      const size = Number(node.data.size ?? 2)
      const variableIds = node.data.variableIds ?? []
      const matrix = makeEmptyMatrix(size, node.data.matrix ?? [])
      const constants = makeEmptyVector(size, node.data.constants ?? [])

      if (variableIds.length !== size || variableIds.some((value) => !value)) {
        return
      }
      if (
        matrix.some((row) => row.some((value) => value === '')) ||
        constants.some((value) => value === '')
      ) {
        return
      }

      setEquationNodes((currentNodes) =>
        currentNodes.map((candidate) =>
          candidate.id === nodeId
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  analysis: null,
                  analysisStatus: 'loading',
                  analysisError: '',
                },
              }
            : candidate,
        ),
      )

      const currentVariables = [...registry, ...declaredVariables]
      let evaluated
      try {
        evaluated = evaluateLinearSystemExpressions(matrix, constants, currentVariables, variableIds)
        if (evaluated.status === 'waiting') {
          const byId = new Map(currentVariables.map((variable) => [variable.id, variable]))
          const labels = evaluated.missing.map((id) => formatVariableReference(byId.get(id))).join(', ')
          throw new Error(`Waiting for: ${labels}.`)
        }
      } catch (error) {
        setEquationNodes((currentNodes) => currentNodes.map((candidate) => candidate.id === nodeId ? {
          ...candidate, data: { ...candidate.data, analysis:null, analysisStatus:'error', analysisError:error.message },
        } : candidate))
        return
      }
      const numericMatrix = evaluated.matrix
      const numericConstants = evaluated.constants

      try {
        const payload = await analyzeLinearSystemWithPythonFallback(
          numericMatrix,
          numericConstants,
        )

        const physicalErrors =
          payload.classification === 'unique' && Array.isArray(payload.solution)
            ? validatePhysicalSolution(variableIds, payload.solution, currentVariables)
            : []
        const { solution: _diagnosticSolution, ...diagnosticPayload } = payload
        const analyzedPayload = { ...diagnosticPayload, physicalErrors }

        setEquationNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId
              ? {
                  ...candidate,
                  data: {
                    ...candidate.data,
                    analysis: analyzedPayload,
                    analysisStatus: 'complete',
                    analysisError: '',
                  },
                }
              : candidate,
          ),
        )
      } catch (error) {
        setEquationNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId
              ? {
                  ...candidate,
                  data: {
                    ...candidate.data,
                    analysis: null,
                    analysisStatus: 'error',
                    analysisError:
                      error instanceof Error
                        ? error.message
                        : 'The system could not be analyzed.',
                  },
                }
              : candidate,
          ),
        )
      }
    },
    [declaredVariables, equationNodes, registry, setEquationNodes],
  )

  const updateFunctionField = useCallback((nodeId, updater) => {
    setEquationNodes((nodes) => nodes.map((node) => node.id===nodeId ? {...node, data:{...node.data, ...updater(node.data)}} : node))
  }, [setEquationNodes])
  const updateFunctionTarget = useCallback((id,targetId)=>updateFunctionField(id,()=>({targetId})),[updateFunctionField])

  const updateExpressionGroup = useCallback((expression, groupPath, updater) => {
    const clone = structuredClone(expression)
    let group = clone
    groupPath.forEach((operandIndex) => {
      group = group.operands[operandIndex].expression
    })
    updater(group)
    return clone
  }, [])

  const updateOperandType = useCallback((id,groupPath,index,type)=>updateFunctionField(id,(data)=>{
    const expression=updateExpressionGroup(getFunctionExpression(data),groupPath,(group)=>{
      group.operands[index]=type==='variable'
        ? {type,variableId:''}
        : type==='constant'
          ? {type,value:''}
          : {type:'group',expression:makeDefaultFunctionExpression()}
    })
    return {expression,operands:undefined,operators:undefined}
  }),[updateExpressionGroup,updateFunctionField])

  const updateOperandValue = useCallback((id,groupPath,index,value)=>updateFunctionField(id,(data)=>{
    const expression=updateExpressionGroup(getFunctionExpression(data),groupPath,(group)=>{
      const operand=group.operands[index]
      group.operands[index]={...operand,...(operand.type==='variable'?{variableId:value}:{value})}
    })
    return {expression,operands:undefined,operators:undefined}
  }),[updateExpressionGroup,updateFunctionField])

  const updateOperator = useCallback((id,groupPath,index,value)=>updateFunctionField(id,(data)=>{
    const expression=updateExpressionGroup(getFunctionExpression(data),groupPath,(group)=>{group.operators[index]=value})
    return {expression,operands:undefined,operators:undefined}
  }),[updateExpressionGroup,updateFunctionField])

  const addOperand = useCallback((id,groupPath,type='variable')=>updateFunctionField(id,(data)=>{
    const expression=updateExpressionGroup(getFunctionExpression(data),groupPath,(group)=>{
      const operand = type === 'constant'
        ? { type: 'constant', value: '' }
        : type === 'group'
          ? { type: 'group', expression: makeDefaultFunctionExpression() }
          : { type: 'variable', variableId: '' }
      group.operands.push(operand)
      group.operators.push('+')
    })
    return {expression,operands:undefined,operators:undefined}
  }),[updateExpressionGroup,updateFunctionField])

  const removeOperand = useCallback((id,groupPath,index)=>updateFunctionField(id,(data)=>{
    const expression=updateExpressionGroup(getFunctionExpression(data),groupPath,(group)=>{
      if (group.operands.length === 0) return
      group.operands.splice(index,1)
      if (group.operands.length === 0) {
        group.operators = []
        group.pendingOperator = ''
      } else if(index===0) group.operators.splice(0,1)
      else group.operators.splice(index-1,1)
    })
    return {expression,operands:undefined,operators:undefined,pendingOperator:undefined}
  }),[updateExpressionGroup,updateFunctionField])

  const dropExpressionBlock = useCallback((id, groupPath, blockKind) => updateFunctionField(id, (data) => {
    const expression = updateExpressionGroup(getFunctionExpression(data), groupPath, (group) => {
      group.pendingOperator = group.pendingOperator ?? ''
      const isOperator = ['+', '-', '*', '/'].includes(blockKind)

      if (isOperator) {
        if (group.operands.length > 0 && group.operators.length === group.operands.length - 1) {
          group.pendingOperator = blockKind
        }
        return
      }

      const operand = blockKind === 'constant'
        ? { type: 'constant', value: '' }
        : blockKind === 'group'
          ? { type: 'group', expression: makeDefaultFunctionExpression() }
          : { type: 'variable', variableId: '' }

      if (group.operands.length === 0) {
        group.operands.push(operand)
        group.pendingOperator = ''
        return
      }

      if (!group.pendingOperator) return
      group.operators.push(group.pendingOperator)
      group.operands.push(operand)
      group.pendingOperator = ''
    })
    return { expression, operands: undefined, operators: undefined, pendingOperator: undefined }
  }), [updateExpressionGroup, updateFunctionField])

  const functionDependencyAnalysis = useMemo(
    () => buildFunctionDependencyAnalysis(equationNodes),
    [equationNodes],
  )

  const semanticFingerprint = useMemo(() => JSON.stringify({
    registry: registry.map(({ id, value, status }) => ({ id, value, status })),
    nodes: equationNodes.map((node) => {
      if (node.type === 'linearSystem') {
        return {
          id: node.id,
          type: node.type,
          size: node.data.size,
          variableIds: node.data.variableIds,
          matrix: node.data.matrix,
          constants: node.data.constants,
        }
      }
      if (node.type === 'targetFunction') {
        return {
          id: node.id,
          type: node.type,
          targetId: node.data.targetId,
          expression: getFunctionExpression(node.data),
        }
      }
      return {
        id: node.id,
        type: node.type,
        name: node.data.name,
        symbol: node.data.symbol,
        unit: node.data.unit,
        status: node.data.status,
        value: node.data.value,
      }
    }),
  }), [equationNodes, registry])

  useEffect(() => {
    if (!semanticFingerprintRef.current) {
      semanticFingerprintRef.current = semanticFingerprint
      return
    }
    if (semanticFingerprintRef.current !== semanticFingerprint) {
      semanticFingerprintRef.current = semanticFingerprint
      setGlobalSolvedValues(new Map())
      setModelSolveState({ status: 'idle', message: '' })
      setBlockResolutionOrder([])

      // A semantic model edit invalidates every block-level diagnostic.
      // Do not re-analyze automatically: Analyze remains an explicit action.
      setEquationNodes((currentNodes) => {
        let changed = false
        const nextNodes = currentNodes.map((node) => {
          if (node.type === 'linearSystem') {
            const hasStaleDiagnostic = Boolean(
              node.data.analysis
              || node.data.analysisError
              || (node.data.analysisStatus && node.data.analysisStatus !== 'idle'),
            )
            if (!hasStaleDiagnostic) return node
            changed = true
            return {
              ...node,
              data: {
                ...node.data,
                analysis: null,
                analysisStatus: 'idle',
                analysisError: '',
              },
            }
          }

          if (node.type === 'targetFunction' && node.data.solveDiagnostics) {
            changed = true
            return {
              ...node,
              data: {
                ...node.data,
                solveDiagnostics: null,
              },
            }
          }

          return node
        })
        return changed ? nextNodes : currentNodes
      })

      onInvalidated?.()
    }
  }, [semanticFingerprint, onInvalidated])

  const variablesWithSolvedValues = useMemo(() =>
    [...registry, ...declaredVariables].map((variable) => {
      const solved = globalSolvedValues.get(variable.id)
      return solved
        ? { ...variable, value: solved.value, status: 'solved', relation: solved.relation }
        : variable
    }),
  [declaredVariables, globalSolvedValues, registry])

  const propagatedModel = useMemo(() => propagateStreamRelations(variablesWithSolvedValues, components), [components, variablesWithSolvedValues])

  const allVariables = propagatedModel.variables
  const streamConflicts = propagatedModel.conflicts
  const known = useMemo(
    () => allVariables.filter((variable) => variable.status === 'specified').sort(compareInventoryVariables),
    [allVariables],
  )
  const calculated = useMemo(
    () => allVariables.filter((variable) => variable.status === 'calculated').sort(compareInventoryVariables),
    [allVariables],
  )
  const unknown = useMemo(
    () => allVariables.filter((variable) => variable.status === 'unknown').sort(compareInventoryVariables),
    [allVariables],
  )
  const solved = useMemo(
    () => allVariables.filter((variable) => variable.status === 'solved').sort(compareInventoryVariables),
    [allVariables],
  )
  const selectableVariables = useMemo(
    () => [...unknown, ...solved].sort(compareInventoryVariables),
    [solved, unknown],
  )
  const selectableIds = useMemo(
    () => new Set(selectableVariables.map((variable) => variable.id)),
    [selectableVariables],
  )

  useEffect(() => {
    if (skipNextVariableSelectionCleanupRef.current) {
      skipNextVariableSelectionCleanupRef.current = false
      return
    }

    setEquationNodes((currentNodes) => {
      let changed = false

      const nextNodes = currentNodes.map((node) => {
        if (node.type !== 'linearSystem') return node

        const currentVariableIds = node.data.variableIds ?? []
        const variableIds = currentVariableIds.map((variableId) => {
          const nextVariableId =
            variableId && selectableIds.has(variableId) ? variableId : ''

          if (nextVariableId !== variableId) changed = true
          return nextVariableId
        })

        return changed
          ? {
              ...node,
              data: {
                ...node.data,
                variableIds,
                analysis: null,
                analysisStatus: 'idle',
                analysisError: '',
              },
            }
          : node
      })

      return changed ? nextNodes : currentNodes
    })
  }, [selectableIds, setEquationNodes])

  const solveModel = useCallback(async () => {
    const directSolutions = new Map()
    let variables = [...registry, ...declaredVariables].map((variable) => ({ ...variable }))
    const initialUnknownCount = variables.filter((variable) => variable.status === 'unknown').length
    const issues = []
    let directChangeCount = 0
    const resolutionOrder = []
    const resolvedBlockIds = new Set()
    const initialMissingByNode = new Map()
    const linearSolveResults = new Map()

    const recordResolvedBlock = (node) => {
      if (!resolvedBlockIds.has(node.id)) {
        resolvedBlockIds.add(node.id)
        resolutionOrder.push({ id: node.id, type: node.type, label: node.data.label })
      }
    }

    const applyPropagation = () => {
      const propagated = propagateStreamRelations(variables, components)
      variables = propagated.variables
      propagated.conflicts.forEach((conflict) => issues.push(conflict.message))
    }

    const setSolvedValue = (variableId, value, relation) => {
      const index = variables.findIndex((variable) => variable.id === variableId)
      if (index < 0 || variables[index].status !== 'unknown' || !Number.isFinite(value)) return false
      variables[index] = { ...variables[index], value, status: 'solved', relation }
      directSolutions.set(variableId, { value, relation })
      directChangeCount += 1
      return true
    }

    applyPropagation()
    const initialVariablesById = new Map(variables.map((variable) => [variable.id, variable]))
    equationNodes.forEach((node) => {
      if (node.type === 'targetFunction') {
        initialMissingByNode.set(node.id, getMissingExpressionVariableIds(getFunctionExpression(node.data), initialVariablesById))
      } else if (node.type === 'linearSystem') {
        try {
          const size = Number(node.data.size ?? 2)
          const result = evaluateLinearSystemExpressions(
            makeEmptyMatrix(size, node.data.matrix ?? []),
            makeEmptyVector(size, node.data.constants ?? []),
            variables,
            node.data.variableIds ?? [],
          )
          initialMissingByNode.set(node.id, result.missing ?? [])
        } catch {
          initialMissingByNode.set(node.id, [])
        }
      }
    })
    const maxPasses = Math.max(10, equationNodes.length * 3 + variables.length)

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let changed = false
      const variablesById = new Map(variables.map((variable) => [variable.id, variable]))

      for (const node of equationNodes.filter((candidate) => candidate.type === 'linearSystem')) {
        const size = Number(node.data.size ?? 2)
        const variableIds = node.data.variableIds ?? []
        const matrix = makeEmptyMatrix(size, node.data.matrix ?? [])
        const constants = makeEmptyVector(size, node.data.constants ?? [])
        const complete = variableIds.length === size && variableIds.every(Boolean)
          && matrix.every((row) => row.every((value) => value !== ''))
          && constants.every((value) => value !== '')
        if (!complete) {
          issues.push(`${node.data.label}: incomplete system.`)
          continue
        }
        if (variableIds.some((id) => variablesById.get(id)?.status !== 'unknown')) continue
        try {
          const evaluated = evaluateLinearSystemExpressions(matrix, constants, variables, variableIds)
          if (evaluated.status !== 'ready') continue
          const result = await analyzeLinearSystemWithPythonFallback(evaluated.matrix, evaluated.constants)
          linearSolveResults.set(node.id, result)
          if (result.classification !== 'unique' || !Array.isArray(result.solution)) {
            issues.push(`${node.data.label}: ${result.classification}.`)
            continue
          }
          const physicalErrors = validatePhysicalSolution(variableIds, result.solution, variables)
          if (physicalErrors.length) {
            issues.push(...physicalErrors.map((error) => `${node.data.label}: ${error.message}`))
            continue
          }
          let blockChanged = false
          variableIds.forEach((variableId, index) => {
            const variableChanged = setSolvedValue(variableId, result.solution[index], `Solved by ${node.data.label}`)
            blockChanged = variableChanged || blockChanged
            changed = variableChanged || changed
          })
          if (blockChanged) recordResolvedBlock(node)
        } catch (error) {
          issues.push(`${node.data.label}: ${error.message}`)
        }
      }

      const functionMap = new Map(variables.map((variable) => [variable.id, variable]))
      equationNodes.filter((node) => node.type === 'targetFunction').forEach((node) => {
        if (!node.data.targetId || !isFunctionExpressionComplete(getFunctionExpression(node.data))) {
          issues.push(`${node.data.label}: incomplete expression.`)
          return
        }
        if (functionDependencyAnalysis.cycleNodeIds.has(node.id)) {
          issues.push(`${node.data.label}: circular dependency.`)
          return
        }
        const target = functionMap.get(node.data.targetId)
        if (!target || target.status !== 'unknown') return
        try {
          const result = evaluateFunctionExpression(getFunctionExpression(node.data), functionMap)
          if (result.status !== 'ready') return
          const physicalErrors = validatePhysicalSolution([target.id], [result.value], variables)
          if (physicalErrors.length) {
            issues.push(...physicalErrors.map((error) => `${node.data.label}: ${error.message}`))
            return
          }
          const functionChanged = setSolvedValue(target.id, result.value, `Calculated by ${node.data.label}`)
          changed = functionChanged || changed
          if (functionChanged) recordResolvedBlock(node)
        } catch (error) {
          issues.push(`${node.data.label}: ${error.message}`)
        }
      })

      if (changed) applyPropagation()
      if (!changed) break
    }

    const finalVariablesById = new Map(variables.map((variable) => [variable.id, variable]))
    setEquationNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.type === 'targetFunction') {
          const target = finalVariablesById.get(node.data.targetId)
          const initiallyMissing = initialMissingByNode.get(node.id) ?? []
          const dependenciesResolved = initiallyMissing
            .filter((variableId) => {
              const variable = finalVariablesById.get(variableId)
              return variable && variable.status !== 'unknown'
            })
            .map((variableId) => {
              const variable = finalVariablesById.get(variableId)
              return {
                variableId,
                label: variable ? formatVariableReference(variable, { includeDescription: true }) : variableId,
                relation: variable?.relation || 'Resolved during Solve',
              }
            })
          const solvedByThisBlock = directSolutions.has(node.data.targetId)
          return {
            ...node,
            data: {
              ...node.data,
              solveDiagnostics: {
                solved: solvedByThisBlock && target?.status !== 'unknown',
                dependenciesResolved,
                hadPendingDependencies: initiallyMissing.length > 0,
              },
            },
          }
        }

        if (node.type !== 'linearSystem') return node

        const size = Number(node.data.size ?? 2)
        const variableIds = node.data.variableIds ?? []
        const matrix = makeEmptyMatrix(size, node.data.matrix ?? [])
        const constants = makeEmptyVector(size, node.data.constants ?? [])
        const complete = variableIds.length === size && variableIds.every(Boolean)
          && matrix.every((row) => row.every((value) => value !== ''))
          && constants.every((value) => value !== '')
        if (!complete) return node

        try {
          const evaluated = evaluateLinearSystemExpressions(matrix, constants, variables, variableIds)
          if (evaluated.status !== 'ready') return node
          const dependenciesResolved = (evaluated.dependencies ?? [])
            .filter((variableId) => directSolutions.has(variableId))
            .map((variableId) => {
              const variable = finalVariablesById.get(variableId)
              return variable
                ? `${formatVariableReference(variable, { includeDescription: true })} — ${variable.relation || 'Solved by another block'}`
                : variableId
            })
          const result = linearSolveResults.get(node.id)
            || analyzeLinearSystemInJavaScript(evaluated.matrix, evaluated.constants)
          const physicalErrors = result.classification === 'unique' && Array.isArray(result.solution)
            ? validatePhysicalSolution(variableIds, result.solution, variables)
            : []
          const residual = result.classification === 'unique'
            ? calculateLinearSystemResidual(evaluated.matrix, evaluated.constants, result.solution)
            : null
          const { solution: _solution, ...diagnostic } = result
          const wasSolved = variableIds.every((variableId) => {
            const variable = finalVariablesById.get(variableId)
            return variable && variable.status !== 'unknown'
          })

          return {
            ...node,
            data: {
              ...node.data,
              analysis: {
                ...diagnostic,
                physicalErrors,
                residual,
                solved: wasSolved && result.classification === 'unique' && physicalErrors.length === 0,
                dependenciesResolved,
              },
              analysisStatus: 'complete',
              analysisError: '',
            },
          }
        } catch (error) {
          return {
            ...node,
            data: {
              ...node.data,
              analysisStatus: 'error',
              analysisError: error.message,
            },
          }
        }
      }),
    )

    setBlockResolutionOrder(resolutionOrder)

    const remainingUnknowns = variables.filter((variable) => variable.status === 'unknown').length
    setGlobalSolvedValues(directSolutions)
    if (remainingUnknowns === 0) {
      setModelSolveState({ status: 'solved', message: 'Model solved' })
      const variableMap = Object.fromEntries(variables.map((variable) => [variable.id, {
        id: variable.id, name: variable.name, symbol: variable.symbol, unit: variable.unit,
        source: variable.source, streamId: variable.streamId, streamName: variable.streamName,
        componentId: variable.componentId, componentName: variable.componentName,
        property: variable.id.includes('__fraction__') ? 'fraction' : variable.id.includes('__componentFlow__') ? 'componentFlow' : variable.id.includes('__totalFlow') ? 'totalFlow' : 'declared',
      }]))
      const resolutionOrder = []
      equationNodes.forEach((node) => {
        if (node.type === 'linearSystem' && (node.data.variableIds ?? []).some((id) => directSolutions.has(id))) resolutionOrder.push({ type: 'linearSystem', id: node.id })
        if (node.type === 'targetFunction' && directSolutions.has(node.data.targetId)) resolutionOrder.push({ type: 'targetFunction', id: node.id })
      })
      onSolved?.({
        variables,
        equationNodes,
        components,
        summary: { streams: new Set(variables.filter((v) => v.source === 'stream').map((v) => v.streamId)).size, components: components.length },
        exportModel: {
          components,
          variables: variableMap,
          inputs: Object.fromEntries(variables.filter((v) => v.status === 'specified').map((v) => [v.id, Number(v.value)])),
          linearSystems: equationNodes.filter((n) => n.type === 'linearSystem').map((n) => ({
            id:n.id, label:n.data.label, variableIds:n.data.variableIds,
            matrix:n.data.matrix, constants:n.data.constants,
            expressionAliases:Object.fromEntries([...buildLinearExpressionAliases(variables).entries()].map(([alias, variable]) => [alias, variable.id])),
          })),
          targetFunctions: equationNodes.filter((n) => n.type === 'targetFunction').map((n) => ({ id:n.id,label:n.data.label,targetId:n.data.targetId,expression:getFunctionExpression(n.data) })),
          resolutionOrder,
          streamRelations: ['componentFlow = totalFlow * fraction','fraction = componentFlow / totalFlow','totalFlow = sum(componentFlow)','composition closure = 1 - sum(other fractions)'],
          validations: ['finite values','fractions between 0 and 1','non-negative mass and molar flows'],
        },
      })
    } else if (directChangeCount > 0 || remainingUnknowns < initialUnknownCount) {
      setModelSolveState({ status: 'partial', message: 'Model partially solved' })
    } else {
      setModelSolveState({ status: 'cannot', message: 'Model cannot be solved' })
    }
  }, [components, declaredVariables, equationNodes, functionDependencyAnalysis, registry, onSolved])

  const blockDependencySummary = useMemo(() => {
    const variablesById = new Map(allVariables.map((variable) => [variable.id, variable]))
    const nodesById = new Map(equationNodes.map((node) => [node.id, node]))
    const completedIndex = new Map(blockResolutionOrder.map((item, index) => [item.id, index]))

    return equationNodes
      .filter((node) => node.type === 'linearSystem' || node.type === 'targetFunction')
      .map((node) => {
        let requiredVariableIds = []
        if (node.type === 'targetFunction') {
          requiredVariableIds = [...collectExpressionVariableIds(getFunctionExpression(node.data))]
        } else {
          try {
            const size = Number(node.data.size ?? 2)
            const evaluated = evaluateLinearSystemExpressions(
              makeEmptyMatrix(size, node.data.matrix ?? []),
              makeEmptyVector(size, node.data.constants ?? []),
              allVariables,
              node.data.variableIds ?? [],
            )
            requiredVariableIds = evaluated.dependencies ?? []
          } catch {
            requiredVariableIds = []
          }
        }

        const dependencyIds = [...new Set(requiredVariableIds
          .map((variableId) => functionDependencyAnalysis.producerByVariable.get(variableId))
          .filter((producerId) => producerId && producerId !== node.id))]
        const dependencyLabels = dependencyIds.map((producerId) => nodesById.get(producerId)?.data?.label || producerId)
        const orderIndex = completedIndex.get(node.id)
        const isCompleted = orderIndex !== undefined
        const isCircular = functionDependencyAnalysis.cycleNodeIds.has(node.id)
        const missingWithoutProducer = requiredVariableIds.filter((variableId) => {
          const variable = variablesById.get(variableId)
          const unavailable = !variable || variable.status === 'unknown' || !Number.isFinite(Number(variable.value))
          return unavailable && !functionDependencyAnalysis.producerByVariable.has(variableId)
        })

        let status = 'Ready first'
        if (isCompleted) status = orderIndex === 0 ? 'Solved first' : `Solved after ${blockResolutionOrder[orderIndex - 1]?.label || 'previous block'}`
        else if (isCircular) status = 'Circular dependency detected'
        else if (missingWithoutProducer.length) status = 'Blocked by unresolved variable'
        else if (dependencyLabels.length) status = `Waits for ${dependencyLabels.join(', ')}`

        const statusTone = isCompleted
          ? 'success'
          : isCircular || missingWithoutProducer.length
            ? 'error'
            : 'pending'

        return {
          id: node.id,
          label: node.data.label,
          type: node.type,
          status,
          statusTone,
          dependencyLabels,
          orderIndex,
          isCompleted,
        }
      })
      .sort((a, b) => {
        if (a.isCompleted && b.isCompleted) return a.orderIndex - b.orderIndex
        if (a.isCompleted) return -1
        if (b.isCompleted) return 1
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      })
  }, [allVariables, blockResolutionOrder, equationNodes, functionDependencyAnalysis])

  const renderedNodes = useMemo(
    () =>
      equationNodes.map((node) => {
        if (node.type === 'variableDeclaration') {
          return {
            ...node,
            data: {
              ...node.data,
              validation: declarationValidation.get(node.id) ?? {},
              onChange: updateDeclarationField,
              onRename: renameEquationBlock,
            },
          }
        }

        if (node.type === 'targetFunction') {
          const assignments = new Map()
          equationNodes.filter((candidate)=>['linearSystem','targetFunction'].includes(candidate.type)).forEach((candidate)=>{
            const ids=candidate.type==='targetFunction'?[candidate.data.targetId]:(candidate.data.variableIds??[])
            ids.forEach((variableId)=>{if(variableId) assignments.set(variableId,{id:candidate.id,label:candidate.data.label})})
          })
          const variablesById = new Map(allVariables.map((variable) => [variable.id, variable]))
          let functionStatus = 'incomplete'
          let functionStatusLabel = 'Incomplete'
          let functionMessage = 'Choose a target and complete the expression.'
          let functionValue = null
          const expression = getFunctionExpression(node.data)
          const complete = node.data.targetId && isFunctionExpressionComplete(expression)

          if (!node.data.targetId || !isFunctionExpressionComplete(expression)) {
            functionStatus = 'incomplete'
            functionStatusLabel = 'Incomplete expression'
            functionMessage = 'Choose a target and complete every expression block.'
          } else if (functionDependencyAnalysis.cycleNodeIds.has(node.id)) {
            functionStatus = 'circular'
            functionStatusLabel = 'Circular dependency'
            functionMessage = 'This function is part of a circular dependency.'
          } else {
            const missingIds = getMissingExpressionVariableIds(expression, variablesById)
            const withProducer = []
            const withoutProducer = []

            missingIds.forEach((variableId) => {
              const variable = variablesById.get(variableId)
              const label = variable ? formatVariableReference(variable, { includeDescription: true }) : variableId
              if (functionDependencyAnalysis.producerByVariable.has(variableId)) withProducer.push(label)
              else withoutProducer.push(label)
            })

            if (withoutProducer.length) {
              functionStatus = 'waiting'
              functionStatusLabel = 'No block produces a variable'
              functionMessage = `No block produces: ${withoutProducer.join(', ')}.`
            } else if (withProducer.length) {
              functionStatus = 'waiting'
              functionStatusLabel = 'Depends on another block'
              functionMessage = `Waiting for: ${withProducer.join(', ')}.`
            } else {
              try {
                const result = evaluateFunctionExpression(expression, variablesById)
                const targetVariable = variablesById.get(node.data.targetId)
                const physicalErrors = targetVariable && result.status === 'ready'
                  ? validatePhysicalSolution([targetVariable.id], [result.value], allVariables)
                  : []
                if (physicalErrors.length) {
                  functionStatus = 'error'
                  functionStatusLabel = 'Physically invalid result'
                  functionMessage = physicalErrors.map((error) => error.message).join(' ')
                } else {
                  functionStatus = 'ready'
                  functionStatusLabel = 'Ready to solve'
                  functionMessage = 'Press the global Solve button to evaluate this function.'
                }
              } catch (error) {
                functionStatus = 'error'
                functionStatusLabel = 'Incomplete expression'
                functionMessage = error.message
              }
            }
          }
          const currentTarget=allVariables.find((variable)=>variable.id===node.data.targetId)
          if (node.data.solveDiagnostics?.solved && currentTarget?.status === 'solved') {
            functionStatus = 'solved'
            functionStatusLabel = 'Solved successfully'
            functionMessage = node.data.solveDiagnostics.hadPendingDependencies
              ? 'Previously pending dependencies were resolved during Solve.'
              : 'All required inputs were already available.'
          }
          const targetVariables=currentTarget && !unknown.some((variable)=>variable.id===currentTarget.id) ? [...unknown,currentTarget] : unknown
          return {...node,data:{...node.data,targetVariables,allVariables,assignments,functionStatus,functionStatusLabel,functionMessage,functionValue,onRename:renameEquationBlock,onTargetChange:updateFunctionTarget,onOperandTypeChange:updateOperandType,onOperandValueChange:updateOperandValue,onOperatorChange:updateOperator,onAddOperand:addOperand,onRemoveOperand:removeOperand,onDropExpressionBlock:dropExpressionBlock}}
        }

        if (node.type === 'linearSystem') {
          const assignmentsByNodeId = new Map()
          equationNodes
            .filter((candidate) => ['linearSystem','targetFunction'].includes(candidate.type))
            .forEach((candidate) => {
              ;(candidate.type==='targetFunction' ? [candidate.data.targetId] : (candidate.data.variableIds ?? [])).forEach((variableId) => {
                if (variableId) {
                  assignmentsByNodeId.set(variableId, {
                    id: candidate.id,
                    label: candidate.data.label,
                  })
                }
              })
            })

          return {
            ...node,
            data: {
              ...node.data,
              unknownVariables: selectableVariables,
              expressionAliases: [...buildLinearExpressionAliases(allVariables).entries()].map(([alias, variable]) => {
                const producerId = functionDependencyAnalysis.producerByVariable.get(variable.id)
                const producerNode = producerId
                  ? equationNodes.find((candidate) => candidate.id === producerId)
                  : null
                return {
                  alias,
                  variableId: variable.id,
                  status: variable.status,
                  label: formatVariableReference(variable, { includeDescription: true }),
                  producerId: producerId || '',
                  producerLabel: producerNode?.data?.label || '',
                }
              }),
              assignments: assignmentsByNodeId,
              onRename: renameEquationBlock,
              onSizeChange: updateLinearSystemSize,
              onVariableChange: updateLinearSystemVariable,
              onMatrixChange: updateLinearSystemMatrix,
              onConstantChange: updateLinearSystemConstant,
              onAnalyze: analyzeLinearSystem,
            },
          }
        }

        return node
      }),
    [
      declarationValidation,
      equationNodes,
      renameEquationBlock,
      selectableVariables,
      analyzeLinearSystem,
      updateDeclarationField,
      updateLinearSystemConstant,
      updateLinearSystemMatrix,
      updateLinearSystemSize,
      updateLinearSystemVariable,
      updateFunctionTarget, updateOperandType, updateOperandValue, updateOperator, addOperand, removeOperand, dropExpressionBlock, allVariables, unknown, functionDependencyAnalysis,
    ],
  )

  useEffect(() => {
    if (isActive) return

    setEquationNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: false,
      })),
    )
  }, [isActive, setEquationNodes])

  const onPaletteDragStart = (event, blockType) => {
    event.dataTransfer.setData(
      'application/chemeflow-equation-block',
      blockType,
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  const onExpressionDragStart = (event, blockKind) => {
    event.dataTransfer.setData(
      'application/chemeflow-expression-block',
      blockKind,
    )
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()

      const blockType = event.dataTransfer.getData(
        'application/chemeflow-equation-block',
      )

      if (!['linearSystem', 'variableDeclaration', 'targetFunction'].includes(blockType)) return

      equationBlockCounter += 1

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const isDeclaration = blockType === 'variableDeclaration'
      const isFunction = blockType === 'targetFunction'

      setEquationNodes((currentNodes) => [
        ...currentNodes,
        {
          id: `${isDeclaration ? 'variable-declaration' : isFunction ? 'target-function' : 'linear-system'}-${crypto.randomUUID()}`,
          type: blockType,
          position,
          style: isDeclaration ? { width: 300, height: 340 } : isFunction ? { width: 380, height: 460 } : { width: 430, height: 600 },
          data: isDeclaration
            ? {
                label: `Variable Declaration ${equationBlockCounter}`,
                name: '',
                symbol: '',
                unit: 'dimensionless',
                status: 'unknown',
                value: '',
              }
            : isFunction ? { label: `Target Variable Function ${equationBlockCounter}`, targetId:'', expression:makeDefaultFunctionExpression() }
            : {
                label: `Linear System ${equationBlockCounter}`,
                size: 2,
                variableIds: ['', ''],
                matrix: makeEmptyMatrix(2),
                constants: makeEmptyVector(2),
                analysis: null,
                analysisStatus: 'idle',
                analysisError: '',
              },
        },
      ])
    },
    [screenToFlowPosition, setEquationNodes],
  )

  return (
    <div className="equations-layout">
      <aside className="equation-blocks-panel">
        <h2>Blocks</h2>
        <p>Drag blocks into the equations workspace.</p>

        <div className="equation-palette-section-title">Main blocks</div>

        <div
          className="equation-palette-item declaration"
          draggable
          onDragStart={(event) =>
            onPaletteDragStart(event, 'variableDeclaration')
          }
        >
          <div className="equation-palette-icon">x</div>
          <div>
            <strong>Variable Declaration</strong>
            <span>Create a specified or unknown variable</span>
          </div>
        </div>

        <div className="equation-palette-item function" draggable onDragStart={(event)=>onPaletteDragStart(event,'targetFunction')}>
          <div className="equation-palette-icon">f(x)</div><div><strong>Target Variable Function</strong><span>Calculate one target from an expression</span></div>
        </div>

        <div
          className="equation-palette-item linear"
          draggable
          onDragStart={(event) => onPaletteDragStart(event, 'linearSystem')}
        >
          <div className="equation-palette-icon">A·x</div>
          <div>
            <strong>Linear System</strong>
            <span>Square matrix block</span>
          </div>
        </div>

        <div className="equation-palette-section-title expression-title">Expression blocks</div>
        <p className="equation-expression-help">Drop these orange blocks inside a Target Variable Function.</p>

        <div className="expression-palette-grid">
          {[
            ['variable', 'Variable'],
            ['constant', 'Constant'],
            ['+', '+'],
            ['-', '-'],
            ['*', '*'],
            ['/', '/'],
            ['group', '( )'],
          ].map(([kind, label]) => (
            <div
              key={kind}
              className={`expression-palette-block ${['+', '-', '*', '/'].includes(kind) ? 'operator' : ''}`}
              draggable
              onDragStart={(event) => onExpressionDragStart(event, kind)}
              title={`Drag ${label} into a function expression`}
            >
              {label}
            </div>
          ))}
        </div>
      </aside>

      <section className="equation-canvas-shell">
        <div className="global-solve-control">
          <button type="button" className="global-solve-button" onClick={solveModel}>Solve</button>
          {modelSolveState.message && (
            <div className={`model-solve-status ${modelSolveState.status}`}>{modelSolveState.message}</div>
          )}
        </div>
        {!hasStreams && (
          <div className="equation-canvas-message">
            Add at least one stream in the flowsheet to detect variables.
          </div>
        )}

        <ReactFlow
          nodes={renderedNodes}
          edges={[]}
          nodeTypes={equationNodeTypes}
          onNodesChange={onEquationNodesChange}
          onDragOver={onDragOver}
          onDrop={onDrop}
          deleteKeyCode={isActive ? ['Backspace', 'Delete'] : null}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </section>

      <aside className="equation-inventory-panel">
        <h2 className="equation-panel-title">Variable Inventory</h2>

        <PythonEngineStatus />

        {streamConflicts.length > 0 && (
          <section className="stream-consistency-panel">
            <div className="stream-consistency-heading">
              <strong>Stream consistency</strong>
              <span>{streamConflicts.length}</span>
            </div>
            {streamConflicts.map((conflict, index) => (
              <div
                className="stream-consistency-item"
                key={`${conflict.streamId}-${index}`}
              >
                <strong>{conflict.streamName}</strong>
                <small>{conflict.message}</small>
              </div>
            ))}
          </section>
        )}

        <div className="equation-inventory-top">
          <div>
            <span>Calculation basis</span>
            <strong>{labels.basisName}</strong>
          </div>
          <div className="equation-inventory-total">
            {unknown.length} {unknown.length === 1 ? 'Unknown' : 'Unknowns'}
          </div>
        </div>

        <CompactVariableSection
          title="Known"
          variables={known}
          status="known"
        />
        <CompactVariableSection
          title="Calculated"
          variables={calculated}
          status="calculated"
        />
        <CompactVariableSection
          title="Unknown"
          variables={unknown}
          status="unknown"
        />
        <CompactVariableSection
          title="Solved"
          variables={solved}
          status="solved"
        />

        <section className="block-dependency-order">
          <div className="block-dependency-heading">
            <strong>Block dependency order</strong>
            <small>How ChemEFlow determines what can solve first</small>
          </div>
          {blockDependencySummary.length === 0 ? (
            <small>No equation blocks have been added.</small>
          ) : (
            <div className="block-dependency-list">
              {blockDependencySummary.map((item, index) => (
                <div className={`block-dependency-item ${item.statusTone}`} key={item.id}>
                  <span className="block-dependency-index">{item.isCompleted ? item.orderIndex + 1 : index + 1}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.status}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function EquationsPage({ isActive, components, edges, calculationBasis, onSolved, onInvalidated, projectNodes, projectLoadVersion, onProjectNodesChange }) {
  const { registry, labels } = buildVariableRegistry(
    edges,
    components,
    calculationBasis,
  )

  return (
    <main className="equations-page">
      <ReactFlowProvider>
        <EquationWorkspace
          isActive={isActive}
          registry={registry}
          labels={labels}
          hasStreams={edges.length > 0}
          components={components}
          onSolved={onSolved}
          onInvalidated={onInvalidated}
          projectNodes={projectNodes}
          projectLoadVersion={projectLoadVersion}
          onProjectNodesChange={onProjectNodesChange}
        />
      </ReactFlowProvider>
    </main>
  )
}

export default EquationsPage
