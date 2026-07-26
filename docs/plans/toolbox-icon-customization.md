# Toolbox Settings and Selection Confirmation Plan

## Status

Accepted implementation plan. The global settings engine and browser integration described here are the source of truth for this feature.

## Goal

Give the Agentic React toolbox one coherent Settings surface for:

- single-select, multiselect, toolbox-toggle, and Done shortcuts;
- a globally customized launcher icon;
- clear source labels and per-setting reset actions.

At the same time, make selection an explicit transaction:

- clicking a target captures context but does not copy it;
- Done copies and commits the pending selection;
- Escape cancels the pending selection without copying;
- interactions with Agentic React UI do not activate or dismiss host-app UI.

All implementation and defaults live in this repository. A consuming project only supplies optional project defaults through its Agentic React configuration.

## Product Decisions

### Global ownership and precedence

User settings are global to the local machine. They are not scoped to a repository, browser origin, hostname, port, or bundler.

The precedence for every configurable value is:

```text
global user override
  > project configuration default
  > package default
```

Reset removes only the global override. It reveals the project default when one exists, otherwise the package default.

The Settings UI identifies the effective source as `Global override`, `Project configuration`, or `Default`.

### Persistence

Persist settings under the user's home directory:

```text
~/.agentic-react/settings.json
~/.agentic-react/toolbox-icon.webp
```

Use `toolbox-icon.png` only when PNG is required as the encoding fallback.

There is deliberately no project hash and no project-local settings file. Moving or switching projects does not change the user's shortcuts or icon. The consuming project never owns the persisted user preference.

Tests and playgrounds must inject an isolated settings root and must never read or write the developer's real `~/.agentic-react` directory.

### Why browser code can use home-directory settings

Browser code cannot read the local filesystem directly. Persistence is therefore a runtime operation, not a bundler-time file import:

1. A supported adapter starts Agentic React's existing local development bridge.
2. The Node side reads `~/.agentic-react` and merges global overrides with project and package defaults.
3. The adapter injects a sanitized initial snapshot and an unguessable session capability into the development client.
4. The browser reads or updates settings through narrow request/response operations on that existing bridge.
5. Node validates and atomically persists mutations, then returns a new effective snapshot.

This extends the adapter-hosted Agentic React bridge. It does not replace Vite HMR, Webpack's dev transport, or Next's development transport, and it does not introduce a second public bridge API. Vite hosts the Agentic React WebSocket path on its existing HTTP server; that path is separate from Vite's HMR protocol.

No filesystem path is sent to the browser. Persisted icons are returned as bounded, validated data URLs.

### No browser-storage fallback or file watcher

Do not use `localStorage` or IndexedDB as a fallback. Runtime-only `@agentic-react/core` usage may use code defaults, but Settings persistence is unavailable without an adapter-hosted bridge.

The first version does not watch `settings.json` for external edits. Settings change through the toolbox UI and take effect from the RPC response. A page reload reads the latest persisted state.

## Selection Semantics

### Single select

Single select uses a pending transaction:

1. Enter selection mode from the button or configured shortcut.
2. Click a host element to capture and display its context.
3. Keep the selection pending and show an enabled Done action.
4. Do not write to the clipboard yet.
5. Clicking Done or pressing the configured Done shortcut copies the context and commits it as the last confirmed selection.

Explicit programmatic copy APIs remain available, but they copy only the last committed selection. They must not expose or copy an unconfirmed pending single selection.

If clipboard writing fails, keep the pending selection so the user can retry.

### Multiselect

Multiselect remains additive. Captured contexts and overlays stay pending until Done. Done copies the complete pending set. Clear All removes only the pending multiselect set.

### Escape

Escape is reserved and is not configurable.

While Agentic React owns an active or pending selection, it captures Escape during the capture phase, prevents the default action, and stops propagation. It must consume the complete physical key cycle, including repeated keydown events and the matching keyup.

