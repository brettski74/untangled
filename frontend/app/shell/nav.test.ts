import { describe, expect, it } from "vitest";

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
  open_class_for_path,
  option_path,
} from "./nav_paths";
import { load_default_nav, reset_default_nav_cache_for_tests } from "./nav_config.server";
import { nav_bar_document_schema, to_nav_bar_view } from "./nav_schema";

const ADMIN = ["admin"];
const READONLY = [
  "incident:read",
  "change-request:read",
  "demo-item:read",
];
const READWRITE = [
  "incident:create",
  "incident:read",
  "incident:update",
  "change-request:create",
  "change-request:read",
  "change-request:update",
  "demo-item:create",
  "demo-item:read",
  "demo-item:update",
];
const INCIDENT_ONLY_READ = ["incident:read"];

describe("default nav YAML", () => {
  it("loads Change Requests then Incidents with expected options", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    expect(nav.map((s) => s.class_name)).toEqual([
      "change-request",
      "incident",
    ]);
    expect(nav[0]?.options.map((o) => o.display_name)).toEqual([
      "New",
      "All",
      "Open",
      "In Progress",
      "Scheduled",
    ]);
    expect(nav[1]?.options.map((o) => o.display_name)).toEqual([
      "New",
      "All",
      "Open",
      "Closed",
    ]);
    const open = nav[0]?.options.find((o) => o.display_name === "Open");
    expect(open?.option_type).toBe("list");
    expect(open && "predicate" in open ? open.predicate?.op : null).toBe("and");
  });

  it("rejects invalid documents via Zod", () => {
    expect(() =>
      nav_bar_document_schema.parse({
        "nav-bar": [
          {
            "display-name": "X",
            "section-type": "other",
            class: "incident",
            options: [{ "display-name": "All", "option-type": "list" }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("nav paths", () => {
  it("maps display-name to stable slugs and paths", () => {
    expect(display_name_to_slug("In Progress")).toBe("in-progress");
    const nav = to_nav_bar_view(
      nav_bar_document_schema.parse({
        "nav-bar": [
          {
            "display-name": "Change Requests",
            "section-type": "class",
            class: "change-request",
            options: [
              { "display-name": "New", "option-type": "new" },
              { "display-name": "All", "option-type": "list" },
            ],
          },
        ],
      })["nav-bar"],
    );
    const section = nav[0]!;
    expect(option_path(section, section.options[0]!)).toBe(
      "/change-requests/new",
    );
    expect(option_path(section, section.options[1]!)).toBe(
      "/change-requests/lists/all",
    );
  });

  it("finds list options by collection + slug", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    const match = find_list_option(nav, "incidents", "closed");
    expect(match?.option.display_name).toBe("Closed");
    expect(match?.option.predicate?.op).toBe("or");
    expect(find_match_for_path(nav, "/change-requests/lists/all")?.path).toBe(
      "/change-requests/lists/all",
    );
  });

  it("open_class_for_path expands list, new, and detail for known collections", () => {
    reset_default_nav_cache_for_tests();
    const nav = load_default_nav();
    expect(open_class_for_path(nav, "/incidents/lists/all")).toBe("incident");
    expect(open_class_for_path(nav, "/incidents/new")).toBe("incident");
    expect(open_class_for_path(nav, "/incidents/INC00000001")).toBe("incident");
    expect(open_class_for_path(nav, "/change-requests/lists/all")).toBe(
      "change-request",
    );
    expect(open_class_for_path(nav, "/change-requests/new")).toBe(
      "change-request",
    );
    expect(open_class_for_path(nav, "/change-requests/CRQ00000001")).toBe(
      "change-request",
    );
  });

  it("open_class_for_path returns null when collection or section is unknown", () => {
    reset_default_nav_cache_for_tests();
    const full = load_default_nav();
    const incident_only = full.filter((s) => s.class_name === "incident");
    expect(open_class_for_path(full, "/unknown-things/ABC")).toBeNull();
    expect(
      open_class_for_path(incident_only, "/change-requests/CRQ00000001"),
    ).toBeNull();
    expect(open_class_for_path(full, "/")).toBeNull();
    expect(open_class_for_path(full, "/incidents")).toBeNull();
    expect(open_class_for_path(full, "/incidents/lists/all/extra")).toBeNull();
  });
});

describe("filter_nav_by_permissions", () => {
  it("shows everything for admin", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), ADMIN);
    expect(visible).toHaveLength(2);
    expect(visible[0]?.options.map((o) => o.option_type)).toContain("new");
  });

  it("hides New for readonly", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), READONLY);
    expect(visible).toHaveLength(2);
    for (const section of visible) {
      expect(section.options.every((o) => o.option_type === "list")).toBe(true);
    }
  });

  it("shows New and lists for readwrite", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(load_default_nav(), READWRITE);
    expect(visible[0]?.options.some((o) => o.option_type === "new")).toBe(true);
    expect(visible[0]?.options.some((o) => o.option_type === "list")).toBe(true);
  });

  it("hides Change Requests when only incident:read", () => {
    reset_default_nav_cache_for_tests();
    const visible = filter_nav_by_permissions(
      load_default_nav(),
      INCIDENT_ONLY_READ,
    );
    expect(visible.map((s) => s.class_name)).toEqual(["incident"]);
    expect(visible[0]?.options.every((o) => o.option_type === "list")).toBe(
      true,
    );
  });
});

describe("can_read_class", () => {
  it("allows admin, class:read, and public metadata", () => {
    expect(can_read_class(["admin"], "incident")).toBe(true);
    expect(can_read_class(["incident:read"], "incident")).toBe(true);
    expect(can_read_class([], "incident")).toBe(false);
    expect(can_read_class([], "public-item", { public: true })).toBe(true);
    expect(can_read_class(["change-request:read"], "incident")).toBe(false);
  });
});

describe("can_create_class", () => {
  it("allows admin and class:create", () => {
    expect(can_create_class(["admin"], "incident")).toBe(true);
    expect(can_create_class(["incident:create"], "incident")).toBe(true);
    expect(can_create_class(["incident:read"], "incident")).toBe(false);
    expect(can_create_class(["change-request:create"], "incident")).toBe(
      false,
    );
  });
});

describe("can_update_class", () => {
  it("P1: admin may update any class", () => {
    expect(can_update_class(["admin"], "incident")).toBe(true);
    expect(can_update_class(["admin"], "change-request")).toBe(true);
  });

  it("P2: class:update permits that class only", () => {
    expect(can_update_class(["incident:update"], "incident")).toBe(true);
    expect(can_update_class(["incident:update"], "change-request")).toBe(
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
      "/change-requests/lists/all",
    );
  });

  it("falls back to first visible when preferred class is hidden", () => {
    reset_default_nav_cache_for_tests();
    expect(default_landing_path(load_default_nav(), INCIDENT_ONLY_READ)).toBe(
      "/incidents/lists/all",
    );
  });

  it("returns null when nothing is visible", () => {
    reset_default_nav_cache_for_tests();
    expect(default_landing_path(load_default_nav(), [])).toBeNull();
  });
});
