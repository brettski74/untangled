import { useEffect, useState } from "react";

import { display_field_value } from "./format";

export type LocalDatetimeTextProps = {
  value: unknown;
};

/**
 * Client-local datetime display for SSR pages.
 * Renders empty until mount so first meaningful paint matches browser wall time.
 */
export function LocalDatetimeText({ value }: LocalDatetimeTextProps) {
  const [text, set_text] = useState("");

  useEffect(() => {
    set_text(display_field_value("datetime", value));
  }, [value]);

  return <>{text}</>;
}
