import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl md:max-w-3xl',
    xl: 'max-w-4xl lg:max-w-5xl',
  };
  const sizeClass = sizeClasses[size];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content Container */}
      <div className={`relative w-full ${sizeClass} bg-white border border-neutral-100 rounded-2xl z-10 flex flex-col p-6 shadow-2xl shadow-amber-950/5 animate-in zoom-in-95 duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
          <h2 className="text-lg font-bold text-offblack m-0">{title}</h2>
          <Button 
            variant="ghost" 
            onClick={onClose} 
            className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 text-offblack" />
          </Button>
        </div>
        
        {/* Body */}
        <div className="flex-1 overflow-y-auto max-h-[85vh] text-left">
          {children}
        </div>
      </div>
    </div>
  );
};
