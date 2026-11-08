"use client";

import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  hint: string;
}

export interface ChoiceGroupProps<T extends string> {
  /** What the group is choosing, read by a screen reader. */
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * One exclusive choice: a grouped list, a circle on the selected row, and one line under each label.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: ChoiceGroupProps<T>) {
  return (
    <div className={cn("orbit-group", className)} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <div key={option.value}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left",
                selected && "bg-[var(--orbit-brand-soft)]",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-[var(--orbit-brand)]" : "border-[var(--orbit-line)]",
                )}
                aria-hidden="true"
              >
                {selected ? (
                  <span className="size-3 rounded-full bg-[var(--orbit-brand)]" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[17px]",
                    selected ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                  )}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[15px] leading-snug text-[var(--orbit-secondary)]">
                  {option.hint}
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
