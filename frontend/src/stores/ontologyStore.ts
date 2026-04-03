import { create } from 'zustand'

type ActiveTab = 'ontology' | 'documents' | 'graph' | 'chat'

interface OntologyStore {
  selectedOntologyId: string
  setSelectedOntologyId: (id: string) => void
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
}

export const useOntologyStore = create<OntologyStore>((set) => ({
  selectedOntologyId: '',
  setSelectedOntologyId: (id) => set({ selectedOntologyId: id }),
  activeTab: 'ontology',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
