# Toolbox Icon Customization Implementation Plan

## Status

Proposed implementation plan based on the completed product-design grilling session.

## Goal

Allow developers to customize the Agentic React toolbox launcher icon during local development in either of two ways:

1. Define a project default in the supported bundler adapter configuration.
2. Upload, crop, and apply a project-specific personal override from the Settings UI.

The feature must remain development-only when Agentic React is installed through a bundler adapter. It must not add the toolbox runtime, the selected icon, or project-settings code to a production client bundle.

## Product Decisions

### Ownership and precedence

The bundler configuration defines the shared project default. A Settings upload defines a personal override for the current project on the current machine.

The normal source precedence is:

```text
valid local project override
  > valid bundler-configured icon
  > package-provided default icon
```

If the currently selected custom source fails to load or validate, render the package-provided default icon directly. Do not silently try a different custom source. Resetting the local override explicitly reveals the bundler-configured icon again.

The Settings UI must identify the active source as `Local override`, `Project configuration`, or `Default`.

### Persistence scope

Local overrides are project-specific, not browser-origin-specific. The same override must work when the project changes port, hostname, or supported bundler on the same machine.

Persist data under:

```text
~/.agentic-react/projects/<project-root-hash>/
```

Use the SHA-256 hash of the canonical, real-path-resolved project root as `<project-root-hash>`. A project moved to a different canonical path is treated as a new project.

The project directory contains only versioned plugin-owned data:

```text
settings.json
toolbox-icon.webp
```

Use `toolbox-icon.png` only when PNG is required as the encoding fallback. Do not write into the repository and do not modify `.gitignore`.

Suggested settings schema:

```json
{
  "schemaVersion": 1,
  "toolboxIcon": {
    "fileName": "toolbox-icon.webp",
    "mimeType": "image/webp",
    "updatedAt": "2026-07-18T00:00:00.000Z"
  }
}
```

### Upload and crop behavior

The Settings UI accepts a local image selected through the browser file picker. It does not accept a pasted URL. URL-based icons remain a bundler configuration feature.

Every upload enters a 1:1 crop workflow with:

- a circular mask preview matching the launcher;
- drag-to-position;
- zoom;
- 90-degree rotation;
- a default centered crop that can be accepted without adjustment;
- explicit `Apply` and `Cancel` actions.

Preview changes are transient. The launcher and persisted data change only after `Apply` succeeds. `Cancel` has no side effects.

The encoded result is a square `256 x 256` static image. Prefer WebP and fall back to PNG when WebP encoding is unavailable or PNG is required to preserve the result correctly. Preserve transparency and discard source metadata, including EXIF and GPS metadata.

Animated inputs produce a single static frame. SVG input and animated output are not supported in the first version.

### Upload validation

Validate decoded content rather than trusting the extension or browser-reported MIME type.

Apply all of these limits to local uploads and configured local files:

- maximum source file size: `20 MB`;
- maximum width or height: `8192 px`;
- maximum decoded pixel count: `40 megapixels`;
- source must be a browser-decodable raster image;
- SVG must be rejected explicitly;
- malformed or undecodable content must be rejected.

Perform browser decoding before opening the crop editor. Apply EXIF orientation during decoding. Never send the original upload to Node; send only the encoded `256 x 256` result through the local bridge.

Remote configuration URLs are loaded directly by the browser and are not proxied or copied into local storage. Enforce protocol and decoded-dimension checks where possible, but do not download a remote asset in Node merely to enforce the byte-size limit.

### Failure behavior

Never display a broken-image indicator.

- Decode a candidate completely before swapping the visible launcher image.
- Keep the previous visible icon until an `Apply` operation has been persisted successfully.
- If the active custom source cannot load, show the package-provided default icon.
- Keep a failed local setting record so Settings can show the error and offer `Replace` or `Reset`.
- Log a bundler local-file problem once during dev-server startup.
- Log a browser URL load problem once per page session.
- Write files through a temporary sibling followed by an atomic rename.
- Do not leave partial settings or image files after an interrupted write.

### Runtime-only behavior

Direct `@agentic-react/core` consumers do not have project-root knowledge or Node persistence.