Escape:

- exits single-select or multiselect mode;
- discards pending single and multiselect contexts;
- removes pending hover, dim, selection, and tuning overlays;
- does not copy anything;
- preserves the last committed selection;
- keeps the toolbox open and displays `Selection cancelled`.

## Host Event Isolation

Every interactive Agentic React surface must form an activation-event boundary, including:

- launcher and toolbox panel;
- Settings controls;
- selected-element actions;
- multiselect actions;
- tuning UI;
- icon crop modal and backdrop.

At a minimum, stop propagation for:

```text
pointerdown
pointerup
mousedown
mouseup
click
touchstart
touchend
contextmenu
```

Internal handlers still run normally. Isolation prevents common host outside-click and activation handlers from closing transient menus, popovers, dialogs, or other short-lived UI while the user operates the toolbox.

## Settings UI

Add a Settings section inside the existing toolbox panel. It contains `Shortcuts` and `Appearance` subsections.

When persistence is unavailable, show effective code/package defaults and a concise capability explanation. Do not show controls that pretend a change can be saved.

### Shortcuts

The configurable actions are:

| Action | Package default |
| --- | --- |
| Single select | `Ctrl+Alt+Shift+S` |
| Multi select | `Ctrl+Alt+Shift+M` |
| Toggle toolbox | `Ctrl+Alt+Shift+A` |
| Done | `Enter` |

Each row shows the action, effective shortcut, source badge, record action, and reset action.

Recording captures one normalized combination. Validation occurs both in the browser and in the Node settings engine. Reject:

- Escape;
- a modifier without a non-modifier key;
- unsupported keys;
- more than one non-modifier key;
- a shortcut that duplicates another configured action after normalization.

The Node write path validates the merged effective shortcut set so direct runtime/RPC callers cannot bypass UI validation.

### Appearance

The Toolbox icon row contains:

- a circular preview;
- an effective-source badge;
- Change;
- Reset when a global override exists;
- an inline capability or validation error when applicable.

The project default remains the existing `toolkit.iconUrl`. The first version does not require a new URL/file source union: the project supplies a browser-safe default URL, and user customization is stored globally through Settings.

## Image Customization

### Crop workflow

Every accepted upload opens a 1:1 crop modal with:

- a circular launcher preview;
- drag-to-position;
- zoom;
- left and right 90-degree rotation;
- a centered default crop;
- Apply and Cancel.

Preview changes are transient. The launcher and persisted data change only after Apply has been encoded, validated, and persisted successfully. Cancel has no side effects.

The result is a static square `256 x 256` image. Prefer WebP and fall back to PNG. Preserve transparency where supported and strip metadata through canvas re-encoding. Animated inputs become a single static frame. SVG is rejected.

### Validation limits

Validate decoded content rather than trusting the extension or reported MIME type:

- maximum source size: `20 MB`;
- maximum side: `8192 px`;
- maximum decoded area: `40 megapixels`;
- browser-decodable raster input only;
- SVG and malformed input rejected;
- persisted encoded result capped at `1 MB`;
- Node verifies declared MIME, fixed filename, size, and magic bytes.

Never send the original upload to Node. Send only the encoded 256-square result.

### Failure behavior

- Preload a candidate before replacing the launcher image.
- Keep the previous visible icon until Apply succeeds.
- Roll back image bytes if settings metadata cannot be committed.
- On missing or corrupt persisted icon data, return a structured error and render the next valid default without a broken-image indicator.
- Write settings through a temporary sibling and atomic rename.
- Reset commits metadata before deleting the old icon file.

### Accessibility

- All controls have accessible names and are keyboard operable.
- The crop modal traps focus and restores it to Change when closed.
- Errors use a live status region.
- Escape closes the crop modal when selection cancellation does not have priority.
- Circular masking is preview-only; the persisted file remains square.

## Architecture

### Browser modules

