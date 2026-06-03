import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

    return (
      <div className="flex flex-col gap-1 w-full text-left">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-offblack">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`bg-white border border-neutral-200 rounded-lg px-3.5 py-2 font-sans text-sm leading-normal text-offblack transition-all placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 ${
            error ? 'border-danger focus:border-danger focus:ring-danger/15' : ''
          } ${className}`}
          {...props}
        />
        {error && (
          <span className="text-xs font-semibold text-danger mt-0.5">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
