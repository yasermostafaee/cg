# README_PROJECT.md

# Broadcast CG Platform — Product & Technical Blueprint

## Project Overview

Build a professional **Desktop Broadcast Graphics Platform** for TV networks using CasparCG-based playout systems.

The platform consists of TWO separate but connected products.

---

# Product A — CG Template Designer

Purpose:

A visual editor for creating HTML-based broadcast graphics.

Users must be able to visually create:

- Logo bugs
- Lower thirds
- Ticker/Crawler
- Breaking news graphics
- Fullscreen graphics

The system must export broadcast-safe HTML templates compatible with CasparCG.

Users should be able to:

- Upload logos/images
- Add text
- Add shapes/background boxes
- Add Bodymovin/Lottie animations
- Resize/move elements via drag & drop
- Configure animations
- Define dynamic fields
- Export editable templates

This should feel like:

- Canva for Broadcast Graphics
- Simplified After Effects for CG
- Easy enough for TV operators

DO NOT create a complex After Effects clone.

Usability is critical.

---

# Product B — CG Runtime / Playout Controller

Purpose:

Control and manage broadcast graphics in realtime.

Responsibilities:

- Import HTML templates
- Import Bodymovin/Lottie outputs
- Edit dynamic fields
- Play templates
- Update running templates
- Stop templates
- Playlist management
- Runtime synchronization with CasparCG
- Redundancy handling

This should feel similar to:

- Viz Trio
- Ross XPression control
- StreamShapers Ferryman

Realtime performance and reliability are critical.

---

# IMPORTANT INSTRUCTION FOR CLAUDE OPUS

You are acting as:

- Senior Broadcast Software Architect
- Senior Electron Engineer
- Senior React Engineer
- Senior Motion Graphics Engineer
- Senior UX Designer for Broadcast Systems
- Senior CasparCG Integration Specialist

DO NOT immediately start coding.

Follow this order:

## Phase 1 — Requirement Analysis
Analyze the entire system.
Identify risks.
Ask critical architectural questions.
Challenge weak technical decisions.

## Phase 2 — System Architecture
Create complete architecture.

## Phase 3 — Domain Modeling
Create internal editor model.

## Phase 4 — Export Architecture
Design HTML + template package export system.

## Phase 5 — CasparCG Runtime Architecture
Design AMCP communication.

## Phase 6 — UI/UX System
Design operator-friendly workflows.

## Phase 7 — Folder Structure
Create scalable architecture.

## Phase 8 — Development Roadmap
Break into milestones.

## Phase 9 — Coding
Only start implementation after approval.

Never skip architecture.

Never overengineer.

Avoid spaghetti code.

Prefer maintainability and reliability.

---

# Core Technical Requirements

## Platform

Desktop Application

OS Support:
- Windows only

Framework:
- Electron

---

## Frontend Stack

Use:

- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand
- React Hook Form
- Zod

Requirements:

- Strict TypeScript
- No `any`
- Reusable architecture
- Feature-based structure
- Production-ready patterns

---

## Graphics Editor

Use:

### Konva.js

For:
- Visual editing
- Drag/drop
- Resizing
- Selection
- Layer positioning
- Safe editing experience

Must support:

- Snap guides
- Alignment helpers
- Selection box
- Multi-select
- Keyboard shortcuts

---

## Animation Engine

Use:

### GSAP

Reason:

DOM-based rendering is required because final output is HTML.

Do NOT use Canvas rendering for final graphics.

Must support:

- Entry animation
- Loop animation
- Exit animation

Avoid free AE-style timeline complexity.

Instead implement:

## Preset Animation System

Entry Presets:
- Fade
- Slide Left
- Slide Right
- Slide Up
- Slide Down
- Scale
- Blur In

Exit Presets:
- Fade Out
- Slide Out
- Scale Down
- Blur Out

Configurable:
- Duration
- Delay
- Easing
- Direction

UX must be simple.

This software targets TV operators, not motion designers.

---

# Broadcast Graphics Types

Supported templates:

## Logo Bug

Capabilities:
- Position
- Scale
- Fade animation
- Opacity

---

## Lower Third

Capabilities:
- Background shape
- Name field
- Subtitle field
- Optional image/logo
- Entry animation
- Exit animation
- Dynamic text updates

---

## Ticker / Crawler

Capabilities:
- Infinite loop
- RTL support
- LTR support
- Mixed language support
- Speed control
- Pause/resume
- Dynamic updates

Future support:
- RSS
- API data source

---

## Breaking News

Capabilities:
- Alert styling
- Animated banner
- Dynamic text update

---

## Fullscreen Graphics

Capabilities:
- Multiple text areas
- Images
- Video placeholder
- Lottie support

---

# Dynamic Field System

Templates must support dynamic fields.

Example:

headline
subtitle
logo
backgroundColor
breakingTitle

Dynamic field types:

- text
- multiline text
- image
- color
- boolean
- number
- select

Example:

```json
{
  "id": "headline",
  "type": "text",
  "defaultValue": "Breaking News"
}
```