Keep cohesive browser logic under `packages/core/src/core/settings/`:

- `browser.ts`: typed settings RPC client and cached snapshot;
- `shortcuts.ts`: normalization, identity comparison, and dispatch;
- `ui.ts`: small Settings UI and event-boundary helpers;
- `image_cropper.ts`: decode validation, crop math, rendering, and encoding;
- `icon_modal.ts`: modal lifecycle, focus management, and cropper controls.

`selection_toolkit.ts` coordinates selection state and consumes these modules. It owns no filesystem behavior.

### Node settings engine

The shared Node implementation under `packages/core/src/core/settings/` owns:

- home-root resolution with a test-only root override;
- schema parsing and forward-safe fallback;
- global/project/package merge and source metadata;
- shortcut validation on writes;
- bounded icon verification and data-URL resolution;
- atomic apply, reset, and rollback;
- capability-protected RPC handling.

Vite, Webpack, and Next construct the same engine and register it with their existing Agentic React bridge.

### RPC operations

Keep the browser-to-Node request surface fixed and typed:

```text
settings:get-effective
settings:update-shortcuts
settings:reset-shortcut
settings:reset-shortcuts
settings:apply-icon
settings:reset-icon
```

Requests never accept a filesystem path. Every mutation requires the injected session capability. An unauthorized response must not disclose global settings.

## Development and Production Boundaries

Adapter integration remains development-only:

- Vite runs the plugin with `apply: 'serve'`;
- Next remains gated by development client compilation;
- Webpack follows its existing development injection gate;
- production builds do not start the Agentic React bridge or inject settings capability data.

Direct `@agentic-react/core` imports remain an intentional runtime API outside the adapter production guarantee.

## Verification Strategy

### Unit and adapter tests

Cover:

- global > project > package precedence;
- injected settings-root isolation;
- corrupt settings fallback;
- normalized shortcut writes, duplicate rejection, and per-action reset;
- unauthorized RPC non-disclosure;
- icon format/size validation, reload resolution, rollback, and reset ordering;
- crop center, drag bounds, zoom bounds, and 90-degree rotation;
- Vite, Webpack, and Next bootstrap the same effective settings shape.

### Browser E2E

The Vite playground owns the full interaction matrix:

- all toolbox and crop-modal activation events stay out of host bubble handlers;
- a transient host popover remains open during toolbox interaction;
- single capture leaves clipboard unchanged until Done;
- the Done button and default Enter shortcut copy the pending single selection;
- multiselect remains additive and copies only on Done;
- Escape before capture and after pending single/multi selection discards pending state, consumes keydown and keyup, and leaves clipboard unchanged;
- shortcut recording rejects duplicates, persists to an isolated global store, survives reload, and resets per action;
- icon upload, crop, zoom, rotate, Apply, reload, and Reset work end to end;
- reset reveals the project `iconUrl` default.

Smaller adapter tests cover shared engine/bootstrap behavior without duplicating the full browser suite.

## Acceptance Criteria

- Toolbox UI interaction does not close host UI through bubbled activation events.
- Single select and multiselect copy only after explicit Done confirmation.
- The configured Done shortcut works for pending single and multiselect state.
- Escape is reserved, consumes the full key cycle during selection ownership, cancels without copying, and preserves committed context.
- Users can configure and individually reset four shortcuts from Settings.
- Invalid or duplicate shortcuts cannot be persisted through either UI or direct settings RPC.
- Users can upload, crop, rotate, zoom, apply, reload, and reset a global launcher icon.
- Global settings apply across projects, origins, ports, and supported adapters on the same machine.
- Project configuration supplies defaults only; it does not own user settings.
- Runtime-only use fails closed for persistence without a browser-storage fallback.
- Vite, Webpack, and Next reuse the existing Agentic React bridge and share the same settings engine.
- Tests use an isolated root and never mutate the real `~/.agentic-react` directory.
