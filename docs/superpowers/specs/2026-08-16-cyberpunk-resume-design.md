# Cyberpunk Resume Redesign

## Goal

Replace the current theme-driven resume presentation with a custom, static, responsive resume site that presents Brian Smith's work clearly while using an animated cyberpunk visual identity.

## Scope

- Update the site's primary title to `Senior Business Consultant · Solutions Architect · Product Partner`.
- Add Entrata as the first experience entry: **Senior Business Consultant**, Lehi, UT, June 2025–Present.
- Use the five responsibilities from the latest shared Google Drive resume for the Entrata entry.
- Retain the existing profile image and place it in the hero as a neon-framed portrait.
- Preserve the existing career history, education, contact routes, and social links unless the new resume specifically replaces their wording.

## Design

The page is a single static resume with a dark cyberpunk visual system:

- A near-black base with layered cyan, magenta, and violet ambient light pools that move slowly behind the page.
- A restrained perspective grid animation and subtle scanline texture create depth without competing with the content.
- The hero contains Brian's name, role, contact information, and portrait.
- Resume content sits in high-opacity, frosted dark panels with strong neutral-text contrast. Cyan and magenta are decorative accents, not body-text colors.
- Desktop uses a narrow profile/skills sidebar and a primary timeline column. Mobile stacks into one readable column.
- The experience timeline highlights Entrata first, followed by Pallet, SmartRent, and prior roles.

## Technical Approach

- Keep GitHub Pages/Jekyll static hosting; no backend, database, or client-side framework is needed.
- Replace the external resume theme's rendered layout with local Jekyll templates and stylesheet rules owned by this repository.
- Use CSS-only animations for the ambient color fields, grid, and optional panel glow. No canvas/WebGL dependency.
- Use the existing `images/profile.jpg` image locally in the deployed site.

## Accessibility and Resilience

- Meet readable contrast for body text against panels and retain normal text selection, keyboard navigation, and semantic headings.
- Honor `prefers-reduced-motion` by disabling decorative animations.
- Include print styles that remove the animated treatment, use white paper/background with dark text, and retain all resume content in a conventional reading order.
- Make the layout responsive from narrow mobile screens through desktop widths.
- Decorative background layers must never intercept pointer events or obscure content.

## Verification

- Add automated checks that confirm the rendered resume contains the Entrata role, current dates, and primary accessibility/print hooks.
- Build the Jekyll site successfully with the project’s Bundler command.
- Inspect desktop and mobile renderings, including reduced-motion and print modes, in the project preview.

## Non-Goals

- No content management system, resume editor, data store, or server-side backend.
- No auto-playing sound, WebGL scene, or animation that requires interaction to read the resume.
