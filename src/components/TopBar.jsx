import brandWordmark from '../assets/branding/palabra.png'
import componentsIcon from '../assets/branding/morado.png'
import flowsheetIcon from '../assets/branding/azul.png'
import equationsIcon from '../assets/branding/rojo.png'
import resultsIcon from '../assets/branding/verde.png'

const tabs = [
  {
    id: 'components',
    label: 'Components',
    icon: componentsIcon,
  },
  {
    id: 'flowsheet',
    label: 'Flowsheet',
    icon: flowsheetIcon,
  },
  {
    id: 'equations',
    label: 'Equations',
    icon: equationsIcon,
  },
  {
    id: 'results',
    label: 'Results',
    icon: resultsIcon,
  },
]

function TopBar({
  activeTab,
  onTabChange,
  resultsEnabled = false,
  onSaveProject,
  onOpenProject,
}) {
  return (
    <header className="top-bar">
      <div className="app-brand" aria-label="ChemEFlow">
        <img
          className="app-brand-wordmark"
          src={brandWordmark}
          alt="ChemEFlow"
        />
      </div>

      <nav className="top-navigation" aria-label="Main workspace tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={tab.id === 'results' && !resultsEnabled}
            title={tab.id === 'results' && !resultsEnabled ? 'Solve the complete model to enable Results.' : ''}
            className={`top-tab top-tab-${tab.id} ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <img
              className={`top-tab-icon top-tab-icon-${tab.id}`}
              src={tab.icon}
              alt=""
              aria-hidden="true"
            />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="project-actions">
        <button type="button" className="project-action-button" onClick={onOpenProject}>
          Open Project
        </button>
        <button type="button" className="project-action-button primary" onClick={onSaveProject}>
          Save Project
        </button>
      </div>
    </header>
  )
}

export default TopBar
