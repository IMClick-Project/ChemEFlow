import { useMemo } from 'react'

function exportPickerType(filename) {
  const extension = filename.includes('.') ? `.${filename.split('.').pop().toLowerCase()}` : ''
  if (extension === '.py') {
    return { description: 'Python script', accept: { 'text/plain': ['.py'] } }
  }
  if (extension === '.m') {
    return { description: 'MATLAB script', accept: { 'text/plain': ['.m'] } }
  }
  if (extension === '.csv') {
    return { description: 'CSV file', accept: { 'text/csv': ['.csv'] } }
  }
  return { description: 'Text file', accept: { 'text/plain': extension ? [extension] : ['.txt'] } }
}

async function saveTextFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const canUseDirectSave = window.isSecureContext && typeof window.showSaveFilePicker === 'function'

  if (canUseDirectSave) {
    const handle = await window.showSaveFilePicker({
      id: `chemeflow-${filename.split('.').pop() || 'export'}`,
      suggestedName: filename,
      types: [exportPickerType(filename)],
      excludeAcceptAllOption: false,
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }

  // Fallback for browsers without the File System Access API. Script files
  // downloaded this way can trigger the browser's standard safety warning.
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function makeCsv(snapshot) {
  const rows = [['section', 'row', ...((snapshot.tables?.massFlow?.streams ?? []).map((stream) => stream.name))]]

  const definedVariables = snapshot.variables.filter(
    (variable) => variable.source === 'declaration' && variable.status !== 'unknown',
  )
  rows.push([])
  rows.push(['defined variables', 'name', 'value', 'unit', 'status', 'origin'])
  definedVariables.forEach((variable) => rows.push([
    'defined variables',
    variable.name ?? variable.symbol ?? '',
    variable.value ?? '',
    variable.unit ?? '',
    variable.status ?? '',
    variable.relation ?? 'Model input',
  ]))

  for (const [section, table] of Object.entries(snapshot.tables ?? {})) {
    rows.push([])
    rows.push([section, 'Component / Total', ...table.streams.map((stream) => stream.name)])
    if (!table.available) {
      rows.push([section, 'Unavailable', table.reason])
      continue
    }
    table.rows.forEach((row) => rows.push([
      section,
      row.label,
      ...table.streams.map((stream) => row.values[stream.id] ?? ''),
    ]))
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function safeIdentifier(value, fallback = 'variable') {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ṁ/g, 'm')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const candidate = normalized || fallback
  return /^[A-Za-z_]/.test(candidate) ? candidate : `v_${candidate}`
}

function buildVariableNames(model) {
  const used = new Set()
  const names = {}
  Object.values(model.variables ?? {}).forEach((variable, index) => {
    const descriptiveName = variable.source === 'stream'
      ? [variable.streamName, variable.componentName, variable.property].filter(Boolean).join('_')
      : (variable.name || variable.symbol || `variable_${index + 1}`)
    const base = safeIdentifier(descriptiveName, `variable_${index + 1}`).toLowerCase()
    let name = base
    let suffix = 2
    while (used.has(name)) {
      name = `${base}_${suffix}`
      suffix += 1
    }
    used.add(name)
    names[variable.id] = name
  })
  return names
}

function normalizeExpressionParts(expression) {
  if (Array.isArray(expression)) return expression
  if (!expression || typeof expression !== 'object') return []

  const operands = Array.isArray(expression.operands) ? expression.operands : []
  const operators = Array.isArray(expression.operators) ? expression.operators : []
  const parts = []

  operands.forEach((operand, index) => {
    parts.push(operand)
    if (index < operators.length) {
      const operator = operators[index]
      parts.push(typeof operator === 'string'
        ? { type: 'operator', operator }
        : operator)
    }
  })

  return parts
}

function expressionVariableIds(expression, result = []) {
  normalizeExpressionParts(expression).forEach((part, index) => {
    if (index % 2 === 1 || !part || typeof part !== 'object') return
    if (part.type === 'variable') {
      const variableId = part.variableId ?? part.value
      if (variableId && !result.includes(variableId)) result.push(variableId)
    }
    if (part.type === 'group') expressionVariableIds(part.expression, result)
  })
  return result
}

function readableExpression(expression, names, language) {
  return normalizeExpressionParts(expression).map((part, index) => {
    if (index % 2 === 1) {
      if (typeof part === 'string') return ` ${part} `
      return ` ${part?.operator ?? part?.value ?? '+'} `
    }
    if (!part || typeof part !== 'object') return language === 'matlab' ? 'NaN' : 'float("nan")'
    if (part.type === 'constant') return String(Number(part.value))
    if (part.type === 'variable') {
      const variableId = part.variableId ?? part.value
      return names[variableId] ?? safeIdentifier(variableId)
    }
    if (part.type === 'group') return `(${readableExpression(part.expression, names, language)})`
    return language === 'matlab' ? 'NaN' : 'float("nan")'
  }).join('')
}

function readableLinearCell(expression, aliasMap, names) {
  let result = String(expression ?? '').trim() || '0'
  const aliases = Object.entries(aliasMap ?? {}).sort((a, b) => b[0].length - a[0].length)
  aliases.forEach(([alias, variableId]) => {
    const replacement = names[variableId] ?? safeIdentifier(variableId)
    result = result.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), replacement)
  })
  return result
}

function linearExpressionVariableIds(block) {
  const aliases = block.expressionAliases ?? {}
  const text = [...(block.matrix ?? []).flat(), ...(block.constants ?? [])].join(' ')
  return Object.entries(aliases)
    .filter(([alias]) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
    .map(([, id]) => id)
}

function buildReadableOperations(snapshot) {
  const model = snapshot.exportModel
  const metadata = model.variables ?? {}
  const streamLookup = new Map()
  Object.values(metadata).forEach((variable) => {
    if (variable.source !== 'stream') return
    streamLookup.set(`${variable.streamId}|${variable.componentId ?? ''}|${variable.property}`, variable.id)
  })

  const blockById = new Map()
  ;(model.linearSystems ?? []).forEach((block) => {
    blockById.set(block.id, {
      type: 'linear', id: block.id, label: block.label,
      deps: linearExpressionVariableIds(block), outputs: block.variableIds, block,
    })
  })
  ;(model.targetFunctions ?? []).forEach((block) => {
    blockById.set(block.id, {
      type: 'target', id: block.id, label: block.label,
      deps: expressionVariableIds(block.expression), outputs: [block.targetId], block,
    })
  })

  const orderedBlocks = (model.resolutionOrder ?? [])
    .map((entry) => blockById.get(entry.id))
    .filter(Boolean)
  blockById.forEach((operation) => {
    if (!orderedBlocks.some((item) => item.id === operation.id)) orderedBlocks.push(operation)
  })

  const calculatedStreamVariables = (snapshot.variables ?? []).filter(
    (variable) => variable.source === 'stream' && variable.status === 'calculated',
  )
  const skippedClosureIds = new Set()
  const streamOperations = []

  // When several fractions are left unspecified but the specified fractions
  // already sum to one, non-negativity makes every remaining fraction zero.
  const closureByStream = new Map()
  calculatedStreamVariables.forEach((variable) => {
    const meta = metadata[variable.id]
    if (!meta || meta.property !== 'fraction' || String(variable.relation).includes('/')) return
    if (!closureByStream.has(meta.streamId)) closureByStream.set(meta.streamId, [])
    closureByStream.get(meta.streamId).push(variable.id)
  })
  closureByStream.forEach((outputIds, streamId) => {
    if (outputIds.length < 2) return
    const allFractionIds = Object.values(metadata)
      .filter((item) => item.source === 'stream' && item.streamId === streamId && item.property === 'fraction')
      .map((item) => item.id)
    const knownIds = allFractionIds.filter((id) => !outputIds.includes(id))
    const allKnownAreInputs = knownIds.every((id) => Object.prototype.hasOwnProperty.call(model.inputs ?? {}, id))
    const knownSum = knownIds.reduce((sum, id) => sum + Number(model.inputs?.[id] ?? 0), 0)
    if (!allKnownAreInputs || Math.abs(knownSum - 1) > 1e-10) return

    outputIds.forEach((id) => skippedClosureIds.add(id))
    const streamName = metadata[outputIds[0]]?.streamName ?? streamId
    streamOperations.push({
      type: 'streamGroup',
      id: `stream-zero-closure:${streamId}`,
      label: `${streamName}: zero remaining composition`,
      deps: knownIds,
      outputs: outputIds,
      streamName,
      formula: { kind: 'zeroRemainder', knownIds },
    })
  })

  calculatedStreamVariables.forEach((variable) => {
    if (skippedClosureIds.has(variable.id)) return
    const meta = metadata[variable.id]
    if (!meta) return
    const componentIds = Object.values(metadata)
      .filter((item) => item.source === 'stream' && item.streamId === meta.streamId && item.componentId)
      .map((item) => item.componentId)
    const uniqueComponents = [...new Set(componentIds)]
    const totalId = streamLookup.get(`${meta.streamId}||totalFlow`)
    const ownFlowId = meta.componentId ? streamLookup.get(`${meta.streamId}|${meta.componentId}|componentFlow`) : null
    const ownFractionId = meta.componentId ? streamLookup.get(`${meta.streamId}|${meta.componentId}|fraction`) : null
    let deps = []
    let formula = null

    if (meta.property === 'totalFlow') {
      deps = uniqueComponents.map((id) => streamLookup.get(`${meta.streamId}|${id}|componentFlow`)).filter(Boolean)
      formula = { kind: 'sum', ids: deps }
    } else if (meta.property === 'componentFlow') {
      if (String(variable.relation).includes('×')) {
        deps = [totalId, ownFractionId].filter(Boolean)
        formula = { kind: 'multiply', ids: deps }
      } else if (uniqueComponents.length === 1) {
        deps = [totalId].filter(Boolean)
        formula = { kind: 'copy', ids: deps }
      } else {
        const otherFlows = uniqueComponents
          .filter((id) => id !== meta.componentId)
          .map((id) => streamLookup.get(`${meta.streamId}|${id}|componentFlow`))
          .filter(Boolean)
        deps = [totalId, ...otherFlows].filter(Boolean)
        formula = { kind: 'remainder', totalId, otherIds: otherFlows }
      }
    } else if (meta.property === 'fraction') {
      if (uniqueComponents.length === 1) {
        formula = { kind: 'constant', value: 1 }
      } else if (String(variable.relation).includes('/')) {
        deps = [ownFlowId, totalId].filter(Boolean)
        formula = { kind: 'divide', ids: deps }
      } else {
        const otherFractions = uniqueComponents
          .filter((id) => id !== meta.componentId)
          .map((id) => streamLookup.get(`${meta.streamId}|${id}|fraction`))
          .filter(Boolean)
        deps = otherFractions
        formula = { kind: 'closure', ids: otherFractions }
      }
    }

    if (formula) streamOperations.push({
      type: 'stream', id: `stream:${variable.id}`, label: variable.relation || variable.name,
      deps, outputs: [variable.id], targetId: variable.id, formula,
    })
  })

  const available = new Set(Object.keys(model.inputs ?? {}))
  const pendingStreams = [...streamOperations]
  const pendingBlocks = [...orderedBlocks]
  const initial = []
  const sequence = []

  const propagateStreams = (destination) => {
    let changed = true
    while (changed) {
      changed = false
      for (let index = 0; index < pendingStreams.length; index += 1) {
        const operation = pendingStreams[index]
        if (!operation.deps.every((id) => available.has(id))) continue
        pendingStreams.splice(index, 1)
        destination.push(operation)
        operation.outputs.forEach((id) => available.add(id))
        changed = true
        break
      }
    }
  }

  // First derive everything that depends only on user inputs.
  propagateStreams(initial)

  // Then alternate one ready equation block with all newly available stream relations.
  while (pendingBlocks.length) {
    const index = pendingBlocks.findIndex((operation) => operation.deps.every((id) => available.has(id)))
    if (index < 0) break
    const [operation] = pendingBlocks.splice(index, 1)
    sequence.push(operation)
    operation.outputs.forEach((id) => available.add(id))
    propagateStreams(sequence)
  }

  return {
    initial,
    sequence,
    unresolved: [...pendingBlocks, ...pendingStreams],
  }
}
function streamFormula(formula, names, language) {
  const join = (ids, operator) => ids.map((id) => names[id]).join(` ${operator} `)
  if (formula.kind === 'constant') return String(formula.value)
  if (formula.kind === 'copy') return names[formula.ids[0]]
  if (formula.kind === 'multiply') return join(formula.ids, '*')
  if (formula.kind === 'divide') return join(formula.ids, '/')
  if (formula.kind === 'sum') return join(formula.ids, '+') || '0'
  if (formula.kind === 'closure') return `1 - (${join(formula.ids, '+') || '0'})`
  if (formula.kind === 'remainder') return `${names[formula.totalId]} - (${join(formula.otherIds, '+') || '0'})`
  return language === 'matlab' ? 'NaN' : 'float("nan")'
}

function numberLiteral(value) {
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : '0.0'
}


function buildTableExportData(snapshot, names) {
  const model = snapshot.exportModel
  const variables = Object.values(model.variables ?? {})
  const byKey = new Map()
  variables.forEach((variable) => {
    if (variable.source !== 'stream') return
    byKey.set(`${variable.streamId}|${variable.componentId ?? ''}|${variable.property}`, variable.id)
  })
  const mwByComponent = new Map((model.components ?? []).map((component) => [component.id, Number(component.molecularWeight)]))
  const basis = snapshot.calculationBasis

  const direct = (streamId, componentId, property) => {
    const id = byKey.get(`${streamId}|${componentId ?? ''}|${property}`)
    return id ? names[id] : null
  }

  const flowExpression = (targetBasis, streamId, componentId) => {
    const primary = direct(streamId, componentId, 'componentFlow')
    if (!primary) return 'float("nan")'
    if (basis === targetBasis) return primary
    const mw = mwByComponent.get(componentId)
    if (!Number.isFinite(mw) || mw <= 0) return 'float("nan")'
    return targetBasis === 'molar' ? `(${primary} / ${mw})` : `(${primary} * ${mw})`
  }

  const tableSpec = (key, targetBasis, kind) => {
    const table = snapshot.tables?.[key]
    if (!table?.available) return null
    const componentRows = table.rows.filter((row) => row.id !== '__total__')
    const streamNames = table.streams.map((stream) => stream.name)
    const rowLabels = componentRows.map((row) => row.label)
    const matrix = componentRows.map((row) => table.streams.map((stream) => {
      if (kind === 'flow') return flowExpression(targetBasis, stream.id, row.id)
      if (basis === targetBasis) return direct(stream.id, row.id, 'fraction') ?? 'float("nan")'
      const flows = componentRows.map((component) => flowExpression(targetBasis, stream.id, component.id))
      const numerator = flowExpression(targetBasis, stream.id, row.id)
      return `(${numerator} / (${flows.join(' + ')}))`
    }))
    return { key, variableName: key, title: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), unit: table.unit, streamNames, rowLabels, matrix, kind }
  }

  return [
    tableSpec('massComposition', 'mass', 'composition'),
    tableSpec('massFlow', 'mass', 'flow'),
    tableSpec('molarComposition', 'molar', 'composition'),
    tableSpec('molarFlow', 'molar', 'flow'),
  ].filter(Boolean)
}

function exportedDefinedVariables(snapshot, names) {
  return (snapshot.variables ?? [])
    .filter((variable) => (
      (variable.source === 'user' || variable.source === 'declaration')
      && variable.status !== 'unknown'
      && names[variable.id]
    ))
    .sort((a, b) => String(a.name ?? a.symbol ?? a.id).localeCompare(
      String(b.name ?? b.symbol ?? b.id),
      undefined,
      { numeric: true, sensitivity: 'base' },
    ))
}

function pythonDefinedVariables(snapshot, names) {
  const variables = exportedDefinedVariables(snapshot, names)
  if (variables.length === 0) return '# No solved user-defined variables'

  const rows = variables.map((variable) => (
    `    [${JSON.stringify(variable.name ?? variable.symbol ?? variable.id)}, ${names[variable.id]}, ${JSON.stringify(variable.unit ?? '')}, ${JSON.stringify(variable.status ?? '')}, ${JSON.stringify(variable.relation ?? 'Model input')}]`
  )).join(',\n')

  return `defined_variables = pd.DataFrame([\n${rows}\n], columns=["Name", "Value", "Unit", "Status", "Origin block"])\nprint("\\nDefined variables")\nprint(defined_variables.to_string(index=False))`
}

function matlabDefinedVariables(snapshot, names) {
  const variables = exportedDefinedVariables(snapshot, names)
  if (variables.length === 0) return '% No solved user-defined variables'

  const variableNames = variables.map((variable) => `'${matlabQuote(variable.name ?? variable.symbol ?? variable.id)}'`).join('; ')
  const values = variables.map((variable) => names[variable.id]).join('; ')
  const units = variables.map((variable) => `'${matlabQuote(variable.unit ?? '')}'`).join('; ')
  const statuses = variables.map((variable) => `'${matlabQuote(variable.status ?? '')}'`).join('; ')
  const origins = variables.map((variable) => `'${matlabQuote(variable.relation ?? 'Model input')}'`).join('; ')

  return `definedVariables = table( ...\n    string({${variableNames}}), ...\n    [${values}], ...\n    string({${units}}), ...\n    string({${statuses}}), ...\n    string({${origins}}), ...\n    'VariableNames', {'Name', 'Value', 'Unit', 'Status', 'OriginBlock'});\ndisp('Defined variables')\ndisp(definedVariables)`
}

function pythonTables(snapshot, names) {
  const specs = buildTableExportData(snapshot, names)
  return specs.map((spec) => {
    const matrixRows = spec.matrix.map((row) => `    [${row.join(', ')}]`).join(',\n')
    const baseName = safeIdentifier(spec.variableName).toLowerCase()
    const total = spec.kind === 'flow'
      ? `${baseName}_values.sum(axis=0, keepdims=True)`
      : `${baseName}_values.sum(axis=0, keepdims=True)`
    return `# ${spec.title} [${spec.unit}]\n${baseName}_values = np.array([\n${matrixRows}\n], dtype=float)\n${baseName}_values = np.vstack([${baseName}_values, ${total}])\n${baseName} = pd.DataFrame(\n    ${baseName}_values,\n    index=${JSON.stringify([...spec.rowLabels, 'Total'])},\n    columns=${JSON.stringify(spec.streamNames)},\n)\nprint("\\n${spec.title} [${spec.unit}]")\nprint(${baseName}.to_string())`
  }).join('\n\n')
}

function matlabTables(snapshot, names) {
  const specs = buildTableExportData(snapshot, names)
  return specs.map((spec) => {
    const baseName = safeIdentifier(spec.variableName)
    const rows = spec.matrix.map((row) => `    ${row.join(', ')}`).join(';\n')
    const varNames = spec.streamNames.map((name) => `'${matlabQuote(safeIdentifier(name))}'`).join(', ')
    const rowNames = [...spec.rowLabels, 'Total'].map((name) => `'${matlabQuote(name)}'`).join('; ')
    return `%% ${spec.title} [${spec.unit}]\n${baseName}Values = [\n${rows}\n];\n${baseName}Values = [${baseName}Values; sum(${baseName}Values, 1)];\n${baseName} = array2table(${baseName}Values, 'VariableNames', {${varNames}}, 'RowNames', {${rowNames}});\ndisp('${matlabQuote(spec.title)} [${matlabQuote(spec.unit)}]')\ndisp(${baseName})`
  }).join('\n\n')
}

function makePython(snapshot) {
  const model = snapshot.exportModel
  const names = buildVariableNames(model)
  const inputLines = Object.entries(model.inputs ?? {}).map(([id, value]) => {
    const meta = model.variables?.[id] ?? {}
    return `${names[id]} = ${numberLiteral(value)}  # ${meta.name ?? meta.symbol ?? id}`
  })

  const functionDefinitions = (model.targetFunctions ?? []).map((block, index) => {
    const parameters = expressionVariableIds(block.expression)
    const functionName = `target_${safeIdentifier(block.label || `function_${index + 1}`).toLowerCase()}`
    return {
      id: block.id,
      targetId: block.targetId,
      parameters,
      functionName,
      code: `def ${functionName}(${parameters.map((id) => names[id]).join(', ')}):\n    return ${readableExpression(block.expression, names, 'python')}`,
    }
  })
  const functionsById = new Map(functionDefinitions.map((item) => [item.id, item]))
  const schedule = buildReadableOperations(snapshot)
  let linearCounter = 0

  const operationLines = (operation) => {
    if (operation.type === 'linear') {
      const block = operation.block
      linearCounter += 1
      const suffix = linearCounter
      return [
        `# ${block.label}`,
        `A_${suffix} = np.array([\n${block.matrix.map((row) => `    [${row.map((cell) => readableLinearCell(cell, block.expressionAliases, names)).join(', ')}]`).join(',\n')}\n], dtype=float)`,
        `b_${suffix} = np.array([${block.constants.map((cell) => readableLinearCell(cell, block.expressionAliases, names)).join(', ')}], dtype=float)`,
        `x_${suffix} = np.linalg.solve(A_${suffix}, b_${suffix})`,
        ...block.variableIds.map((id, variableIndex) => `${names[id]} = x_${suffix}[${variableIndex}]`),
        '',
      ]
    }
    if (operation.type === 'streamGroup') {
      return [
        `# ${operation.label}`,
        `# Remaining unspecified fractions are zero for the exported solved case.`,
        ...operation.outputs.map((id) => `${names[id]} = 0.0`),
        '',
      ]
    }
    if (operation.type === 'stream') {
      return [
        `# ${operation.label}`,
        `${names[operation.targetId]} = ${streamFormula(operation.formula, names, 'python')}`,
        '',
      ]
    }
    const fn = functionsById.get(operation.id)
    if (!fn) return []
    return [
      `# ${operation.label}`,
      `${names[fn.targetId]} = ${fn.functionName}(${fn.parameters.map((id) => names[id]).join(', ')})`,
      '',
    ]
  }

  const initialLines = schedule.initial.flatMap(operationLines)
  const solutionLines = schedule.sequence.flatMap(operationLines)
  const unresolvedLines = schedule.unresolved.length > 0
    ? [
      '# WARNING: The following operations could not be ordered from the available inputs:',
      ...schedule.unresolved.map((operation) => `# - ${operation.label}`),
      'raise RuntimeError("The exported model contains unresolved or circular dependencies.")',
      '',
    ]
    : []

  const resultLines = snapshot.variables
    .filter((variable) => variable.status !== 'unknown' && names[variable.id])
    .map((variable) => `print("${String(variable.name ?? variable.symbol ?? variable.id).replaceAll('"', '\\"')} =", ${names[variable.id]})`)

  return `# Generated by ChemEFlow\n# Change the values in INPUTS and run the file again.\n\nimport numpy as np\nimport pandas as pd\n\n# ---------------- INPUTS ----------------\n${inputLines.join('\n') || '# No specified inputs'}\n\n# --------- INITIAL CALCULATIONS ---------\n${initialLines.join('\n') || '# No values can be derived from inputs alone.'}\n\n# ---------- TARGET FUNCTIONS -----------\n${functionDefinitions.map((item) => item.code).join('\n\n') || '# No target functions'}\n\n# ----------- SOLVE SEQUENCE ------------\n${solutionLines.join('\n') || '# No Linear Systems or Target Variable Functions were required.'}\n${unresolvedLines.join('\n')}# ------------- RESULTS -----------------\n${pythonDefinedVariables(snapshot, names)}\n\n${pythonTables(snapshot, names) || (resultLines.join('\n') || 'print("No stream tables")')}\n`
}
function matlabQuote(value) {
  return String(value ?? '').replaceAll("'", "''")
}

function makeMatlab(snapshot) {
  const model = snapshot.exportModel
  const names = buildVariableNames(model)
  const inputLines = Object.entries(model.inputs ?? {}).map(([id, value]) => {
    const meta = model.variables?.[id] ?? {}
    return `${names[id]} = ${numberLiteral(value)}; % ${meta.name ?? meta.symbol ?? id}`
  })

  const functionDefinitions = (model.targetFunctions ?? []).map((block, index) => {
    const parameters = expressionVariableIds(block.expression)
    const functionName = `target_${safeIdentifier(block.label || `function_${index + 1}`).toLowerCase()}`
    return {
      id: block.id,
      targetId: block.targetId,
      parameters,
      functionName,
      code: `function result = ${functionName}(${parameters.map((id) => names[id]).join(', ')})\n    result = ${readableExpression(block.expression, names, 'matlab')};\nend`,
    }
  })
  const functionsById = new Map(functionDefinitions.map((item) => [item.id, item]))
  const schedule = buildReadableOperations(snapshot)
  let linearCounter = 0

  const operationLines = (operation) => {
    if (operation.type === 'linear') {
      const block = operation.block
      linearCounter += 1
      const suffix = linearCounter
      const matrix = `[${block.matrix.map((row) => row.map((cell) => readableLinearCell(cell, block.expressionAliases, names)).join(', ')).join('; ')}]`
      const constants = `[${block.constants.map((cell) => readableLinearCell(cell, block.expressionAliases, names)).join('; ')}]`
      return [
        `% ${block.label}`,
        `A_${suffix} = ${matrix};`,
        `b_${suffix} = ${constants};`,
        `x_${suffix} = A_${suffix} \\ b_${suffix};`,
        ...block.variableIds.map((id, variableIndex) => `${names[id]} = x_${suffix}(${variableIndex + 1});`),
        '',
      ]
    }
    if (operation.type === 'streamGroup') {
      return [
        `% ${operation.label}`,
        `% Remaining unspecified fractions are zero for the exported solved case.`,
        ...operation.outputs.map((id) => `${names[id]} = 0.0;`),
        '',
      ]
    }
    if (operation.type === 'stream') {
      return [
        `% ${operation.label}`,
        `${names[operation.targetId]} = ${streamFormula(operation.formula, names, 'matlab')};`,
        '',
      ]
    }
    const fn = functionsById.get(operation.id)
    if (!fn) return []
    return [
      `% ${operation.label}`,
      `${names[fn.targetId]} = ${fn.functionName}(${fn.parameters.map((id) => names[id]).join(', ')});`,
      '',
    ]
  }

  const initialLines = schedule.initial.flatMap(operationLines)
  const solutionLines = schedule.sequence.flatMap(operationLines)
  const unresolvedLines = schedule.unresolved.length > 0
    ? [
      '% WARNING: The following operations could not be ordered from the available inputs:',
      ...schedule.unresolved.map((operation) => `% - ${operation.label}`),
      `error('The exported model contains unresolved or circular dependencies.');`,
      '',
    ]
    : []

  const resultLines = snapshot.variables
    .filter((variable) => variable.status !== 'unknown' && names[variable.id])
    .map((variable) => `fprintf('${matlabQuote(variable.name ?? variable.symbol ?? variable.id)} = %.10g\\n', ${names[variable.id]});`)

  return `% Generated by ChemEFlow\n% Change the values in INPUTS and run the script again.\n\nclear; clc;\n\n%% INPUTS\n${inputLines.join('\n') || '% No specified inputs'}\n\n%% INITIAL CALCULATIONS\n${initialLines.join('\n') || '% No values can be derived from inputs alone.'}\n\n%% SOLVE SEQUENCE\n${solutionLines.join('\n') || '% No Linear Systems or Target Variable Functions were required.'}\n${unresolvedLines.join('\n')}%% RESULTS\n${matlabDefinedVariables(snapshot, names)}\n\n${matlabTables(snapshot, names) || (resultLines.join('\n') || "disp('No stream tables')")}\n\n%% TARGET FUNCTIONS\n${functionDefinitions.map((item) => item.code).join('\n\n') || '% No target functions'}\n`
}
function formatValue(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function resultStatusClass(status) {
  if (status === 'specified') return 'known'
  if (status === 'solved') return 'solved'
  if (status === 'calculated') return 'calculated'
  if (status === 'known' || status === 'calculated' || status === 'solved') return status
  return 'calculated'
}

function DefinedVariablesTable({ variables }) {
  return (
    <section className="results-card">
      <h2>Defined variables</h2>
      {variables.length === 0 ? (
        <p className="results-empty">No solved user-defined variables.</p>
      ) : (
        <div className="results-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Origin block</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((variable) => (
                <tr key={variable.id}>
                  <td>{variable.name || variable.symbol}</td>
                  <td className={`results-answer-cell ${resultStatusClass(variable.status)}`}>{formatValue(variable.value)}</td>
                  <td>{variable.unit || '—'}</td>
                  <td>{variable.status}</td>
                  <td>{variable.relation || 'Model input'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function StreamTable({ title, table }) {
  return (
    <section className="results-card">
      <div className="results-card-heading">
        <h2>{title}</h2>
        {!table.available && <span className="unavailable-badge">Unavailable</span>}
      </div>
      {!table.available ? (
        <p className="results-empty">{table.reason}</p>
      ) : (
        <div className="results-table-wrap">
          <table className="results-stream-matrix">
            <thead>
              <tr>
                <th>Component</th>
                {table.streams.map((stream) => (
                  <th key={stream.id}>{stream.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.id} className={row.id === '__total__' ? 'results-total-row' : ''}>
                  <th scope="row">{row.label}</th>
                  {table.streams.map((stream) => (
                    <td
                      key={stream.id}
                      className={row.values[stream.id] === '' ? '' : `results-answer-cell ${resultStatusClass(row.statuses?.[stream.id])}`}
                    >
                      {formatValue(row.values[stream.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <small className="results-unit">Unit: {table.unit}</small>
        </div>
      )}
    </section>
  )
}

async function exportGeneratedFile(filename, builder, snapshot, type) {
  try {
    const content = builder(snapshot)
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('The generated file is empty.')
    }
    await saveTextFile(filename, content, type)
  } catch (error) {
    if (error?.name === 'AbortError') return
    console.error(`Could not export ${filename}:`, error)
    window.alert(`Could not export ${filename}. ${error?.message ?? 'Unknown export error.'}`)
  }
}

export default function ResultsPage({ snapshot }) {
  const definedVariables = useMemo(() => (
    snapshot?.variables
      .filter((variable) => (
        variable.source === 'declaration' && variable.status !== 'unknown'
      ))
      .sort((a, b) => String(a.name || a.symbol).localeCompare(
        String(b.name || b.symbol),
        undefined,
        { numeric: true, sensitivity: 'base' },
      )) ?? []
  ), [snapshot])

  if (!snapshot) {
    return (
      <main className="results-page">
        <div className="results-locked">
          <h1>Results unavailable</h1>
          <p>Solve the complete model again to enable this tab.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="results-page">
      <div className="results-header">
        <div><h1>Results</h1></div>
        <div className="results-actions">
          <button type="button" onClick={() => exportGeneratedFile('chemeflow_results.csv', makeCsv, snapshot, 'text/csv;charset=utf-8')}>Export CSV</button>
          <button type="button" onClick={() => exportGeneratedFile('chemeflow_model.py', makePython, snapshot, 'text/x-python;charset=utf-8')}>Export Python</button>
          <button type="button" onClick={() => exportGeneratedFile('chemeflow_model.m', makeMatlab, snapshot, 'text/plain;charset=utf-8')}>Export MATLAB</button>
        </div>
      </div>

      <DefinedVariablesTable variables={definedVariables} />
      <StreamTable title="Mass composition" table={snapshot.tables.massComposition} />
      <StreamTable title="Mass flow" table={snapshot.tables.massFlow} />
      <StreamTable title="Molar composition" table={snapshot.tables.molarComposition} />
      <StreamTable title="Molar flow" table={snapshot.tables.molarFlow} />
    </main>
  )
}
