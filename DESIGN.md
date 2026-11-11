---
version: "alpha"
name: "Aurora Boreal Nórdica"
description: "Nordic aurora borealis landing page. Ideal for landing pages, saas. AI-ready template."
colors:
  primary: "#00FF87"
  secondary: "#0A1628"
  tertiary: "#E8F4F8"
  neutral: "#7B2FBE"
  surface: "#00D4FF"
  accent: "#FF6EC7"
typography:
  h1:
    fontFamily: Montserrat
    fontSize: 2.5rem
    fontWeight: 700
  body-md:
    fontFamily: Montserrat
    fontSize: 1rem
    fontWeight: 400
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: 12px
---

## Overview

Nordic aurora borealis landing page. Ideal for landing pages, saas. AI-ready template. Scandinavian design never needed decoration. For decades, Nordic visual culture thrived on restraint — white space, functional typography, the quiet confidence of less. But there's always been this other thread running through the culture: the aurora. That impossible curtain of green and violet light folding across Arctic skies. It's not decorative. It's atmospheric. And when designers finally started pulling those gradients into digital interfaces, something clicked.

The marriage makes sense if you think about it. Scandinavian minimalism gives you the negative space — the dark, cold canvas. The aurora gives you the event. One without the other falls flat: pure minimalism feels sterile in tech contexts, and gradient-heavy designs without structure become visual noise. Together, they create this tension between emptiness and spectacle that feels genuinely premium.

There's also the temperature association. Cold reads as expensive. Always has. From Hasselblad to Bang & Olufsen, Nordic brands understood that frost communicates precision. The aurora palette just extends that logic into something more emotional — still cold, but alive with movement.

- Density: 3/10 — Airy
- Variance: 3/10 — Restrained
- Motion: 6/10 — Expressive

- **Style:** Ethereal, Cold, Majestic
- **Keywords:** aurora borealis, nordic, ethereal, cold, majestic, northern lights, ice, glacial, cosmic, scandinavian minimalism
- **Era:** Timeless Arctic Wilderness
- **Light/Dark:** ✗ No / ✓ Full

## Colors

- **Aurora Green** (#00FF87) — Primary surface or dominant color
- **Arctic Blue** (#0A1628) — Accent highlight, links and focus states
- **Frost White** (#E8F4F8) — Light surface, card backgrounds
- **Violet Sky** (#7B2FBE) — Accent color, emphasis elements
- **Ice Cyan** (#00D4FF) — Secondary accent
- **Glacier Pink** (#FF6EC7) — Primary text color
- **Snow** (#FAFBFC) — Secondary surface
- **Deep Midnight** (#050B1A) — Deep contrast surface


## Typography

- **Display / Hero:** Montserrat — Weight 700, tight tracking, used for headline impact
- **Body:** Montserrat — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Montserrat — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem


## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Split-screen (text left, visual right).
- **Feature sections:** Zig-zag alternating text+image rows. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).


## Elevation & Depth

Northern lights gradient animations, frosted glass panels, ice crystal textures, star field backgrounds, glacier reflections, subtle shimmer effects, cold breath mist, ethereal light waves

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 480ms ease-out. Staggered cascades for lists: 100ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.


## Shapes

Base corner radius: 8px. See rounded tokens in front matter for the full scale.


## Components

- **Primary Button:** Subtly rounded (0.5rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Subtly rounded (0.5rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.


## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No decorative gradients — flat color only
- No shadows heavier than 0 2px 8px rgba(0,0,0,0.08)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

- Do Northern lights gradient animations
- Do Frosted glass panels
- Do Ice crystal textures
- Do Star field backgrounds
- Do Glacier reflections
- Do Ethereal light waves


## Use Case

Landing pages, SaaS

<!-- Source: https://designmd.app/library/aurora-boreal-nordica · designmd.app -->
