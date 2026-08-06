/**
 * Zod shapes for the product-default nav-bar YAML (`class` and `object` sections).
 * Predicate nodes mirror the search wire grammar in spirit (and/or/not + comparisons);
 * they are echoed until list loaders execute search (#13 / #75).
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

export const nav_class_section_schema = z.object({
  "display-name": z.string().min(1),
  "section-type": z.literal("class"),
  class: z.string().min(1),
  options: z.array(nav_option_schema).min(1),
});

export const nav_object_section_schema = z.object({
  "display-name": z.string().min(1),
  "section-type": z.literal("object"),
  class: z.string().min(1),
  id: z.string().min(1),
});

export const nav_section_schema = z.discriminatedUnion("section-type", [
  nav_class_section_schema,
  nav_object_section_schema,
]);

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

export type NavClassSectionView = {
  display_name: string;
  section_type: "class";
  class_name: string;
  options: NavOptionView[];
};

export type NavObjectSectionView = {
  display_name: string;
  section_type: "object";
  class_name: string;
  /** Resolved record id (no unsubstituted ``${…}`` tokens). */
  id: string;
};

export type NavSectionView = NavClassSectionView | NavObjectSectionView;

export type NavBarView = NavSectionView[];

export function to_nav_bar_view(sections: NavBar): NavBarView {
  return sections.map((section) => {
    if (section["section-type"] === "object") {
      return {
        display_name: section["display-name"],
        section_type: "object" as const,
        class_name: section.class,
        id: section.id,
      };
    }
    return {
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
    };
  });
}
