# SwiftMemo: UI/UX Redesign Specification & AI Prompting Guide

This document acts as a comprehensive UI/UX design specification for **SwiftMemo**—an agentic AI triage platform for university Help Desk Announcements (HDAs) at De La Salle University (DLSU). Use this file as a direct prompt or reference guide for design generative AIs (such as **v0.dev**, **Claude**, **Galileo AI**, **Figma plugins**, or **Midjourney**) to create a premium, intuitive, and high-fidelity interface.

---

## 1. Core Project Philosophy & Vision

### The Problem: Announcement Fatigue
Students and faculty at DLSU are bombarded with a constant stream of institutional emails (HDAs). Critical deadlines (enrollment, tuition payments, clearance submissions) are frequently buried under irrelevant announcements, causing massive cognitive load, missed dates, and operational friction.

### The Solution: SwiftMemo
SwiftMemo is an **intelligent, agentic triage layer** that intercepts raw HDA emails and converts them into structured, actionable intelligence. It:
*   Filters out non-institutional noise (using safety guardrails).
*   Extracts critical dates, deadines, and urgency levels.
*   Categorizes announcements (Academic, Finance, IT, Health, etc.).
*   Provides a tenant-private RAG search archive and contextual reply draft assistant.
*   Enables voice-accessible briefings (audio text-to-speech stubs).

### Core Design Philosophy
1.  **Action over Info**: Don't just show text; show *what needs to be done* and *when*. Highlight deadlines and actions immediately.
2.  **Sleek & Uncluttered**: Hide the technical complexity of LLMs, vector search, and agents behind a clean, premium, and distraction-free interface.
3.  **Contextual Fluidity**: Move away from rigid tab-based navigation. Ensure that chat, drafting, feed viewing, and settings feel like a single, cohesive, overlay-driven workspace.
4.  **DLSU Pride & Premium Feel**: Use a sophisticated green-accented dark mode dashboard that feels modern, responsive, and tailored for DLSU.

---

## 2. Brand Identity & Design System

To ensure a cohesive visual language, the redesigned interface should follow these system values:

| Token | Specification | Application |
| :--- | :--- | :--- |
| **Primary Color** | DLSU Archer Green (`#006432` / `HSL(150, 100%, 20%)`) | Primary actions, selected states, branding |
| **Accent Color** | Vibrant Mint Green (`#10B981` / `HSL(160, 84%, 39%)`) | Urgency level updates, successes, callouts |
| **Background** | Slate/Zinc Dark Gray (`#09090B` to `#18181B`) | Deep dark mode background for high contrast |
| **Surface/Card** | Glassmorphic Translucent (`rgba(30, 41, 59, 0.4)`) | Cards, menus, and floating side panels |
| **Border** | Subtle border (`rgba(255, 255, 255, 0.08)`) | Layout dividing lines, container boundaries |
| **Typography** | `Outfit`, `Inter`, or `SF Pro` | Modern, high-legibility sans-serif sans |
| **Urgency Indicators** | Low: Gray/Green \| Medium: Yellow/Orange \| High: Coral/Crimson | Visual warning chips for deadlines |

---

## 3. The UX Revolution: From MVP to Premium Workspace

The current Streamlit MVP uses a standard tabbed view. The table below highlights the key user experience (UX) friction points and their modern, intuitive solutions:

