import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  showCancel?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  isLoading = false,
  showCancel = true
}) => {
  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      onClose();
    }
  };

  const variantColors = {
    danger: 'bg-danger text-white hover:bg-danger/90 border-none',
    warning: 'bg-warning text-white hover:bg-warning/90 border-none',
    primary: 'bg-primary text-white hover:bg-primary/90 border-none',
  };

  const iconColors = {
    danger: 'text-danger bg-danger/10',
    warning: 'text-warning bg-warning/10',
    primary: 'text-primary bg-primary/10',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-5 text-left">
        <div className="flex gap-3.5 items-start">
          <div className={`p-2.5 rounded-xl shrink-0 ${iconColors[variant]}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
          {showCancel && (
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading} className="cursor-pointer">
              {cancelText}
            </Button>
          )}
          <Button 
            type="button" 
            onClick={handleConfirm} 
            isLoading={isLoading}
            className={`font-bold py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer ${variantColors[variant]}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
