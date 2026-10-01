# Design System and Visual Identity

This document defines the visual identity, design decisions, and design system contracts for RecordMint's web interface (`apps/web`).

## Product & Brand Decision

- **Product:** RecordMint — record in the browser, share a link, own the file.
- **Audience:** Anyone opening a shared link (frequently on a mobile phone) and workspace members recording or managing their recording library.
- **Vibe words:** Clear, quick, calm.

### Five Brand Values

RecordMint's design tokens derive from five foundational values implemented in `tokens.css`:

| Brand value | Value | Rationale |
|---|---|---|
| **Hue** | `165` (mint green) | Signals clarity, freshness, and focus without aggressive neon saturation. |
| **Chroma** | `0.11` | Kept deliberate and controlled so the accent remains quiet and does not vibrate. |
| **Warmth** | `0.006` | Very subtle neutral chroma tinting, giving background and card surfaces warmth without color fatigue. |
| **Radius scale** | `1.1` | Soft, modern corners (`r-md` ≈ 11px, `r-lg` ≈ 15.4px) for cards, buttons, and inputs. |
| **Type pairing** | Modern (`Inter Tight` display + `Source Sans 3` UI) | Fast, legible, neutral grotesque hierarchy designed for screen density. |

### Theme Defaults & Media-First Rule

- **Media-first default:** Dark mode is the default experience for playback (`/v/[publicId]`) and recording (`/record`), focusing viewer attention on the video content and reducing glare.
- **Light mode:** Supported and accessible across all screens.
- **Persistence & Fallback:** Controlled via `data-theme="light"` or `data-theme="dark"` on `<html>`. A manual toggle in the navigation header allows explicit switching and persists the choice in `localStorage`. If no stored preference exists, media pages default to dark while standard pages honor the viewer's `prefers-color-scheme`.

### Typography & Fonts

All fonts are self-hosted via `next/font` directly from the application origin at build time. No third-party network requests are made at runtime.

| Face | Role | Weight(s) | Licence |
|---|---|---|---|
| **Inter Tight** | Display face (titles, wordmark) | 500, 600, 700 | SIL Open Font License 1.1 (OFL-1.1) |
| **Source Sans 3** | UI face (body, buttons, inputs, labels) | 400, 500, 600 | SIL Open Font License 1.1 (OFL-1.1) |
| **ui-monospace** | Monospace (timestamps, IDs, code) | System stack | System / OS built-in |

### Iconography

- **Rule:** Never invent or hand-draw a logo or custom icons. The product name is a clean wordmark set in the display face (`Inter Tight`).
- **Icons:** Lucide icons only (ISC/MIT licence). Stroke width 1.75px, sized consistently to adjacent text (16px for small text, 18px for body, 20px for buttons).

## Non-Negotiables

1. **One primary action per screen:** Every view has exactly one primary action button (accent color). All other actions are secondary, ghost, or quiet utility controls.
2. **Accent under 5%:** The mint green accent is reserved for key interactions (primary button, active navigation, focused control). Neutral surfaces carry the interface.
3. **Labels above inputs:** Form fields always position their visible `<label>` above the `<input>` / `<textarea>` / `<select>`, never relying on placeholders as labels.
4. **No gradients:** Surfaces use flat solid tokens derived with OKLCH. No decorative background gradients.
5. **No coloured left borders:** Status and grouping rely on spatial proximity, typography, and clean badges, never colored edge stripes.
6. **No emoji in chrome:** Navigation, tab bars, headers, and UI controls use semantic text or Lucide icons. Emoji appear only where user-generated content or reactions explicitly permit them.
7. **No zebra tables:** Tables and lists use hairline row dividers (`var(--line)`) and subtle hover states.
8. **No modals for forms:** Inline editing, expandable drawers, or dedicated pages house forms. Modals are restricted to irreversible confirmation decisions.
9. **Sentence-case real copy:** Microcopy uses plain, concise, sentence-case English. Buttons use `verb + object` (e.g., "Start recording", "Save visibility").
10. **Design every state:** Every view accounts for all states: empty, loading, ideal, error, and no access.
