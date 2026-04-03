import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Network, FileText, MessageSquare, Settings } from 'lucide-react'
import { fetchOntologies } from '@/api/ontology'
import { useOntologyStore } from '@/stores/ontologyStore'

const navItems = [
  { label: 'Ontology', icon: Settings, id: 'ontology' },
  { label: 'Documents', icon: FileText, id: 'documents' },
  { label: 'Graph', icon: Network, id: 'graph' },
  { label: 'Chat', icon: MessageSquare, id: 'chat' },
] as const

export default function Header() {
  const { selectedOntologyId, setSelectedOntologyId, activeTab, setActiveTab } = useOntologyStore()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const { data: ontologies } = useQuery({
    queryKey: ['ontologies'],
    queryFn: fetchOntologies,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <header className="kg-header">
      <div className="kg-header__logo">
        <Network size={18} />
        <span>KG Platform</span>
      </div>

      <select
        className="kg-header__select"
        value={selectedOntologyId}
        onChange={(e) => setSelectedOntologyId(e.target.value)}
      >
        <option value="">All Ontologies</option>
        {ontologies?.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>

      <nav className="kg-header__nav">
        {navItems.map(({ label, icon: Icon, id }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`kg-header__tab ${activeTab === id ? 'kg-header__tab--active' : ''}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      <button
        className="kg-header__theme-toggle"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        title="Toggle theme"
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  )
}