- Keep code-based URL configuration available.
- Hide upload, crop, apply, and reset controls when the project-settings bridge capability is absent.
- Show a short explanation that icon upload requires a bundler adapter.
- Do not introduce a `localStorage` or IndexedDB fallback.

### No customization-disable option

Do not add an `iconCustomization` enable/disable option. Upload is available whenever a supported development adapter exposes the project-settings capability.

## Public Configuration API

Introduce an explicit icon source union:

```ts
export type ToolkitIconSource =
  | {
      type: 'url';
      url: string;
    }
  | {
      type: 'file';
      path: string;
    };

export interface ToolkitConfig {
  // Existing fields omitted.
  icon?: ToolkitIconSource;

  /** @deprecated Use icon: { type: 'url', url } instead. */
  iconUrl?: string;
}
```

Configuration examples:

```ts
AgenticReact({
  toolkit: {
    icon: {
      type: 'url',
      url: '/agentic-react-logo.png',
    },
  },
});
```

```ts
withAgenticReactWebpack(config, { mode: argv.mode }, {
  toolkit: {
    icon: {
      type: 'file',
      path: './branding/toolbox-icon.png',
    },
  },
});
```

Rules:

- `url` accepts relative public URLs, `http:`, `https:`, and raster `data:image/...` URLs.
- Reject `javascript:`, `file:`, `blob:`, SVG data URLs, and unknown protocols.
- Set `referrerPolicy="no-referrer"` for remote images.
- Do not proxy remote URLs.
- Resolve relative `file` paths from the adapter's resolved project root.
- Permit absolute `file` paths because the bundler configuration is trusted local code.
- Expose only the resolved configured file; never provide a general-purpose file-serving path.
- When `icon` and legacy `iconUrl` are both present, `icon` wins and a development warning is emitted once.
- Preserve `iconUrl` for backward compatibility during the initial release of the new API.
- Document that `file` requires a bundler adapter; runtime-only consumers should use `url`.

## Architecture

### Browser responsibilities

Keep browser-specific image work in `@agentic-react/core`:

- file selection;
- format sniffing and browser decode validation;
- EXIF-aware rendering;
- crop, zoom, and rotation state;
- canvas encoding to WebP or PNG;
- image preloading before launcher replacement;
- Settings UI states and errors;
- sending only the final encoded image to the project-settings bridge.

Do not add more Settings and crop logic directly to the already-large `selection_toolkit.ts`. Extract cohesive modules, for example:

```text
packages/core/src/core/settings/toolbox_icon_settings.ts
packages/core/src/core/settings/toolbox_icon_cropper.ts
packages/core/src/core/settings/image_validation.ts
packages/core/src/core/settings/project_settings_client.ts
```

The selection toolkit should consume a small interface that exposes the effective icon, opens the Settings surface, and applies runtime updates.

### Node responsibilities

Create one shared Node implementation used by all adapters, for example:

```text
packages/core/src/project_settings/toolbox_icon_store.ts
packages/core/src/project_settings/project_identity.ts
packages/core/src/project_settings/configured_icon_resolver.ts
```

Expose it through a Node-only package subpath such as `@agentic-react/core/project-settings`. Do not make browser code depend on Node built-ins.

The shared implementation owns:

- canonical project-root identity and hashing;
- `~/.agentic-react` path construction;
- settings schema parsing and migration;
- configured local-file resolution;
- bounded base64 decoding of the final crop result;
- MIME/magic-byte verification for the encoded result;
- atomic apply and reset operations;
- reading the effective local override at dev startup;
- returning capability and source metadata to the browser.

### Bridge protocol

Reuse the existing local runtime bridge so Vite, Webpack, and Next share one persistence mechanism. Do not add adapter-specific public upload APIs.

Add a narrow browser-to-Node request surface:

```text
project-settings:get-toolbox-icon
project-settings:apply-toolbox-icon
project-settings:reset-toolbox-icon
```

Messages must use fixed operations and must never accept a filesystem path from the browser. Cap the encoded result at a conservative post-crop size, such as `1 MB`, before base64 decoding.

Because this adds browser-initiated mutations to the local bridge, protect the dev session internally with an automatically generated capability. This is an implementation safeguard, not a public setting and not a restriction on image origin. It must require no user interaction.

Return a typed result containing:

