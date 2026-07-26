/**
 * Zod shapes for the M1 product-default nav-bar YAML (`class` sections only).
 * Predicate nodes mirror the search wire grammar in spirit (and/or/not + comparisons);
 * they are echoed by placeholders until #13/#14 execute search.
 */
import { z } from "zod";

export type NavPredicate = {
  op: string;
  attribute?: string;
  value?: unknown;
  predicates?: NavPredicate[];
  predicate?: NavPredicate;
};

export const nav_predicate_schema: z.ZodType<NavPredicate> = z.lazy(() =>
  z.object({
    op: z.string().min(1),
    attribute: z.string().min(1).optional(),
    value: z.unknown().optional(),
    predicates: z.array(nav_predicate_schema).optional(),
    predicate: nav_predicate_schema.optional(),
  }),
);

export const nav_option_schema = z.discriminatedUnion("option-type", [
  z.object({
    "display-name": z.string().min(1),
    "option-type": z.literal("new"),
  }),
  z.object({
    "display-name": z.string().min(1),
    "option-type": z.literal("list"),
    predicate: nav_predicate_schema.optional(),
  }),
]);

export const nav_section_schema = z.object({
  "display-name": z.string().min(1),
  "section-type": z.literal("class"),
  class: z.string().min(1),
  options: z.array(nav_option_schema).min(1),
});

export const nav_bar_document_schema = z.object({
  "nav-bar": z.array(nav_section_schema).min(1),
});

export type NavOption = z.infer<typeof nav_option_schema>;
export type NavSection = z.infer<typeof nav_section_schema>;
export type NavBar = NavSection[];

/** Normalized option for UI/routes (snake_case field names). */
export type NavOptionView = {
  display_name: string;
  option_type: "new" | "list";
  predicate?: NavPredicate;
};

export type NavSectionView = {
  display_name: string;
  section_type: "class";
  class_name: string;
  options: NavOptionView[];
};

export type NavBarView = NavSectionView[];

export function to_nav_bar_view(sections: NavBar): NavBarView {
  return sections.map((section) => ({
    display_name: section["display-name"],
    section_type: "class" as const,
    class_name: section.class,
    options: section.options.map((option) => {
      if (option["option-type"] === "new") {
        return {
          display_name: option["display-name"],
          option_type: "new" as const,
        };
      }
      return {
        display_name: option["display-name"],
        option_type: "list" as const,
        predicate: option.predicate,
      };
    }),
  }));
}
