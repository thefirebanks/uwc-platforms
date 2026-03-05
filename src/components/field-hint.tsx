"use client";

import { useId, useState, type ReactNode } from "react";

export function FieldHint({
  label = "Ayuda",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="field-hint"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="field-hint__button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span role="tooltip" id={tooltipId} className="field-hint__tooltip">
          {children}
        </span>
      ) : null}
    </span>
  );
}
