import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

/**
 * Public routes: login, logout. Everything else must nest under the
 * authenticated layout — default-deny by construction for new destinations.
 */
export const public_route_ids = ["routes/login", "routes/logout"] as const;

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/authenticated.tsx", [
    index("routes/home.tsx"),
    route("change-password", "routes/change_password.tsx"),
    route(":class_name/new", "routes/destination_new.tsx"),
    route(":class_name/lists/:list_id", "routes/destination_list.tsx"),
    // After static new/lists segments so those names are never locators.
    route(":class_name/:locator", "routes/destination_detail.tsx"),
  ]),
] satisfies RouteConfig;
