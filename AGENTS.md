# Untangled ITSM — AGENTS.md

## 1. Purpose

Untangled ITSM is a modern, developer-grade IT Service Management platform designed to replace legacy systems by treating configuration, customization, and operations as first-class engineering problems.

The system is built to be:

* Consistent
* Performant
* Git-driven
* Scalable
* Pleasant to use

---

## 2. Core Design Principles

### 2.1 Configuration is Code

All configuration must:

* Be representable as code
* Be version-controlled in Git
* Support branching, review, and merge workflows
* Be portable across environments (dev → test → prod)

Configuration must be:

* Deterministic
* Diff-friendly
* Canonically serialized (stable ordering, formatting)

---

### 2.2 Consistency Above All

All system components must follow a unified model:

* Workflows
* Event processing
* CMDB
* Discovery
* UI configuration

Users should never feel like they are learning a new system when switching domains.

---

### 2.3 Optimize for User Laziness

The system must:

* Avoid redundant data entry
* Infer values wherever possible
* Reuse existing data automatically
* Provide intelligent defaults

---

### 2.4 Performance is a Feature

The system must:

* Return obvious results immediately
* Avoid unnecessary processing
* Never degrade core workflows with optional features (e.g. AI)

Fast paths must exist for:

* Direct record lookup (e.g. ticket ID)
* Common queries

---

### 2.5 Progressive Complexity

Support both:

* Non-technical users (UI-driven workflows)
* Advanced users (Git + code workflows)

Complexity must be optional and layered.

---

### 2.6 Safe Extensibility

Customization must:

* Be sandboxed
* Be version-controlled
* Be observable (logs, metrics)
* Fail safely without breaking the system

---

## 3. Architecture Principles

### 3.1 Modular Monolith First

* Start as a modular monolith
* Enforce strict internal boundaries
* Use an internal event bus

Microservices are not a starting point.

---

### 3.2 Backend Technology

* Primary backend: Python
* Framework: FastAPI (or equivalent)

Responsibilities:

* Core logic
* API layer
* Orchestration
* Data processing

---

### 3.3 Customization Runtime

* Language: JavaScript
* Runtime: sandboxed (V8 isolate or equivalent)

Used for:

* Event handlers
* Workflow logic
* Data transformations

---

### 3.4 Data Layer

* Primary database: PostgreSQL

Data model:

1. System tables (managed explicitly, minimal ORM)
2. Metadata-driven dynamic schema (future)

PostgreSQL features:

* Use native `uuid` type
* Rely on TOAST for large field storage (no manual LOB splitting initially)

---

### 3.5 Identifier Strategy

All primary keys:

* Use UUIDv7 (time-ordered UUIDs)
* Stored as PostgreSQL `uuid`
* Exposed as standard hyphenated strings

Rationale:

* Globally unique across environments
* Safe for Git-based workflows
* Better index locality than random UUIDv4

---

### 3.6 Data Mapping Strategy

Avoid traditional heavy ORMs.

Instead:

* Use a thin, convention-based mapping layer
* Naming conventions define mappings
* SQL remains visible and predictable

Validation layers:

* Python: Pydantic
* JavaScript: Zod

---

### 3.7 Naming Conventions

| Layer      | Convention |
| ---------- | ---------- |
| SQL        | snake_case |
| Python     | snake_case |
| JSON/API   | snake_case |
| JavaScript | snake_case |
| YAML       | kebab-case |
| Classes    | PascalCase |

Goals:

* Zero mental translation
* Minimal mapping logic
* Consistency across the entire system

---

### 3.8 Relationships

#### One-to-One / One-to-Many / Many-to-One

* Use explicit foreign keys
* Represent as `<object>_id`

#### Many-to-Many

* Use explicit join tables
* Join tables:

  * Have their own UUID primary key
  * May include metadata fields
  * Are first-class internal objects

Expose externally:

* As simple ID arrays (basic use)
* As full objects (advanced use)

---

### 3.9 Git Integration (First-Class)

The system must:

* Store configuration in Git repositories
* Support:

  * Branching
  * Pull requests
  * Merge workflows

User abstraction:

* Draft → Review → Publish workflow for non-Git users

---

### 3.10 Environment Promotion

* Promote configuration across environments
* Validate before deployment
* Support rollback

---

### 3.11 Deployment & Scaling

* Containerized (Docker)
* Kubernetes for orchestration
* Horizontally scalable components:

  * API layer
  * Workers
  * Event processors

---

## 4. Configuration & Serialization

### 4.1 YAML vs JSON

#### YAML (Human-authored)

Used for:

* Schema definitions
* High-level configuration

Characteristics:

* Readable
* Commentable
* Git-friendly

---

#### JSON (System-generated or structured)

Used for:

* UI configuration
* Internal representations
* API payloads

---

### 4.2 Formatting Rules

#### Persisted JSON (Git, exports)

* Must be pretty-printed
* Must use stable key ordering
* Must be deterministic

#### Runtime JSON (API)

* Accept any valid JSON
* Do not enforce formatting
* Do not pretty-print unless requested

---

## 5. User Experience Principles

### 5.1 Immediate Feedback

* Key actions must feel instantaneous
* Long operations must be async with status

---

### 5.2 Predictable Interfaces

* Consistent interaction patterns
* No special-case UI behavior

---

### 5.3 Minimal Friction

* Reduce clicks
* Pre-fill data
* Avoid unnecessary input

---

## 6. AI Integration Principles

AI must:

* Assist, not obstruct
* Be optional
* Never degrade core performance

AI agents must:

* Follow this document strictly
* Prefer simple, maintainable solutions
* Avoid unnecessary complexity

---

## 7. Licensing

* Project license: AGPL

Dependencies must:

* Be AGPL-compatible
* Prefer permissive licenses (MIT, BSD, PostgreSQL License)

Approved examples:

* Pydantic (MIT)
* Zod (MIT)
* FastAPI (MIT)
* PostgreSQL (PostgreSQL License)

---

## 8. Anti-Goals

The system must NOT:

* Become slow due to feature bloat
* Fragment into inconsistent models
* Require repeated user input
* Hide critical logic behind opaque automation
* Default to microservices prematurely
* Depend on heavy ORMs

---

## 9. Initial Development Strategy

Start with simple, high-value objects:

### Phase 1:

* Incident
* Change Request

Constraints:

* Keep schemas simple
* Avoid CMDB integration initially
* Focus on:

  * Data model
  * Mapping layer
  * API behavior
  * Git-backed configuration

---

### Phase 2:

* Introduce relationships
* Expand workflow capabilities

---

### Phase 3:

* CMDB (separate, deliberate design phase)

CMDB will require:

* A formal class model
* Likely alignment with existing standards (to be evaluated)

---

## 10. Guiding Philosophy

Untangled ITSM treats ITSM not as forms and workflows, but as a software system that must be engineered with the same rigor as any large-scale application.

If a decision would not be acceptable in a production-grade software system, it is not acceptable here.

