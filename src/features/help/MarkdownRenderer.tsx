import React, { useState } from 'react';
import { Image as ImageIcon, Info, AlertTriangle, AlertCircle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

// Sub-component to dynamically load images and fall back to placeholder if image fails to load
const HelpImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="text-center p-6 flex flex-col items-center gap-2 w-full">
        <div className="p-3 bg-white rounded-full shadow-sm text-neutral-400 border border-neutral-100">
          <ImageIcon className="h-6 w-6" />
        </div>
        <span className="text-xs font-bold text-neutral-600 block">Marcador de posición para: {alt}</span>
        <p className="text-[10px] text-neutral-400 max-w-sm mt-0.5 leading-normal">
          Guarda una imagen en la carpeta <code className="bg-neutral-100 px-1 py-0.5 rounded text-primary font-mono">{src}</code> (o usa una URL pública) para que se reemplace automáticamente este espacio.
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      className="max-h-[550px] w-full object-contain rounded-lg shadow-2xs border border-neutral-100/50 bg-white"
    />
  );
};

const renderInline = (text: string): React.ReactNode[] => {
  // Regex to match bold, inline code, and links
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-extrabold text-offblack">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-neutral-100 text-danger px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[') && part.includes('](')) {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        const [, linkText, url] = match;
        return (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline">
            {linkText}
          </a>
        );
      }
    }
    return part;
  });
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  
  let currentList: React.ReactNode[] = [];
  let inList = false;

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-6 space-y-2 my-4 text-sm text-neutral-600">
          {currentList}
        </ul>
      );
      currentList = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      flushList(i);
      continue;
    }

    // List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      inList = true;
      const itemText = line.substring(2);
      currentList.push(
        <li key={`li-${i}`} className="leading-relaxed">
          {renderInline(itemText)}
        </li>
      );
      continue;
    }

    // If it was in a list and we found a non-list item, flush the list
    if (inList && !line.startsWith('- ') && !line.startsWith('* ')) {
      flushList(i);
    }

    // Headers
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-extrabold text-offblack mt-8 mb-4 border-b border-neutral-100 pb-2">
          {renderInline(line.substring(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-bold text-offblack mt-6 mb-3">
          {renderInline(line.substring(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-offblack mt-4 mb-2">
          {renderInline(line.substring(4))}
        </h3>
      );
      continue;
    }

    // Alerts (GFM style blockquotes like > [!NOTE] or > [!WARNING])
    if (line.startsWith('> ')) {
      let alertText = line.substring(2).trim();
      let alertType: 'note' | 'important' | 'warning' = 'note';
      
      if (alertText.startsWith('[!NOTE]')) {
        alertType = 'note';
        alertText = alertText.replace('[!NOTE]', '').trim();
      } else if (alertText.startsWith('[!IMPORTANT]')) {
        alertType = 'important';
        alertText = alertText.replace('[!IMPORTANT]', '').trim();
      } else if (alertText.startsWith('[!WARNING]')) {
        alertType = 'warning';
        alertText = alertText.replace('[!WARNING]', '').trim();
      }

      // Check if next lines are also blockquotes to accumulate alert text
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('> ')) {
        i++;
        const nextLineText = lines[i].trim().substring(2).trim();
        alertText += ' ' + nextLineText;
      }

      let alertStyles = 'bg-primary/5 border-l-4 border-primary text-offblack';
      let AlertIcon = Info;
      if (alertType === 'important') {
        alertStyles = 'bg-warning/5 border-l-4 border-warning text-offblack';
        AlertIcon = AlertTriangle;
      } else if (alertType === 'warning') {
        alertStyles = 'bg-danger/5 border-l-4 border-danger text-offblack';
        AlertIcon = AlertCircle;
      }

      elements.push(
        <div key={i} className={`p-4 rounded-r-xl my-5 flex gap-3 text-xs leading-relaxed ${alertStyles}`}>
          <AlertIcon className="h-5 w-5 shrink-0" />
          <div>
            <strong className="block capitalize font-bold mb-0.5">
              {alertType === 'note' ? 'Nota' : alertType === 'important' ? 'Importante' : 'Advertencia'}
            </strong>
            {renderInline(alertText)}
          </div>
        </div>
      );
      continue;
    }

    // Images: ![alt](src)
    if (line.startsWith('![') && line.includes('](')) {
      const match = line.match(/^!\[(.*?)\]\((.*?)\)/);
      if (match) {
        const [, alt, src] = match;
        elements.push(
          <div key={i} className="my-6">
            <div className="flat-card overflow-hidden border border-neutral-100 shadow-sm bg-white">
              <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 flex items-center text-xs font-bold text-gray-400">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {alt || 'Captura de pantalla'}
                </span>
              </div>
              <div className="p-1 bg-neutral-50/50 flex flex-col items-center justify-center min-h-[160px] border-2 border-dashed border-neutral-200 m-3 rounded-xl hover:bg-neutral-50 transition-colors">
                <HelpImage src={src} alt={alt} />
              </div>
            </div>
          </div>
        );
        continue;
      }
    }

    // Default paragraph
    elements.push(
      <p key={i} className="text-sm text-neutral-600 leading-relaxed my-3">
        {renderInline(line)}
      </p>
    );
  }

  // Flush any final lists
  flushList(lines.length);

  return <div className="prose max-w-none text-left">{elements}</div>;
};
