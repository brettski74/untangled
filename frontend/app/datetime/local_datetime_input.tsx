import { useEffect, useState } from "react";

import { display_field_value } from "./format";

export type LocalDatetimeInputProps = {
  id: string;
  value: unknown;
  className?: string;
};

/**
 * Read-only text input showing client-local datetime after hydrate.
 */
export function LocalDatetimeInput({
  id,
  value,
  className,
}: LocalDatetimeInputProps) {
  const [text, set_text] = useState("");

  useEffect(() => {
    set_text(display_field_value("datetime", value));
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      readOnly
      value={text}
      className={className}
    />
  );
}
