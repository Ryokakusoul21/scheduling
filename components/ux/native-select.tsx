import { CaretDown } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

export interface NativeOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A styled native <select>: fully keyboard/screen-reader accessible out of the
 * box (type-ahead, arrow keys, platform pickers on mobile).
 */
export function NativeSelect({
  options,
  groups,
  placeholder,
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & {
  options?: NativeOption[];
  groups?: { label: string; options: NativeOption[] }[];
  placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-background py-1 pr-8 pl-2.5 text-sm shadow-xs outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive dark:bg-input/30"
        )}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) =>
          g.options.length ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
      <CaretDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