- success or structured error;
- active source;
- effective image as a small data URL when needed;
- persisted MIME type and update timestamp;
- project-settings capability availability.

### Initial icon resolution

Avoid a visible flash from the project icon to the local override.

At development entry generation time, each adapter should:

1. Resolve and validate the bundler-configured icon source.
2. Read the project-specific local override.
3. Compute the initial selected source using the agreed precedence.
4. Inject a resolved browser-safe URL or small data URL plus source metadata into `AgenticReactConfig`.

After an Apply or Reset response, update the launcher in place through the runtime API without a page reload.

## Adapter Work

### Vite

Update `packages/vite/src/index.ts` to:

- resolve `toolkit.icon` during development;
- initialize the shared project settings store from `config.root`;
- attach project-settings handlers to the existing runtime bridge;
- inject effective icon and capability metadata in `transformIndexHtml`;
- retain `apply: 'serve'` so none of this runs for `vite build`.

### Webpack

Update `packages/webpack/src/index.ts` to fail closed for production.

Resolve mode from explicit sources in this order:

```text
env.mode
config.mode
process.env.NODE_ENV
```

Inject Agentic React only when the resolved mode is exactly `development`. If mode is absent or ambiguous, return the original configuration without writing a generated client entry. Emit a concise warning explaining how to pass development mode.

Then:

- initialize the shared store from `options.rootDir`, `config.context`, or the resolved root;
- resolve `toolkit.icon` before generating the browser entry;
- attach project-settings handlers to the existing runtime bridge;
- inject the effective icon and settings capability into the generated entry.

### Next.js

Update `packages/next/src/index.ts` to:

- keep the existing `context.dev && !context.isServer` injection gate;
- initialize the shared store using the resolved root;
- attach project-settings handlers to the existing Next bridge server;
- inject the effective icon and capability into the generated client entry;
- avoid relying on HTTP same-origin, because the Next bridge intentionally uses a separate loopback port by default.

### Core runtime

Update the shared types, global declarations, overlay initialization, and selection toolkit integration to:

- understand the new icon source and resolved source metadata;
- keep legacy `iconUrl` working;
- expose project-settings capability to the Settings UI;
- preload and atomically swap launcher images;
- open the upload/crop flow from the Settings appearance section;
- update the launcher after Apply or Reset without reload;
- fall back directly to the packaged default icon on custom-source failure.

## Settings UI Specification

Add an `Appearance` section with a `Toolbox icon` row.

The resting state contains:

- a circular preview at launcher size;
- a source badge;
- a `Change` action when adapter persistence is available;
- a `Reset to project default` action only when a local override exists;
- an inline error when the persisted override is unavailable or invalid.

The crop state contains:

- the source image viewport;
- a fixed square crop boundary with circular launcher preview mask;
- drag and keyboard positioning;
- a labeled zoom slider;
- left and right 90-degree rotation controls;
- final circular preview;
- `Cancel` and `Apply` buttons;
- progress and failure states that prevent duplicate Apply operations.

Accessibility requirements:

- all controls are keyboard operable;
- slider and rotation controls have accessible names;
- focus is trapped inside the crop modal and restored to `Change` on close;
- errors are announced through an appropriate live region;
- the preview is decorative when adjacent text already communicates its purpose;
- reduced-motion preferences are respected.

## Production-Safety Invariant

The invariant is:

> A bundler adapter must never inject Agentic React into a production client compilation. Ambiguous build mode is treated as non-development.

Required safeguards:

- Vite remains `apply: 'serve'`.
- Next remains gated by `context.dev` and client compilation.
- Webpack changes from development-by-default to explicit-development-only.
- No production adapter path writes generated Agentic React entries.
- No production output contains the bridge path, toolbox launcher marker, default icon data URL, project-settings events, or `~/.agentic-react` references.
- Direct imports from `@agentic-react/core` remain an intentional runtime-only API and are documented as outside the adapter guarantee.

## Testing Strategy

### Unit tests

Add focused tests for:

- project-root canonicalization and stable hashing;
- per-project directory isolation;
- settings schema parsing, unknown-version rejection, and migration hooks;
- atomic apply and reset behavior;
- temporary-file cleanup after failure;
- valid WebP and PNG result verification;
- size and protocol rejection;
- icon precedence and direct-default failure behavior;
- legacy `iconUrl` compatibility and `icon` precedence;
- relative and absolute configured-file resolution;
- browser validation boundaries as pure functions;
- crop math for pan, zoom, rotation, and output coordinates.

Use temporary home and project directories in Node tests. Never read or write the developer's real `~/.agentic-react` directory during tests.

### Adapter tests

Add production-gate tests for all supported adapters:

- Vite build does not invoke Agentic React HTML injection.
- Webpack development mode prepends the generated entry.
- Webpack production, missing, and unknown modes return the original entry.
- Next development client compilation injects the entry.
- Next production and server compilations do not inject it.

Add adapter contract tests proving that Vite, Webpack, and Next calculate the same project identity and expose the same settings capability/result shape.

### Browser and end-to-end tests

Extend Playwright coverage to verify:

- upload opens the crop workflow;
- oversized, SVG, malformed, and over-dimension inputs are rejected;
- preview interactions do not change the launcher before Apply;
- Cancel leaves the old icon unchanged;
- Apply persists and updates without reload;
- reload restores the local override;
- changing the dev-server port preserves the same project override;
- Reset reveals the configured project icon;
- Reset with no configured icon reveals the packaged default;
- broken local, configured-file, remote, and data URL sources show the packaged default rather than a broken image;
- runtime-only mode does not show upload controls;
- remote config URLs receive `no-referrer` behavior;
- transparent output renders correctly in the circular launcher.

Run the flow in the Vite, Webpack, and Next playgrounds. One adapter should own the full interaction matrix; the other adapters can run smaller persistence and capability smoke tests to avoid duplicating slow UI coverage.

### Production artifact tests

Build production fixtures for Vite, Webpack, and Next, then scan emitted client artifacts for forbidden Agentic React runtime markers. This catches regressions where a gate appears correct at configuration time but generated entries still enter the final bundle.

## Documentation and Migration

Update the English and Chinese READMEs with:

- Settings upload behavior;
- storage location and project-specific semantics;
- format, dimension, and file-size rules;
- `Apply`, `Cancel`, and Reset behavior;
- the `url | file` configuration examples for every adapter;
- `iconUrl` deprecation guidance;
- runtime-only limitations;
- the production-safety guarantee and explicit-development Webpack usage.

Add a changeset describing the new customization feature, the backward-compatible configuration API addition, and the safer Webpack production gate.

Do not remove `iconUrl` in the same release. Consider removal only in a future major version after documented deprecation.

## Delivery Sequence

1. Add the public types, resolved internal types, and compatibility rules.
2. Implement and test the project identity and Node persistence store.
3. Extend the bridge with the narrow project-settings protocol.
4. Resolve configured URL/file sources and initial local overrides in each adapter.
5. Harden the Webpack production gate and add production tests before enabling UI writes.
6. Extract browser image validation, crop math, and encoding modules.
7. Add the Settings appearance row and staged crop workflow.
8. Wire Apply, Reset, preload, source metadata, and direct-default fallback.
9. Add adapter and Playwright coverage across Vite, Webpack, and Next.
10. Update playgrounds, READMEs, changelog metadata, and release smoke coverage.

Each sequence item should leave the repository buildable. Land the production-gate hardening before or in the same change that introduces persisted customization.

## Acceptance Criteria

- A user can upload a supported raster image, crop it to a `256 x 256` static icon, preview it, and persist it only by clicking Apply.
- The override is shared by all dev-server origins and supported bundlers for the same canonical project root on the same machine.
- A different project does not inherit the override.
- Reset removes only the personal override and reveals the project-configured icon or packaged default.
- Bundler configuration supports explicit URL and file sources while legacy `iconUrl` continues to work.
- Remote URL sources are permitted without being proxied or copied.
- Invalid custom sources never produce a broken launcher image and fall back directly to the packaged default.
- Runtime-only usage does not expose a nonfunctional upload flow.
- No user-facing security, origin, token, or customization-enable setting is introduced.
- Vite, Webpack, and Next production client builds contain no adapter-injected Agentic React runtime or icon customization code.
- The feature is documented and covered by unit, adapter, browser, and production-artifact tests.

