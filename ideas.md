# Pickleball Open Play visual direction

## Approach 1: Clubhouse Control Desk

**Very Brief Intro:** A warm, tactile club operations dashboard that feels like the front desk of a well-run neighborhood pickleball club. Forest green, lime, sage, and amber create confident live-status signaling without looking like a generic sports template.

**Probability:** 0.07

## Approach 2: Court Lines Editorial

**Very Brief Intro:** A bright editorial system built from crisp court-line geometry, paper-like surfaces, and structured scorecard typography. The experience would feel like a modern printed match board translated into an app.

**Probability:** 0.03

## Approach 3: Sunset Social Club

**Very Brief Intro:** A relaxed social-club aesthetic with terracotta, cream, and faded blue inspired by evening games and outdoor courts. It emphasizes community and personality over operational density.

**Probability:** 0.09

## Selected Approach: Clubhouse Control Desk

### Design Movement
Contemporary editorial hospitality design blended with sports operations UI: calm, legible, tactile, and lightly playful.

### Core Principles
1. Live status should be readable in one glance.
2. Operational controls should feel calm and deliberate, never alarming.
3. Spacious surfaces and clear grouping should reduce queue anxiety.
4. Small moments of lime and amber should carry meaning, not decoration.

### Color Philosophy
Deep forest anchors trust and keeps the app grounded in the physical clubhouse. Warm off-white keeps the experience approachable in bright indoor environments. Lime identifies momentum and “ready” states, while amber marks waiting and attention without using harsh warning red.

### Layout Paradigm
An asymmetric operations board: live court status gets the broad left rail, while the next-game queue sits in a narrower right rail that stays visible on desktop and stacks naturally on phones.

### Signature Elements
A small pickleball mark, numbered live queue rows, and soft status chips that distinguish live, ready, winner-round, loser-round, and open-play states.

### Interaction Philosophy
Every action should communicate its result immediately through a visible state change, compact confirmation, or toast. Staff controls stay contextual and hidden from spectators until explicitly enabled.

### Animation
Use short 160–240ms ease-out transitions for hover, press, and state changes. Cards may lift by 2px on hover; the next-game group can reveal with a subtle stagger. Respect reduced-motion preferences and never animate layout-heavy properties.

### Typography System
Use a bold display face for hero statements and a readable neutral sans for controls and queue data. Headlines should be compact and confident; data labels should use uppercase tracking sparingly for scanability.

### Brand Essence
The live open-play board for clubs that want every player to know where they stand and what happens next. Personality: **welcoming, organized, spirited**.

### Brand Voice
Headlines and labels are concise, friendly, and specific. CTAs sound like a helpful club operator, not a software vendor.

Example lines:
- “Know when you’re up.”
- “These four winners are on deck.”

### Wordmark & Logo
Use a compact wordmark paired with a bold, text-free pickleball mark: a lime ball with two dark curved seams, designed to remain recognizable at small header and favicon sizes.

### Signature Brand Color
**Clubhouse Lime — `#C8F255`**, an ownable signal color that means momentum, readiness, and the next game becoming real.

## Style Decisions

- Keep the interface light-first for club environments with strong forest surfaces for contrast.
- Treat result-aware winner/loser grouping as a first-class visual concept, not a hidden implementation detail.
