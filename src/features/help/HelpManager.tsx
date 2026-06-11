import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, BookOpen, ArrowLeft, HelpCircle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { MarkdownRenderer } from './MarkdownRenderer';

// Load all .md files under the docs folder as raw text
const rawDocs = import.meta.glob('./docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface DocItem {
  path: string;
  category: string;
  categorySlug: string;
  categoryOrder: number;
  title: string;
  topicOrder: number;
  content: string;
}

const categoryFriendlyNames: Record<string, string> = {
  '1-dashboard': 'Panel de Control',
  '2-calendario': 'Calendario y Agenda',
  '3-servicios': 'Servicios y Disponibilidad',
  '4-clientes': 'Gestión de Clientes',
  '5-reportes': 'Reportes y Finanzas',
  '6-whatsapp': 'Conexión WhatsApp',
  '7-configuracion': 'Configuración del Sistema',
};

// Parse raw docs into a structured typed list
const docsList: DocItem[] = Object.entries(rawDocs).map(([filePath, content]) => {
  const cleanPath = filePath.replace('./docs/', '');
  const parts = cleanPath.split('/');
  
  const categoryFolder = parts[0] || 'general';
  const categoryMatch = categoryFolder.match(/^(\d+)-(.*)$/);
  const categoryOrder = categoryMatch ? parseInt(categoryMatch[1], 10) : 99;
  const categoryRawName = categoryMatch ? categoryMatch[2] : categoryFolder;

  const category = categoryFriendlyNames[categoryFolder] || 
    categoryRawName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fileName = parts[1] || '';
  const fileCleanName = fileName.replace('.md', '');
  const topicMatch = fileCleanName.match(/^(\d+)-(.*)$/);
  const topicOrder = topicMatch ? parseInt(topicMatch[1], 10) : 99;
  const topicRawName = topicMatch ? topicMatch[2] : fileCleanName;

  // Extract the title from the first H1 in markdown if available, else clean name
  const titleLine = content.split(/\r?\n/).find(line => line.trim().startsWith('# '));
  const title = titleLine 
    ? titleLine.replace('# ', '').trim() 
    : topicRawName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    path: filePath,
    category,
    categorySlug: categoryFolder,
    categoryOrder,
    title,
    topicOrder,
    content,
  };
});

// Sort by category order, then topic order
const sortedDocs = [...docsList].sort((a, b) => {
  if (a.categoryOrder !== b.categoryOrder) {
    return a.categoryOrder - b.categoryOrder;
  }
  return a.topicOrder - b.topicOrder;
});

