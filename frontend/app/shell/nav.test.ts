import { describe, expect, it } from "vitest";

import { SYSTEM_CONFIG_ID } from "../generated/well_known";
import {
  filter_nav_by_permissions,
  can_create_class,
  can_read_class,
  can_update_class,
} from "./nav_filter";
import { default_landing_path } from "./nav_landing";
import {
  display_name_to_slug,
  find_match_for_path,
  find_list_option,
  object_section_path,
  open_class_for_path,
  option_path,
} from "./nav_paths";
import { load_default_nav, reset_default_nav_cache_for_tests } from "./nav_config.server";
import { nav_bar_document_schema, to_nav_bar_view } from "./nav_schema";
import {
  SubstitutionError,
  substitute,
} from "./well_known_substitute";

const ADMIN = ["admin"];
const READONLY = [
  "incident:read",
  "change_request:read",
  "demo_item:read",
];
const READWRITE = [
  "incident:create",
  "incident:read",
  "incident:update",
  "change_request:create",
  "change_request:read",
  "change_request:update",
  "demo_item:create",
  "demo_item:read",
  "demo_item:update",
];
const INCIDENT_ONLY_READ = ["incident:read"];

describe("default nav YAML", () => {
  it("loads class sections then System Configuration object", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    expect(nav.map((s) => s.class_name)).toEqual([
      "change_request",
      "incident",
      "system_config",
    ]);
    const change = nav[0];
    const incident = nav[1];
    const system_config = nav[2];
    expect(change?.section_type).toBe("class");
    expect(incident?.section_type).toBe("class");
    expect(system_config?.section_type).toBe("object");
    if (change?.section_type !== "class" || incident?.section_type !== "class") {
      throw new Error("expected class sections");
    }
    if (system_config?.section_type !== "object") {
      throw new Error("expected object section");
    }
    expect(change.options.map((o) => o.display_name)).toEqual([
      "New",
      "All",
      "Open",
      "In Progress",
      "Scheduled",
    ]);
    expect(incident.options.map((o) => o.display_name)).toEqual([
      "New",
      "All",
      "Open",
      "Closed",
    ]);
    expect(system_config.id).toBe(SYSTEM_CONFIG_ID);
    expect(object_section_path(system_config)).toBe(
      `/system_config/${SYSTEM_CONFIG_ID}`,
    );
    const open = change.options.find((o) => o.display_name === "Open");
    expect(open?.option_type).toBe("list");
    expect(open && "predicate" in open ? open.predicate?.op : null).toBe("and");
  });

  it("rejects invalid documents via Zod", () => {
    expect(() =>
      nav_bar_document_schema.parse({
        "nav_bar": [
          {
            "display_name": "X",
            "section_type": "other",
            class: "incident",
            options: [{ "display_name": "All", "option_type": "list" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts object sections via Zod", () => {
    const parsed = nav_bar_document_schema.parse({
      "nav_bar": [
        {
          "display_name": "System Configuration",
          "section_type": "object",
          class: "system_config",
          id: "${system_config_id}",
        },
      ],
    });
    expect(parsed["nav_bar"][0]?.["section_type"]).toBe("object");
  });
});

describe("well_known_substitute", () => {
  it("resolves system_config_id in nav_bar context", () => {
    expect(substitute("${system_config_id}", "nav_bar")).toBe(SYSTEM_CONFIG_ID);
  });

  it("fails closed on undefined name", () => {
    expect(() => substitute("${no_such_name}", "nav_bar")).toThrow(
      SubstitutionError,
    );
  });

  it("fails closed on wrong-context name", () => {
    expect(() => substitute("${system_user_id}", "nav_bar")).toThrow(
      SubstitutionError,
    );
  });

  it("fails closed on unknown context", () => {
    expect(() => substitute("${system_config_id}", "create-default")).toThrow(
      SubstitutionError,
    );
  });
});

describe("nav paths", () => {
  it("maps display-name to stable slugs and paths", () => {
    expect(display_name_to_slug("In Progress")).toBe("in-progress");
    const nav = to_nav_bar_view(
      nav_bar_document_schema.parse({
        "nav_bar": [
          {
            "display_name": "Change Requests",
            "section_type": "class",
            class: "change_request",
            options: [
              { "display_name": "New", "option_type": "new" },
              { "display_name": "All", "option_type": "list" },
            ],
          },
        ],
      })["nav_bar"],
    );
    const section = nav[0]!;
    expect(section.section_type).toBe("class");
    if (section.section_type !== "class") {
      throw new Error("expected class section");
    }
    expect(option_path(section, section.options[0]!)).toBe(
      "/change_request/new",
    );
    expect(option_path(section, section.options[1]!)).toBe(
      "/change_request/lists/all",
    );
  });

  it("finds list options by collection + slug", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    const match = find_list_option(nav, "incident", "closed");
    expect(match?.option.display_name).toBe("Closed");
    expect(match?.option.predicate?.op).toBe("or");
    expect(find_match_for_path(nav, "/change_request/lists/all")?.path).toBe(
      "/change_request/lists/all",
    );
  });

  it("open_class_for_path expands list, new, and detail for known collections", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    expect(open_class_for_path(nav, "/incident/lists/all")).toBe("incident");
    expect(open_class_for_path(nav, "/incident/new")).toBe("incident");
    expect(open_class_for_path(nav, "/incident/INC00000001")).toBe("incident");
    expect(open_class_for_path(nav, "/change_request/lists/all")).toBe(
      "change_request",
    );
    expect(open_class_for_path(nav, "/change_request/new")).toBe(
      "change_request",
    );
    expect(open_class_for_path(nav, "/change_request/CRQ00000001")).toBe(
      "change_request",
    );
  });

  it("open_class_for_path ignores object sections (link active state only)", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    expect(
      open_class_for_path(nav, `/system_config/${SYSTEM_CONFIG_ID}`),
    ).toBeNull();
  });

  it("open_class_for_path returns null when collection or section is unknown", () => {
    reset_default_nav_cache_for_tests();
    const full = load_default_nav();
    const incident_only = full.filter(
      (s) => s.section_type === "class" && s.class_name === "incident",
    );
    expect(open_class_for_path(full, "/unknown-things/ABC")).toBeNull();
    expect(
      open_class_for_path(incident_only, "/change_request/CRQ00000001"),
    ).toBeNull();
    expect(open_class_for_path(full, "/")).toBeNull();
    expect(open_class_for_path(full, "/incident")).toBeNull();
    expect(open_class_for_path(full, "/incident/lists/all/extra")).toBeNull();
  });
});

describe("filter_nav_by_permissions", () => {
  it("shows everything for admin including System Configuration", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), ADMIN);
    expect(visible.map((s) => s.class_name)).toEqual([
      "change_request",
      "incident",
      "system_config",
    ]);
    const change = visible[0];
    expect(change?.section_type).toBe("class");
    if (change?.section_type === "class") {
      expect(change.options.map((o) => o.option_type)).toContain("new");
    }
  });

  it("hides New for readonly but keeps public System Configuration", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), READONLY);
    expect(visible.map((s) => s.class_name)).toEqual([
      "change_request",
      "incident",
      "system_config",
    ]);
    for (const section of visible) {
      if (section.section_type === "class") {
        expect(section.options.every((o) => o.option_type === "list")).toBe(
          true,
        );
      }
    }
  });

  it("shows New and lists for readwrite", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), READWRITE);
    const change = visible[0];
    expect(change?.section_type).toBe("class");
    if (change?.section_type === "class") {
      expect(change.options.some((o) => o.option_type === "new")).toBe(true);
      expect(change.options.some((o) => o.option_type === "list")).toBe(true);
    }
  });

  it("keeps incident lists and public System Configuration for incident:read only", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(
      load_default_nav(),
      INCIDENT_ONLY_READ,
    );
    expect(visible.map((s) => s.class_name)).toEqual([
      "incident",
      "system_config",
    ]);
    const incident = visible[0];
    expect(incident?.section_type).toBe("class");
    if (incident?.section_type === "class") {
      expect(incident.options.every((o) => o.option_type === "list")).toBe(
        true,
      );
    }
  });

  it("shows only System Configuration when permissions are empty (public read)", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), []);
    expect(visible.map((s) => s.class_name)).toEqual(["system_config"]);
    expect(visible[0]?.section_type).toBe("object");
  });
});