Runtime app must allow live updates.

Realtime updates while graphic is ON AIR are mandatory.

No stop/replay required for updates.

---

# Scene Graph Architecture

Internal editor model:

Scene
 ├── Layers
 │      ├── Elements
 │      │      ├── Text
 │      │      ├── Image
 │      │      ├── Shape
 │      │      ├── Lottie
 │      │      └── Container

Each element should support:

- Position
- Width
- Height
- Rotation
- Opacity
- Visibility
- Layer order
- Locking

---

# Resolution System

Must support:

- 1920x1080
- 3840x2160
- Custom resolution

User should be able to switch project resolution.

Must support:

- Title Safe Area
- Action Safe Area
- Snap Guides

Broadcast safe rendering is mandatory.

---

# RTL & Persian Support (CRITICAL)

Persian/Arabic support is CORE requirement.

Must support:

- RTL text
- LTR text
- Mixed RTL/LTR
- Correct Persian shaping
- Arabic shaping
- ZWNJ support
- Unicode safety
- Emoji support
- Font fallback

Must render correctly:

خبر فوری | OpenAI نسخه جدید منتشر کرد

برنامه Cinema Tonight - Episode 12

Ticker rendering must never break Persian letters.

No disconnected characters.

No broken ligatures.

No malformed RTL layouts.

---

# Bodymovin / Lottie Support

Support importing:

Bodymovin JSON exports from Adobe After Effects.

Use:

lottie-web

Requirements:

Users should be able to:

- Import lottie animation
- Resize
- Position
- Layer control
- Define dynamic fields around it

Lottie should behave as asset element.

Do NOT treat lottie as full template replacement.

---

# Export System

Do NOT export HTML only.

Use package format.

## File Extension

.vcg

This should be a zip-based package.

Structure:

/template-name.vcg

manifest.json
index.html
template.json
assets/

---

## manifest.json

Contains:

- Version
- Template Type
- Resolution
- Dynamic Fields
- Dependencies

---

## template.json

Contains:

- Scene graph
- Layers
- Elements
- Animations
- Dynamic fields

This file must be editable.

Runtime app should import this.

---

## index.html

Broadcast-safe HTML output.

Must support:

- Dynamic field injection
- Play animation
- Update animation
- Stop animation

---

# Runtime / Playout Controller

Responsibilities:

- Load templates
- Edit fields
- Play
- Update
- Stop
- Queue management
- State sync

Operators must see:

- Playing
- Stopped
- Updating
- Error
- Lost connection

---

# CasparCG Integration

Protocol:

AMCP

Use TCP communication.

Must support:

PLAY
STOP
CG ADD
CG UPDATE
CG STOP
CLEAR
LOAD

Must support:

Single playout with redundancy.

Architecture:

Primary CasparCG
Backup CasparCG

Must include:

- Heartbeat
- Auto reconnect
- Failover
- Status monitoring

Bidirectional sync required.

If playout stops CG externally:
Runtime UI state must update automatically.

---

# Runtime List System

Operator must manage list of graphics.

Example:

[Logo]
[Breaking News]
[Lower Third]
[Ticker]

Each item must support:

- Play
- Update
- Stop
- Duplicate
- Remove
- Status

Status examples:

- Idle
- Loaded
- Playing
- Updating
- Error

---

# Storage

Use:

SQLite

Store:

- Templates
- Recent files
- Connections
- Runtime presets
- User preferences

---

# UI/UX Requirements

The system must feel:

- Fast
- Reliable
- Operator-friendly
- Broadcast-safe
- Minimal learning curve

Avoid overly complex workflows.

Minimize clicks.

Critical operations must be fast.

No hidden states.

---

# Folder Structure

Use feature-based architecture.

src/
├── app/
├── modules/
│   ├── editor/
│   ├── runtime/
│   ├── templates/
│   ├── caspar/
│   ├── lottie/
│   ├── export/
│   └── settings/
├── shared/
├── components/
├── hooks/
├── lib/
├── stores/
├── services/
├── config/
├── types/
├── constants/
└── utils/

---

# Coding Standards

Rules:

- Strict TypeScript
- No any
- SOLID principles
- Feature-based architecture
- Reusable components
- Testable modules
- Clean separation of concerns
- No duplicate code

---

# Development Roadmap

## Phase 1
Architecture
Project setup
Electron foundation

## Phase 2
Editor canvas
Scene graph
Selection system

## Phase 3
Drag/drop
Resize
Layering

## Phase 4
Animation system
GSAP presets

## Phase 5
Template export
VCG package system

## Phase 6
Runtime app
Play/update/stop

## Phase 7
CasparCG integration
Realtime sync

## Phase 8
Redundancy
Reconnect system

## Phase 9
Optimization
Testing
Broadcast validation

---

# Final Rule

Always prioritize:

- Reliability
- Maintainability
- Realtime performance
- Broadcast safety
- Persian support
- Simplicity
- Operator experience

Do not build generic software.

Build production-grade broadcast software.