export const HelpManager: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDocPath, setSelectedDocPath] = useState<string>(
    sortedDocs[0]?.path || ''
  );
  
  // Mobile navigation state
  const [viewMode, setViewMode] = useState<'index' | 'content'>('index');

  // Filter docs based on search query
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return sortedDocs;
    const query = searchQuery.toLowerCase();
    return sortedDocs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(query) ||
        doc.category.toLowerCase().includes(query) ||
        doc.content.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group docs by category (only for normal index list)
  const groupedDocs = useMemo(() => {
    const groups: Record<string, DocItem[]> = {};
    filteredDocs.forEach((doc) => {
      if (!groups[doc.category]) {
        groups[doc.category] = [];
      }
      groups[doc.category].push(doc);
    });
    return groups;
  }, [filteredDocs]);

  // Find currently selected document
  const selectedDoc = useMemo(() => {
    return sortedDocs.find((doc) => doc.path === selectedDocPath) || sortedDocs[0];
  }, [selectedDocPath]);

  const handleSelectDoc = (path: string) => {
    setSelectedDocPath(path);
    setViewMode('content');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 rounded-2xl border border-neutral-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 text-left">
          <h2 className="text-lg font-extrabold text-offblack flex items-center gap-2 m-0">
            <HelpCircle className="h-5 w-5 text-primary" /> Centro de Ayuda y Documentación
          </h2>
          <p className="text-xs text-gray-500 font-semibold m-0">
            Aprende a configurar y operar cada módulo del sistema al detalle.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 relative items-start">
        {/* LEFT COLUMN: INDEX & SEARCH */}
        <aside
          className={`w-full md:w-80 shrink-0 bg-white border border-neutral-100 rounded-2xl shadow-xs overflow-hidden ${
            viewMode === 'content' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* Search container */}
          <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <Input
                type="text"
                placeholder="Buscar en la ayuda..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-xs w-full bg-white border border-neutral-200 rounded-xl"
              />
            </div>
          </div>

          {/* Navigation Tree */}
          <div className="max-h-[70vh] overflow-y-auto p-4 space-y-5 text-left">
            {searchQuery.trim() ? (
              // Search Results flat list
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                  Resultados de búsqueda ({filteredDocs.length})
                </h4>
                {filteredDocs.length > 0 ? (
                  <div className="space-y-1">
                    {filteredDocs.map((doc) => (
                      <button
                        key={doc.path}
                        onClick={() => handleSelectDoc(doc.path)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between group cursor-pointer border-none bg-transparent ${
                          selectedDocPath === doc.path
                            ? 'bg-primary text-white'
                            : 'text-offblack hover:bg-neutral-50'
                        }`}
                      >
                        <div className="truncate">
                          <span className={`block truncate ${selectedDocPath === doc.path ? 'text-white' : 'text-offblack'}`}>
                            {doc.title}
                          </span>
                          <span className={`text-[9px] block ${selectedDocPath === doc.path ? 'text-white/80' : 'text-gray-400'}`}>
                            en {doc.category}
                          </span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400 font-semibold">
                    No se encontraron coincidencias.
                  </div>
                )}
              </div>
            ) : (
              // Grouped Navigation
              Object.entries(groupedDocs).map(([categoryName, items]) => (
                <div key={categoryName} className="space-y-1.5">
                  <h3 className="text-[10px] uppercase font-extrabold text-gray-400 tracking-wider px-2">
                    {categoryName}
                  </h3>
                  <div className="space-y-0.5">
                    {items.map((doc) => (
                      <button
                        key={doc.path}
                        onClick={() => handleSelectDoc(doc.path)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between group cursor-pointer border-none bg-transparent ${
                          selectedDocPath === doc.path
                            ? 'bg-primary/10 text-primary'
                            : 'text-offblack hover:bg-neutral-50'
                        }`}
                      >
                        <span className="truncate">{doc.title}</span>
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                            selectedDocPath === doc.path
                              ? 'text-primary translate-x-0.5'
                              : 'text-gray-300 group-hover:text-offblack'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: CONTENT READER */}
        <section
          className={`flex-1 w-full bg-white border border-neutral-100 rounded-2xl shadow-xs overflow-hidden ${
            viewMode === 'index' ? 'hidden md:block' : 'block'
          }`}
        >
          {selectedDoc ? (
            <div>
              {/* Header block */}
              <div className="p-5 border-b border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 text-left">
                  {/* Mobile Back Button */}
                  <button
                    onClick={() => setViewMode('index')}
                    className="md:hidden flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-offblack cursor-pointer border-none bg-transparent mb-2 p-0"
                  >
                    <ArrowLeft className="h-4 w-4" /> Volver al índice
                  </button>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <span>Ayuda</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{selectedDoc.category}</span>
                  </div>
                  <h1 className="text-lg font-extrabold text-offblack m-0 mt-1">
                    {selectedDoc.title}
                  </h1>
                </div>

                <div className="flex items-center gap-2 bg-white border border-neutral-200/50 py-1 px-3 rounded-lg self-start sm:self-auto shadow-xs">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-bold text-gray-500">Guía de Uso Oficial</span>
                </div>
              </div>

              {/* Content body */}
              <div className="p-4 md:p-6 w-full max-w-none">
                <MarkdownRenderer content={selectedDoc.content} />
              </div>
            </div>
          ) : (
            <div className="p-20 text-center text-sm font-semibold text-gray-400">
              Selecciona una guía en el menú lateral para ver el instructivo de uso.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
