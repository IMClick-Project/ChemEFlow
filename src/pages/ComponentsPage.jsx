import { useState } from 'react'

function ComponentsPage({
  components,
  onAddComponent,
  onUpdateComponent,
  onChangeComponentProperty,
  onDeleteComponent,
}) {
  const [errors, setErrors] = useState({})

  const setComponentError = (
    componentId,
    field,
    message,
  ) => {
    setErrors((currentErrors) => ({
      ...currentErrors,
      [componentId]: {
        ...currentErrors[componentId],
        [field]: message,
      },
    }))
  }

  const clearComponentError = (
    componentId,
    field,
  ) => {
    setErrors((currentErrors) => ({
      ...currentErrors,
      [componentId]: {
        ...currentErrors[componentId],
        [field]: '',
      },
    }))
  }

  const showTemporaryComponentError = (
  componentId,
  field,
  message,
) => {
  setComponentError(
    componentId,
    field,
    message,
  )

  window.setTimeout(() => {
    clearComponentError(
      componentId,
      field,
    )
  }, 2500)
}

  const validateComponentName = (
    componentId,
    newName,
  ) => {
    const cleanName = newName.trim()

    if (!cleanName) {
      return {
        success: false,
        message: 'Component name is required.',
      }
    }

    const duplicatedName = components.some(
      (component) =>
        component.id !== componentId &&
        component.name.trim().toLowerCase() ===
          cleanName.toLowerCase(),
    )

    if (duplicatedName) {
      return {
        success: false,
        message:
          'This component name is already in use.',
      }
    }

    return {
      success: true,
      cleanName,
    }
  }

  const saveComponentName = (
    componentId,
    newName,
  ) => {
    const validation = validateComponentName(
      componentId,
      newName,
    )

    if (!validation.success) {
      setComponentError(
        componentId,
        'name',
        validation.message,
      )
      return
    }

    onUpdateComponent(componentId, {
      name: validation.cleanName,
    })

    clearComponentError(componentId, 'name')
  }

  const onPropertyDragStart = (
    event,
    propertyType,
  ) => {
    event.dataTransfer.setData(
      'application/chemeflow-property',
      propertyType,
    )

    event.dataTransfer.effectAllowed = 'copy'
  }

  const onComponentDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onPropertyDrop = (
    event,
    component,
  ) => {
    event.preventDefault()

    const propertyType =
      event.dataTransfer.getData(
        'application/chemeflow-property',
      )

    if (propertyType !== 'molecularWeight') {
      return
    }

    if (component.hasMolecularWeight) {
      showTemporaryComponentError(
        component.id,
        'property',
        'This component already has a Molecular Weight property.',
      )

      return
    }

    const propertyWasAdded =
      onChangeComponentProperty(
        component.id,
        {
          hasMolecularWeight: true,
          molecularWeight: '',
        },
      )

    if (!propertyWasAdded) {
      return
    }

    clearComponentError(
      component.id,
      'property',
    )

    setComponentError(
      component.id,
      'molecularWeight',
      'Molecular weight is required.',
    )
  }

  const removeMolecularWeight = (
    componentId,
  ) => {
    const propertyWasRemoved =
      onChangeComponentProperty(
        componentId,
        {
          hasMolecularWeight: false,
          molecularWeight: '',
        },
      )

    if (!propertyWasRemoved) {
      return
    }

    clearComponentError(
      componentId,
      'molecularWeight',
    )

    clearComponentError(
      componentId,
      'property',
    )
  }

  const updateMolecularWeight = (
    componentId,
    value,
  ) => {
    onUpdateComponent(componentId, {
      molecularWeight: value,
    })

    if (value === '') {
      setComponentError(
        componentId,
        'molecularWeight',
        'Molecular weight is required.',
      )
      return
    }

    const numericValue = Number(value)

    if (
      !Number.isFinite(numericValue) ||
      numericValue <= 0
    ) {
      setComponentError(
        componentId,
        'molecularWeight',
        'Molecular weight must be greater than zero.',
      )
      return
    }

    clearComponentError(
      componentId,
      'molecularWeight',
    )
  }

  const validateMolecularWeight = (
    componentId,
    value,
  ) => {
    if (value === '') {
      setComponentError(
        componentId,
        'molecularWeight',
        'Molecular weight is required.',
      )
      return
    }

    const numericValue = Number(value)

    if (
      Number.isNaN(numericValue) ||
      numericValue <= 0
    ) {
      setComponentError(
        componentId,
        'molecularWeight',
        'Molecular weight must be greater than zero.',
      )
      return
    }

    clearComponentError(
      componentId,
      'molecularWeight',
    )
  }

  return (
    <main className="components-page">
      <button
        type="button"
        className="add-component-button floating"
        onClick={onAddComponent}
      >
        Add Component
      </button>

      <div className="components-layout">
        <aside className="property-blocks-panel">
          <h2>Blocks</h2>

          <p>
            Drag a property into a component.
          </p>

          <div
            className="property-palette-item"
            draggable
            onDragStart={(event) =>
              onPropertyDragStart(
                event,
                'molecularWeight',
              )
            }
          >
            <span>Molecular Weight</span>
            <span className="property-palette-unit">
              g/mol
            </span>
          </div>
        </aside>

        <section className="component-workspace-area">
          {components.length === 0 ? (
            <div className="components-empty">
              <h2>No components declared</h2>

              <p>
                Add a component to begin building
                the project component library.
              </p>
            </div>
          ) : (
            <div className="component-workspace">
              {components.map((component) => {
                const componentErrors =
                  errors[component.id] ?? {}

                return (
                  <article
                    key={component.id}
                    className="component-declaration-block"
                    onDragOver={onComponentDragOver}
                    onDrop={(event) =>
                      onPropertyDrop(
                        event,
                        component,
                      )
                    }
                  >
                    <div className="component-block-header">
                      <span className="component-block-command">
                        Declare Component
                      </span>

                      <input
                        className={`component-name-socket ${
                          componentErrors.name
                            ? 'input-error'
                            : ''
                        }`}
                        type="text"
                        value={component.name}
                        onChange={(event) => {
                          onUpdateComponent(
                            component.id,
                            {
                              name:
                                event.target.value,
                            },
                          )

                          clearComponentError(
                            component.id,
                            'name',
                          )
                        }}
                        onBlur={(event) =>
                          saveComponentName(
                            component.id,
                            event.target.value,
                          )
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter'
                          ) {
                            event.currentTarget.blur()
                          }
                        }}
                        maxLength={30}
                      />

                      <button
                        type="button"
                        className="component-delete-button"
                        onClick={() =>
                          onDeleteComponent(
                            component.id,
                          )
                        }
                        title="Delete component"
                      >
                        ×
                      </button>
                    </div>

                    {componentErrors.name && (
                      <div className="component-error-message">
                        {componentErrors.name}
                      </div>
                    )}

                    <div
                      className={`component-block-body ${
                        component.hasMolecularWeight
                          ? 'has-property'
                          : 'empty-drop-zone'
                      }`}
                    >
                      {!component.hasMolecularWeight && (
                        <div className="property-drop-message">
                          Drop a property block here
                        </div>
                      )}

                      {component.hasMolecularWeight && (
                        <div className="property-puzzle-block">
                          <div className="property-selector-block">
                            Molecular Weight
                          </div>

                          <div className="number-value-block">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              value={
                                component.molecularWeight
                              }
                              onChange={(event) =>
                                updateMolecularWeight(
                                  component.id,
                                  event.target.value,
                                )
                              }
                              onBlur={(event) =>
                                validateMolecularWeight(
                                  component.id,
                                  event.target.value,
                                )
                              }
                              placeholder="0.000"
                            />
                          </div>

                          <div className="unit-block">
                            g/mol
                          </div>

                          <button
                            type="button"
                            className="remove-property-button"
                            onClick={() =>
                              removeMolecularWeight(
                                component.id,
                              )
                            }
                            title="Remove property"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      {componentErrors.property && (
                        <div className="component-error-message">
                          {componentErrors.property}
                        </div>
                      )}

                      {componentErrors.molecularWeight && (
                        <div className="component-error-message">
                          {
                            componentErrors.molecularWeight
                          }
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default ComponentsPage