'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'select2/dist/css/select2.min.css';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Client-only initialization of jQuery and Select2 to prevent SSR issues
let $: any = null;
if (typeof window !== 'undefined') {
  $ = require('jquery');
  (window as any).$ = $;
  (window as any).jQuery = $;
  require('select2');
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

interface Select2Props extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (val: string) => void;
  minimumResultsForSearch?: number; // Set to -1 to hide search box
  containerClassName?: string;
}

export function Select2({
  children,
  value,
  onChange,
  onValueChange,
  disabled,
  minimumResultsForSearch,
  containerClassName,
  className,
  ...props
}: Select2Props) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Set isMounted to true on client-side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Initialize and update Select2
  useEffect(() => {
    if (!isMounted || !selectRef.current || !$) return;

    const $select = $(selectRef.current);

    $select.select2({
      width: '100%',
      minimumResultsForSearch: minimumResultsForSearch,
      containerCssClass: containerClassName,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = (e: any) => {
      // Trigger the standard React onChange if provided
      if (onChange) {
        onChange(e);
      }
      // Trigger the value change callback if provided
      if (onValueChange) {
        onValueChange(e.target.value);
      }
    };

    $select.on('change', handleChange);

    // Initial value synchronization
    if (value !== undefined && $select.val() !== value) {
      $select.val(value).trigger('change.select2');
    }

    return () => {
      if ($select.data('select2')) {
        $select.off('change', handleChange);
        $select.select2('destroy');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, children, onChange, onValueChange, minimumResultsForSearch, containerClassName]);

  // Keep selected value in sync when value changes from parent
  useEffect(() => {
    if (!isMounted || !selectRef.current || !$) return;
    const $select = $(selectRef.current);
    if (value !== undefined && $select.val() !== value) {
      $select.val(value).trigger('change.select2');
    }
  }, [isMounted, value]);

  // Keep disabled state in sync when it changes from parent
  useEffect(() => {
    if (!isMounted || !selectRef.current || !$) return;
    const $select = $(selectRef.current);
    $select.prop('disabled', !!disabled);
  }, [isMounted, disabled]);

  return (
    <select
      ref={selectRef}
      className={className}
      disabled={disabled}
      value={value}
      onChange={onChange}
      {...props}
    >
      {children}
    </select>
  );
}