| Current MVP Friction (Streamlit) | Proposed Premium UX Redesign |
| :--- | :--- |
| **Tab Fatigue**: Users must click separate tabs to read a summary, ask a chat question, generate a draft response, and edit preferences. | **Unified Split-Screen Workspace**: A single page containing the main Triage Feed with a collapsible sidebar for controls/preferences and a slide-out drawer for RAG Chat & Draft Assistant (the "Copilot Pane"). |
| **Dry Tabular Data**: Visible summaries are shown in a standard database-style grid. Deadlines and urgency metrics are flat text. | **Visual Urgency Feed**: Card-based masonry or timeline layouts. High-urgency cards glow with subtle color gradients, showing visual countdown timers (e.g., "Due in 2 days"). |
| **Disconnected Draft Assistant**: The draft generator requires selecting an email from a dropdown list and writing instructions in a separate text area. | **Inline "Pin & Draft" Workflow**: Each card has a "Draft Reply" action button. Clicking it slides open the Copilot pane, pins the email summary as context, and focuses the user prompt input. |
| **Rigid Preferences Setup**: Toggles require page reloads or manual "Save Preferences" button clicks. | **Real-Time Feed Filtering**: Toggles in a sidebar automatically update the central feed with smooth CSS scale/fade transitions. |
| **Clunky Feedback & Audio Preview**: Feedback forms and audio stub player are hidden in a backend "Phase 2" preview tab. | **Contextual Floating Controls**: Audio summary is represented by a small speaker icon on the card, spawning a bottom-floating audio player. Category override is a quick dropdown on the card itself. |

---

## 4. UI Components & Layout Specification

```
+------------------------------------------------------------------------------------------------------+
|  [Logo] SwiftMemo         [Search all announcements...]   (WS Status) (Tenant: Andrei v) [Settings] |
+------------------------------------------------------------------------------------------------------+
|  SIDEBAR           |  MAIN WORKSPACE (Triage Feed & Timeline)                   |  COPILOT DRAWER   |
|                    |                                                            |                   |
|  * Active Tenant   |  +-- TIMELINE STRIP -------------------------------------+ |  (RAG Chat &      |
|  * Health & LLM    |  | [Mon 10]    [Tue 11]    [! Wed 12]    [Thu 13]        | |   Draft Assistant)|
|                    |  +--------------------------------------------------------+ |                   |
|  [Ingest Mock]     |                                                            |  [x] Close        |
|  [Process Feed]    |  Filter: [Academic] [Finance] [Campus Access] [Events v]   |                   |
|                    |                                                            |  Context:         |
|  PREFERENCES       |  +-- CARD (Urgent: High) --------------------------------+ |  [Subject Title]  |
|  [x] Academic      |  | [Badge: Finance]          (Due: July 15) [Draft] [Audio] | |                   |
|  [ ] Events        |  | Title: Tuition Payment Deadline Extension              | |  Chat Bubble:     |
|  [x] IT Services   |  | Summary: Tuition confirmation due by 11:59PM...        | |  How can I help   |
|  [x] Finance       |  | > Bullet 1    > Bullet 2                               | |  with this?      |
|                    |  +--------------------------------------------------------+ |                   |
|                    |  +-- CARD (Urgent: Low) ---------------------------------+ |  [Prompt Input]   |
|                    |  | [Badge: Academic]                    [Draft] [Audio]   | |                   |
|                    |  +--------------------------------------------------------+ |  [Send]           |
+--------------------+------------------------------------------------------------+-------------------+
|                     [Audio Briefing Player: Now Playing... "Tuition Payment" -[===]-------------]    |
+------------------------------------------------------------------------------------------------------+
```

### 4.1. Global Header
*   **App Logo & Title**: Modern typography with a sleek, glowing green dot next to "SwiftMemo".
*   **Global Search Bar**: Search past announcements with instant autocomplete suggestions.
*   **WebSocket Indicator**: A small green/red breathing light indicating if live notifications are connected.
*   **Tenant Selector Badge**: A drop-down user-profile chip displaying the current active tenant (e.g., `andrei`, `audric`, `sophia`) to easily test multi-tenant separation.

### 4.2. Left Sidebar (Control & Preferences Panel)
*   **System Status Widget**: Minimalist card showing FastAPI health state, API response latency, and active LLM provider (Gemini or Ollama).
*   **Action Command Panel**:
    *   **"Ingest Mock Data"**: Primary button with loading spinner when triggered.
    *   **"Process Feed"**: Secondary button that displays a circular progress bar and updates count metrics (e.g., "11 processed, 3 rejected").