describe("can_read_class", () => {
  it("allows admin, class:read, and public metadata", () => {
    expect(can_read_class(["admin"], "incident")).toBe(true);
    expect(can_read_class(["incident:read"], "incident")).toBe(true);
    expect(can_read_class([], "incident")).toBe(false);
    expect(can_read_class([], "public-item", { public: true })).toBe(true);
    expect(can_read_class(["change_request:read"], "incident")).toBe(false);
    expect(can_read_class([], "system_config")).toBe(true);
  });
});

describe("can_create_class", () => {
  it("allows admin and class:create", () => {
    expect(can_create_class(["admin"], "incident")).toBe(true);
    expect(can_create_class(["incident:create"], "incident")).toBe(true);
    expect(can_create_class(["incident:read"], "incident")).toBe(false);
    expect(can_create_class(["change_request:create"], "incident")).toBe(
      false,
    );
  });
});

describe("can_update_class", () => {
  it("P1: admin may update any class", () => {
    expect(can_update_class(["admin"], "incident")).toBe(true);
    expect(can_update_class(["admin"], "change_request")).toBe(true);
  });

  it("P2: class:update permits that class only", () => {
    expect(can_update_class(["incident:update"], "incident")).toBe(true);
    expect(can_update_class(["incident:update"], "change_request")).toBe(
      false,
    );
  });

  it("P3: read-only without update is denied", () => {
    expect(can_update_class(["incident:read"], "incident")).toBe(false);
    expect(can_update_class([], "incident")).toBe(false);
  });
});

describe("default_landing_path", () => {
  it("prefers Change Requests → All for admin", () => {
    reset_default_nav_cache_for_tests();
    expect(default_landing_path(load_default_nav(), ADMIN)).toBe(
      "/change_request/lists/all",
    );
  });

  it("falls back to first visible class list when preferred class is hidden", () => {
    reset_default_nav_cache_for_tests();
    expect(default_landing_path(load_default_nav(), INCIDENT_ONLY_READ)).toBe(
      "/incident/lists/all",
    );
  });

  it("returns null when only object sections are visible (not a home route)", () => {
    reset_default_nav_cache_for_tests();
    expect(default_landing_path(load_default_nav(), [])).toBeNull();
  });
});