*   **Preference Filters**: Interactive category switches (custom icons for *Academic, Finance, Campus Access, Health & Safety, Events, IT Services, Administrative*).

### 4.3. Central Feed Panel (Triage Feed & Analytics)
*   **Timeline Strip**: A horizontal scrollbar of calendar dates. Dates with upcoming deadlines have red indicator badges. Clicking a date filters the feed instantly.
*   **Quick Metrics Header**: Small glassmorphic metric cards showing:
    *   *Visible Feed Count*
    *   *Critical Deadlines Pending*
    *   *Hidden announcements (filtered out)*
*   **Announcement Summary Card**:
    *   **Header**: Category tag (e.g., `Finance` in amber, `Health & Safety` in crimson), Urgency Score (1-5 represented by filled-in circles), and exact target date.
    *   **Title**: Bold, prominent title.
    *   **Content**: Collapsed structured bullet points. Hovering reveals a "Show Original Email" action.
    *   **Card Footer Action Toolbar**:
        *   **"Generate Draft"**: Quick reply icon. Instantly opens the Copilot Panel with this email pre-selected.
        *   **"Listen Audio Summary"**: Play button. Triggers the audio summary player.
        *   **"Recategorize"**: Small edit tag. Opens an inline feedback dropdown to submit class overrides (Phase 2).
        *   **"Hide"**: Eye-slash icon. Instantly hides the announcement based on tenant preferences.

### 4.4. Right Sliding Drawer (The Copilot Panel)
*   **Dual Mode Selector**: A sliding segment selector: **[ Chat Archive | Draft Assistant ]**.
*   **Draft Assistant Workspace**:
    *   *Context Chip*: Displays the current email title pinned for context. Allows user to clear context to write a global draft.
    *   *Prompt Text Area*: Clean input box with suggested quick actions (e.g., "Ask for extension", "Confirm attendance").
    *   *Response Window*: A code/editor styled display containing the generated draft. Features "Copy to Clipboard" and "Regenerate" buttons.
*   **Chat Archive Workspace**:
    *   *Message History*: Alternating user/assistant bubbles with clean spacing and subtle shadows.
    *   *Citations/Sources Drawer*: When the bot answers a question, it lists references in tiny interactive card chips. Clicking them previews the relevant source email text.

### 4.5. Floating Audio Briefing Player (Bottom Bar)
*   A persistent, slide-up media bar that appears when a user clicks "Listen Audio Summary".
*   Includes: Play/Pause/Skip buttons, interactive audio waveform visualizer, progress time bar, speed multiplier selection (1x, 1.25x, 1.5x), and a close button.

### 4.6. Analytics & MLflow Telemetry Panel (Collapsible Overlay)
*   For administrators, a hidden-by-default drawer displaying model metrics:
    *   *Guardrail Precision/Recall* gauge charts.
    *   *Pydantic Schema Validation Success Rate* percentage bar.
    *   *Model Latency & Token Usage* line graph.

---

## 5. Structured AI Prompts for Code & Design Generators

Copy and paste the following prompts directly into the respective design AI tools.

### 5.1. Prompt for v0.dev / Claude (React + Tailwind + Framer Motion)
> **Copy the text below to generate the React mockup code:**
```text
Create a high-fidelity, interactive React dashboard for "SwiftMemo"—an agentic AI triage platform for De La Salle University's Help Desk Announcements. Use Tailwind CSS and Lucide React icons.

Design Guidelines:
- Color Scheme: Sophisticated dark mode (Background: zinc-950, Cards: zinc-900/60 with glassmorphism backdrop-blur, Accent: DLSU Archer Green #006432 and vibrant emerald-500).
- Typography: Clean modern sans-serif (Inter/Outfit).

Layout Structure:
1. Global Header: Logo with a green pulse dot, Search bar, WebSocket connectivity badge, Tenant selector dropdown (Andrei, Audric, Sophia), Settings icon.
2. Left Sidebar: Minimalist API connection status widget (shows FastAPI health + Gemini/Ollama indicator), prominent "Ingest" & "Process" buttons, and Category toggle filters.
3. Central Feed: Horizontal scrollable "Deadline Timeline Tracker", quick metric cards, and a vertical feed of "Announcement Cards". 
   - Each card displays: Category Badge (e.g. Finance, Academic), Urgency Score (1-5 visual indicator), Deadline countdown chip, Title, structured bullet points, and a footer toolbar with action buttons: "Generate Draft" (reply icon), "Listen Audio" (play icon), and "Recategorize" (dropdown).
4. Right Drawer (Copilot Panel): Slides open from the right side. Contains a segmented selector: [Chat Archive | Draft Assistant]. 
   - Under Draft: shows "Pinned Context: [Annoucement Title]", a text area for prompt inputs, and a modern output window showing the generated draft with "Copy" button.
   - Under Chat: standard assistant/user message layout, with expandable "Source Documents" cards.
5. Bottom Bar: Floating audio briefing player containing a play/pause button, a mocked wave visualizer, and speed controls.

Ensure all interactive states are fully simulated (hover effects, active tab highlights, sliding animations for the right drawer, and fluid toggle updates).
```

### 5.2. Prompt for Figma AI Plugins / UI Generators (Galileo AI, Uizard, Musavir)
> **Copy the text below to generate Figma design frames:**
```text
Create a desktop web dashboard layout for an AI email triage and assistant app named "SwiftMemo".
- Style: Futuristic dark mode interface, glassmorphic card containers, modern green-accented theme, subtle glowing borders.
- Key Screen: A unified command-center dashboard split into three panes:
  - Left: Navigation panel and filter switches for email categories.
  - Middle: A stream of clean, card-based email summaries with urgency ratings (high urgency highlighted in coral, low in green), category tags, and action buttons. A horizontal timeline widget sits at the top of the feed.
  - Right: A slide-out AI Assistant Chat & Draft panel showing conversational message threads and draft response textareas.
  - Bottom: A sleek floating audio media player overlay.
- Visuals: Use the Inter typeface, semi-transparent overlays, crisp SVG icons, and a highly premium layout suitable for a student productivity application.
```

### 5.3. Prompt for Midjourney / Stable Diffusion (Visual Mood Boards & Mockups)
> **Copy the text below to generate aesthetic reference images:**
```text
A high-fidelity desktop web application dashboard mockup, dark mode, futuristic and sleek UI design, glassmorphism, glowing emerald green accents, card-based interface, side drawers, minimal widgets, data visualization charts, clean typography, DLSU Archer theme, 8k resolution, cinematic lighting, modern SaaS UI design, Figma portfolio display, UX award winner --ar 16:9 --v 6.0
```

---

## 6. Target User Journeys (Aesthetic & Flow Walkthroughs)

### A. The "Golden Path" Live Demo Flow
1.  **System Initialization**: The user opens the page in dark mode. The sidebar API indicator glows green with the label `FastAPI Online | Gemini 1.5 Flash`.
2.  **Feeding the AI**: The user clicks `Ingest Mock Data`. The button triggers a subtle loading pulse. A notification banner slides down: `11 announcements successfully fetched.`
3.  **Triage Processing**: The user clicks `Process Feed`. An overlay blur sweeps the screen, showing the agents working: *Classifying, Parsing Deadlines, Storing to ChromaDB.*
4.  **Managing the Feed**: The feed updates. A crimson-glowing card sits at the top: **"Tuition Payment Deadline Extension"** with a red countdown badge: `Due in 6 Days`.
5.  **Context-Aware Action**: The user clicks the card's `Draft Reply` icon. The right drawer slides in. The context chip automatically pins `Tuition Payment Deadline Extension`. The user types: *"Request a payment plan options list"*, and clicks generate. A draft appears instantly in the editor window.
6.  **Audio Review**: Before leaving, the user clicks `Listen Audio` on the card. The bottom audio player appears, rendering a subtle green wave animation as the synthesized speech plays.
