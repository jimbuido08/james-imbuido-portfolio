# James Imbuido — Interactive Data Universe Portfolio

## 0. Project Overview

Build a premium, highly interactive personal portfolio website for **James Imbuido**, a Data Scientist.

The website should NOT feel like a conventional portfolio/resume site.

It should feel like an **interactive personal data universe** where the visitor explores James's career, skills, projects, AI systems, and machine-learning work through a central 3D interactive experience.

The site should take inspiration from the interaction philosophy of `https://lachinemearning.com/` — particularly the idea of using an interactive 3D environment as a navigation mechanism — but **must not copy the brain visual or its implementation**.

The central visual metaphor is:

> **The Data Universe**

The user enters a 3D universe representing James's work as a Data Scientist.

Different nodes/objects represent:

- About
- Experience
- AI / Machine Learning
- JTB — James's personal AI chatbot
- James Chess AI
- Projects
- Education
- Contact

The 3D environment acts as an immersive navigation layer, while all important information must also remain accessible through conventional navigation for usability, accessibility, mobile devices, SEO, and users who do not want to interact with WebGL.

---

# 1. Primary Goals

## 1.1 Portfolio goals

The website should:

1. Demonstrate James's capabilities as a Data Scientist.
2. Demonstrate practical machine-learning experience.
3. Demonstrate AI/LLM application development.
4. Demonstrate software engineering/full-stack capabilities.
5. Provide interactive demonstrations rather than only screenshots.
6. Make James's professional background easy to understand.
7. Be memorable and visually distinctive.
8. Be performant and responsive.
9. Be deployable entirely through Vercel + managed services.
10. Keep recurring infrastructure costs low.
11. Be maintainable and extensible.

---

# 2. Core Concept — The Data Universe

## 2.1 Visual metaphor

The homepage contains a full-screen interactive 3D universe.

At the centre is a central object representing James:

```text
                 ABOUT
                   ●

        AI / ML ●     ● EXPERIENCE


                  ◉
             JAMES IMBUIDO


        JTB ●            ● CHESS
```

The actual implementation should be substantially more visually sophisticated than this diagram.

The central object should feel like a **data core** rather than a generic glowing sphere.

Around it:

- floating particles
- data streams
- node connections
- subtle orbital motion
- small visual artefacts representing each domain
- dynamic lighting
- depth
- atmospheric effects

The scene should feel:

- futuristic
- sophisticated
- technical
- minimal
- premium
- professional

Avoid:

- excessive cyberpunk aesthetics
- gamer aesthetics
- excessive neon
- clutter
- cheesy "AI" visuals
- generic stock imagery

---

# 3. Data Universe Nodes

The initial universe should contain the following primary nodes.

## 3.1 ABOUT

Represents:

- Who James is
- Personal introduction
- Career journey
- Nursing → Data Science transition
- Philosophy / approach to technology

Visual representation:

- central identity node
- subtle human/data abstraction

Interaction:

Hover:
- Highlight node
- Show `ABOUT`

Click:
- Camera smoothly transitions into About section.

---

# 3.2 EXPERIENCE

Represents professional experience.

Primary content:

- Commonwealth Bank of Australia
- Data Scientist experience
- Career progression
- Relevant professional achievements

Visual representation:

- corporate/data building
- timeline
- structured data node

Interaction:

Click → Experience section.

---

# 3.3 AI / MACHINE LEARNING

This is one of the largest nodes.

Contains:

- Traditional ML
- Deep learning where relevant
- NLP
- Recommendation systems
- Classification
- Regression
- Clustering
- LLM applications
- RAG
- Agentic AI
- Model evaluation
- ML engineering

Interaction:

Click → Machine Learning project laboratory.

The section should contain project cards with filters:

```text
ALL
AI / ML
LLM
NLP
CLASSICAL ML
AGENTS
EXPERIMENTS
```

---

# 3.5 JTB — JAMES TALKS BACK

JTB is the personal AI chatbot.

This is a flagship interactive project.

The visitor can ask JTB questions about James.

Examples:

```text
"Tell me about James's experience."

"What machine learning projects has James worked on?"

"Why did James transition from nursing to data science?"

"What technologies does James use?"

"Tell me about his work at CBA."

"What makes James different from other data scientists?"
```

JTB must be grounded in curated information about James.

It should not invent experience, projects, qualifications, employment history, or achievements.

---

# 3.6 JAMES CHESS AI

This is another flagship interactive project.

Visitors can play chess against a custom chess model created by James.

Important:

> The chess model runs entirely client-side.

No server-side model inference should be required during normal chess gameplay.

The game should:

- display a chess board
- allow drag/drop moves
- validate legal moves
- allow the user to play against the model
- display game state
- display move history
- detect win/loss/draw
- provide reset/new-game functionality
- optionally provide difficulty levels
- optionally show model evaluation/thinking state

The chess rules engine and model must remain conceptually separate.

The chess rules system determines legal moves.

The model determines which legal move it wants to play.

Architecture:

```text
User
 ↓
Chess UI
 ↓
chess.js / rules engine
 ↓
Board state
 ↓
Client-side James Chess Model
 ↓
AI move
 ↓
Rules validation
 ↓
Board
```

---

# 3.7 CHESS REWARD SYSTEM

Chess has a secondary purpose:

> If an authenticated user defeats the James Chess AI, they receive **5 additional JTB interactions**.

Initial JTB allocation:

```text
10 interactions
```

Chess reward:

```text
+5 interactions
```

The reward should only be granted once per user unless explicitly changed later.

Important security consideration:

The client cannot be trusted to simply report:

```text
"I won"
```

Therefore, after a game finishes, the client sends the game move history to a secure server-side route.

The server should:

1. Authenticate the user.
2. Receive move history.
3. Replay the game using a trusted chess rules implementation.
4. Confirm the game was legal.
5. Confirm the player actually won.
6. Confirm the reward has not already been claimed.
7. Atomically award 5 JTB credits.
8. Record the reward.

The client-side chess model itself does NOT need to be exposed through an API.

---

# 4. JTB Authentication

JTB requires authentication.

Visitors should not be able to anonymously consume LLM credits.

## 4.1 Registration fields

Keep registration minimal.

Required:

```text
Email
Password
Employment status
```

Employment status options:

```text
Student
Seeking opportunities / unemployed
Employed
Employer / recruiter / hiring manager
Other
Prefer not to say
```

The employment status is primarily for understanding the portfolio audience.

Do not use employment status to provide different chatbot privileges.

---

# 4.2 Authentication provider

Use:

**Supabase Auth**

Use secure email/password authentication.

Do NOT implement password storage manually.

Use Supabase's current Next.js SSR authentication architecture.

Supabase provides:

- Authentication
- PostgreSQL
- Row Level Security
- Server-side auth integration
- Client/server auth clients

Reference:

https://supabase.com/docs/guides/auth/quickstarts/nextjs

---

# 4.3 User data

Conceptual schema:

```text
auth.users
    |
    └── profiles
            ├── id
            ├── employment_status
            ├── created_at
            └── updated_at
```

Do not duplicate passwords in the application database.

Supabase Auth owns authentication credentials.

---

# 5. JTB Usage System

Each new user receives:

```text
10 JTB interactions
```

Track usage server-side.

Suggested tables:

```text
profiles
├── id
├── employment_status
├── credits_remaining
├── chess_reward_claimed
├── created_at
└── updated_at

chat_interactions
├── id
├── user_id
├── created_at
├── request_metadata
└── response_metadata

rewards
├── id
├── user_id
├── reward_type
├── credits_awarded
├── created_at
└── metadata
```

Avoid storing full chatbot conversations unless there is a clear product requirement.

Collect as little personal data as reasonably possible.

---

# 5.1 JTB interaction flow

```text
User submits message
        ↓
Server validates authentication
        ↓
Check credits_remaining > 0
        ↓
Validate request
        ↓
Retrieve JTB context
        ↓
Call LLM
        ↓
Successful response?
      /     \
    NO       YES
    ↓         ↓
No credit   Deduct 1
deducted    interaction
              ↓
          Return response
```

Only deduct a credit after successful processing.

Never rely on the browser to maintain the user's credit count.

---

# 5.2 JTB exhausted state

When:

```text
credits_remaining = 0
```

show:

```text
You've used all your JTB interactions.

Want 5 more?

[ Beat James's Chess AI +5 ]

or

[ Reach out to James ]
```

The contact option should lead to the contact section.

Chess reward should lead directly to the chess experience.

---

# 5.3 Usage safeguards

Implement:

- per-user rate limiting
- maximum message length
- maximum response length
- server-side credit checks
- server-side credit deduction
- LLM API key protection
- request validation
- abuse prevention
- optional CAPTCHA if abuse becomes an issue
- configurable monthly spend limit at the LLM provider

The LLM API key must NEVER be exposed to the browser.

---

# 6. JTB Architecture

Initial architecture:

```text
Browser
   ↓
Next.js JTB UI
   ↓
Next.js Server Route / Server Action
   ↓
Supabase authentication
   ↓
Usage validation
   ↓
JTB context
   ↓
LLM API
   ↓
Response
   ↓
Credit deduction
   ↓
Browser
```

Do not introduce a separate Python backend unless the chatbot becomes complex enough to justify it.

Future architecture can evolve into:

```text
Next.js
   ↓
AI API
   ↓
FastAPI
   ↓
RAG / Agents / Evaluation
```

but this is NOT required for V1.

---

# 7. JTB Knowledge Base

Create a structured source of truth for JTB.

Suggested structure:

```text
/content/jtb/

about.md
experience.md
education.md
skills.md
projects.md
ml.md
ai.md
career.md
faq.md
```

JTB should be grounded only in approved content.

Important system behavior:

- Never invent facts.
- Never fabricate projects.
- Never fabricate employment achievements.
- Never invent metrics.
- Never claim James has experience with a technology unless documented.
- If information is unavailable, explicitly say so.
- Keep responses concise unless the user asks for detail.
- Maintain a professional but personable tone.

---

# 8. MACHINE LEARNING PROJECT LAB

Create a dedicated section:

```text
/ai-ml
```

Project cards should support:

- title
- category
- short description
- problem
- approach
- technologies
- results
- GitHub link
- live demo link
- case study

Each project should have its own page:

```text
/ai-ml/[slug]
```

---

# 8.1 ML case-study template

Each project should follow:

```text
PROJECT TITLE

Problem
--------

What problem were you solving?

Data
----

What data was used?

Approach
--------

How did you approach the problem?

Models
------

What models were tested?

Evaluation
----------

What metrics were used and why?

Results
-------

What did you achieve?

Lessons
-------

What did you learn?

Technical Stack
---------------

Python
scikit-learn
XGBoost
PyTorch
etc.

Links
-----

GitHub
Live Demo
Paper / Documentation
```

Use visual explanations where useful.

Examples:

- confusion matrix
- ROC curve
- feature importance
- SHAP
- model architecture
- training curves
- prediction examples

Do not fabricate metrics.

---

# 10. Portfolio Information Architecture

Primary routes:

```text
/
 /about
 /experience
 /ai-ml
 /ai-ml/[slug]
 /jtb
 /chess
 /contact
 /login
 /signup
 /account
```

Potential future routes:

```text
/experiments
/resume
/blog
/now
```

---

# 11. Homepage

The homepage is primarily the Data Universe.

## Above the fold

Display:

```text
JAMES IMBUIDO

DATA SCIENTIST

Data × AI × Interactive Systems

[ Explore ]
```

The 3D Data Universe should immediately be visible.

Do not force the visitor through a long introductory animation.

Animation should be short, smooth, and skippable.

---

# 11.1 Data Universe interaction

Desktop:

- mouse movement creates subtle parallax
- drag rotates the scene
- scroll zooms or transitions
- hover highlights nodes
- click selects nodes
- camera smoothly transitions
- selected node expands

Mobile:

- touch rotation
- tap nodes
- simplified effects
- reduced particle count
- reduced 3D complexity

Fallback:

Provide conventional navigation.

The entire portfolio must remain usable without WebGL.

---

# 11.2 Node behavior

Each node should have:

```text
idle
hover
selected
transitioning
active
```

Example:

```text
IDLE
  ↓
HOVER
  ↓
Selected
  ↓
Camera transition
  ↓
Section
```

Transitions should feel continuous rather than like traditional page reloads.

---

# 12. Visual Design

Overall direction:

- dark
- premium
- minimal
- technical
- sophisticated
- modern
- high contrast
- restrained color palette

Avoid excessive:

- gradients
- neon
- glow
- glassmorphism
- rounded cards everywhere
- generic AI imagery

Use color strategically to distinguish domains.

Example conceptual palette:

```text
Background      near-black
Primary text    off-white
Secondary text  muted gray

AI / ML         one accent
Data            second accent
JTB             third accent
Chess           fourth accent
Experience      neutral accent
```

Do not hard-code colors into reusable components unnecessarily.

Use CSS variables/theme tokens.

---

# 13. Typography

Use a modern professional type system.

Possible:

- Geist
- Inter
- IBM Plex Sans
- Space Grotesk

Avoid overly futuristic fonts.

Typography should prioritize readability.

---

# 14. Technical Stack

## Frontend

```text
Next.js
TypeScript
React
Tailwind CSS
Framer Motion
```

Next.js App Router should be used.

---

# 14.1 3D

```text
Three.js
React Three Fiber
@react-three/drei
```

Use 3D selectively.

Do not create unnecessarily expensive geometry.

Optimize:

- geometry
- textures
- particle counts
- render resolution
- device pixel ratio
- animation loops

Use reduced-quality rendering on lower-powered/mobile devices.

---

# 14.2 Chess

Likely:

```text
chess.js
React chessboard component
Custom client-side model
```

Model format should be chosen based on the actual model implementation.

Potential deployment target:

```text
ONNX Runtime Web
```

if the trained model can be exported to ONNX.

Alternative:

TensorFlow.js or another browser-compatible runtime if more appropriate.

The final choice should be based on the actual chess model.

---

# 14.3 Backend/server functionality

Use Next.js server-side functionality for:

- JTB
- contact form
- chess reward verification
- usage tracking
- authenticated operations

Do NOT introduce FastAPI unless there is a concrete technical requirement.

---

# 14.4 Database/Auth

```text
Supabase
├── Auth
└── PostgreSQL
```

Use Row Level Security.

Users should only be able to access their own account-related data.

Server-side operations must not trust client-provided user IDs.

---

# 14.5 Hosting

Use:

**Vercel**

Repository:

**GitHub**

Deployment workflow:

```text
GitHub
   ↓
Vercel
   ↓
Preview Deployment
   ↓
Production
```

Next.js is natively supported by Vercel and Vercel provides preview/deployment workflows for Next.js projects.

---

# 15. Suggested Project Structure

```text
james-portfolio/
│
├── app/
│   ├── page.tsx
│   ├── about/
│   ├── experience/
│   ├── ai-ml/
│   ├── jtb/
│   ├── chess/
│   ├── contact/
│   ├── login/
│   ├── signup/
│   ├── account/
│   │
│   └── api/
│       ├── jtb/
│       ├── chess/
│       ├── rewards/
│       └── contact/
│
├── components/
│   ├── universe/
│   │   ├── DataUniverse.tsx
│   │   ├── UniverseScene.tsx
│   │   ├── UniverseNode.tsx
│   │   ├── DataCore.tsx
│   │   ├── ParticleField.tsx
│   │   └── CameraController.tsx
│   │
│   ├── jtb/
│   ├── chess/
│   ├── projects/
│   ├── navigation/
│   └── ui/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── jtb/
│   ├── chess/
│   ├── rewards/
│   └── validation/
│
├── content/
│   ├── jtb/
│   └── projects/
│
├── public/
│   ├── models/
│   ├── textures/
│   ├── images/
│   └── icons/
│
├── types/
│
├── supabase/
│   └── migrations/
│
└── README.md
```

---

# 16. Data Universe Component Architecture

Suggested component hierarchy:

```text
DataUniverse
│
├── UniverseScene
│   ├── Environment
│   ├── Camera
│   ├── Lighting
│   ├── ParticleField
│   ├── DataCore
│   ├── ConnectionLines
│   └── UniverseNodes
│       ├── AboutNode
│       ├── ExperienceNode
│       ├── MLNode
│       ├── JTBNode
│       └── ChessNode
│
├── UniverseOverlay
│   ├── Logo
│   ├── NodeLabel
│   ├── Instructions
│   └── Navigation
│
└── UniverseTransition
```

Keep the 3D scene modular.

Do not put all 3D logic into one huge component.

---

# 17. Performance Requirements

Performance is a first-class requirement.

Target:

- fast initial load
- minimal blocking JavaScript
- lazy-load heavy 3D components
- lazy-load chess model
- avoid loading JTB code until needed
- responsive on mobile
- graceful fallback on unsupported/low-power devices

The homepage should not download:

- chess model
- all project assets
- chatbot dependencies

until needed.

Use dynamic imports where appropriate.

---

# 18. Accessibility

The 3D experience must NOT be the only way to navigate.

Provide:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible buttons
- descriptive labels
- reduced-motion support
- accessible project cards
- text-based navigation
- screen-reader-friendly content

Respect:

```text
prefers-reduced-motion
```

If reduced motion is enabled:

- minimize camera animations
- minimize particle movement
- disable unnecessary transitions

---

# 19. SEO

Every major content page should have:

- metadata
- title
- description
- Open Graph metadata
- Twitter/X card metadata
- canonical URL
- semantic headings

The homepage should still contain crawlable textual content even though the main experience is 3D.

Do not make SEO-dependent content exist only inside WebGL.

---

# 20. Analytics

Add lightweight analytics later.

Potentially:

- Vercel Analytics
- privacy-conscious event tracking

Useful events:

```text
universe_node_clicked
jtb_started
jtb_interaction
chess_started
chess_completed
chess_won
chess_reward_claimed
project_opened
contact_clicked
```

Do not collect unnecessary personal data.

---

# 21. Security

Important requirements:

## Authentication

Never implement password hashing manually.

Use Supabase Auth.

## JTB

Never expose:

```text
LLM_API_KEY
```

to the browser.

## Credits

Never trust:

```text
credits_remaining
```

from the browser.

## Chess reward

Never trust:

```text
playerWon = true
```

from the browser.

Verify server-side.

## Database

Use Row Level Security.

## Environment variables

Keep secrets in environment variables.

Never commit:

```text
.env.local
```

or API secrets.

---

# 22. Contact

Contact section should provide:

- Email
- LinkedIn
- GitHub
- potentially resume
- simple contact form

The contact form should use a server-side route.

Do not expose email service credentials to the browser.

---

# 23. Project Content Model

Use structured project data.

Example conceptual type:

```text
Project
├── slug
├── title
├── category
├── description
├── featured
├── technologies[]
├── problem
├── approach
├── results
├── lessons
├── githubUrl
├── demoUrl
├── image
└── interactive
```

Categories:

```text
AI
ML
LLM
NLP
ENGINEERING
EXPERIMENT
```

---

# 24. Featured Projects

Homepage should feature only a small number.

Recommended hierarchy:

## Tier 1 — Flagship

1. JTB
2. James Chess AI

## Tier 2 — Major technical projects

3. Best ML project
4. Best AI/LLM project

## Tier 3 — Project library

Everything else.

This prevents the homepage from becoming a project dump.

---

# 25. User Experience Flow

Ideal visitor journey:

```text
Landing
  ↓
Data Universe
  ↓
Explore
  ↓
Discover AI / ML
  ↓
See projects
  ↓
Discover JTB
  ↓
Sign up
  ↓
10 JTB interactions
  ↓
Explore Chess
  ↓
Beat Chess AI
  ↓
+5 JTB interactions
  ↓
Explore more work
  ↓
Contact James
```

The system should never force this exact journey.

Visitors should be able to jump directly to:

- About
- Experience
- Projects
- JTB
- Chess
- Contact

---

# 26. Gamification

Keep it subtle.

The primary gamification mechanic:

```text
Beat James Chess AI
        ↓
      +5 JTB
```

Potential future mechanics:

- achievement badges
- fastest win
- difficulty progression
- chess leaderboard

Do NOT build a leaderboard in V1.

A leaderboard introduces unnecessary:

- moderation
- database complexity
- cheating concerns
- privacy considerations

---

# 27. Mobile Strategy

The mobile experience should not simply shrink the desktop experience.

On mobile:

- simplify 3D scene
- reduce particles
- reduce effects
- use tap navigation
- keep navigation accessible
- prioritize content
- load heavy components only on demand

The user should still be able to:

- access all projects
- use JTB
- play chess
- view dashboards
- contact James

---

# 28. Development Phases

## Phase 0 — Project setup

Set up:

- GitHub repository
- Next.js
- TypeScript
- Tailwind
- ESLint
- Prettier
- Vercel project
- environment variables

Deliverable:

A working deployed Next.js skeleton.

---

## Phase 1 — Design system

Build:

- typography
- colors
- spacing
- buttons
- cards
- navigation
- responsive layout
- dark theme

Deliverable:

A polished non-3D shell.

---

## Phase 2 — Data Universe prototype

Build:

- 3D scene
- camera
- lighting
- particles
- data core
- nodes
- hover states
- click states
- camera transitions

Do NOT connect real project data yet.

Deliverable:

A beautiful interactive prototype.

---

## Phase 3 — Portfolio content

Build:

- About
- Experience
- Education
- Contact
- project system
- ML project pages

Deliverable:

A complete conventional portfolio underneath the 3D layer.

---

## Phase 4 — Chess

Build:

1. Chess board
2. Legal move validation
3. Game state
4. Client-side model loading
5. Model inference
6. AI moves
7. Game termination
8. Difficulty settings
9. Loading/error states
10. Responsive UI

Deliverable:

A fully playable James Chess AI.

---

## Phase 5 — Supabase

Set up:

- Supabase project
- Auth
- profiles
- RLS
- usage tracking
- rewards

Deliverable:

Secure account system.

---

## Phase 6 — JTB

Build:

1. Chat interface
2. Auth gate
3. Credit system
4. LLM integration
5. JTB knowledge base
6. response validation
7. rate limiting
8. usage tracking
9. exhausted state

Deliverable:

Production-ready JTB.

---

## Phase 7 — Chess reward

Implement:

1. game history submission
2. server-side replay
3. win verification
4. reward validation
5. atomic credit update
6. reward confirmation UI

Deliverable:

Verified:

```text
Beat Chess AI → +5 JTB
```

---

## Phase 8 — Performance

Optimize:

- 3D
- model loading
- images
- fonts
- dashboards
- JS bundles
- mobile performance

Deliverable:

Fast production site.

---

## Phase 9 — Polish

Add:

- micro-interactions
- transitions
- sound only if genuinely useful
- loading states
- empty states
- error states
- accessibility
- reduced motion
- SEO
- analytics

Deliverable:

Production-quality portfolio.

---

# 29. V1 Scope

Do NOT overbuild V1.

V1 must contain:

```text
✓ Data Universe
✓ About
✓ Experience
✓ ML Projects
✓ JTB
✓ Authentication
✓ 10 JTB credits
✓ Chess AI
✓ Client-side chess inference
✓ +5 reward for beating Chess AI
✓ Contact
✓ Responsive design
✓ Vercel deployment
✓ Supabase
```

Do NOT require for V1:

```text
✗ Blog
✗ CMS
✗ Multiplayer chess
✗ Chess leaderboard
✗ Admin dashboard
✗ Complex agent system
✗ Separate FastAPI service
✗ Kubernetes
✗ Microservices
✗ Social login
✗ User profiles
✗ Public chat history
```

---

# 30. Future Expansion

The architecture should make these possible later:

```text
Admin Dashboard
     ↓
Manage Projects
Manage JTB Knowledge
View Analytics
View Usage
```

Potential future:

```text
JTB
 ↓
RAG
 ↓
Vector Database
 ↓
Agentic tools
```

Potential future ML demos:

```text
Model Playground
Prediction APIs
Interactive Feature Engineering
Model Comparison
Explainable AI
```

Potential future chess:

```text
Difficulty progression
Model-vs-model
Opening explorer
Evaluation graph
Game analysis
```

Potential future Data Universe nodes:

```text
RESEARCH
EXPERIMENTS
BLOG
STARTUPS
OPEN SOURCE
```

---

# 31. Design Principles

## Principle 1

**The 3D universe is the introduction, not the entire website.**

## Principle 2

**Every interactive element should have a purpose.**

No decorative 3D object should exist without a reason.

## Principle 3

**Show, don't tell.**

Instead of:

> "I know machine learning."

Let the visitor:

> interact with your ML model.

Instead of:

> "I know LLMs."

Let them:

> talk to JTB.

Instead of:

> "I built a chess model."

Let them:

> play against it.

## Principle 4

**Performance beats visual excess.**

A beautiful 3D universe that takes 10 seconds to load is a bad portfolio.

## Principle 5

**The site should still work without 3D.**

## Principle 6

**Security-sensitive state lives server-side.**

Especially:

- authentication
- credits
- rewards
- LLM API keys

## Principle 7

**Build the simplest architecture that solves the problem.**

Do not introduce infrastructure because it sounds impressive.

---

# 32. Definition of Done

The project is complete when:

### Homepage

- [ ] Data Universe loads quickly
- [ ] 3D nodes are interactive
- [ ] Nodes have meaningful visual identities
- [ ] Camera transitions are smooth
- [ ] Mobile experience works
- [ ] Reduced-motion mode works
- [ ] Non-WebGL fallback works

### Portfolio

- [ ] About exists
- [ ] Experience exists
- [ ] Education exists
- [ ] ML projects exist
- [ ] Contact exists

### Chess

- [ ] Chess board works
- [ ] Legal moves are enforced
- [ ] James Chess AI loads client-side
- [ ] AI makes legal moves
- [ ] Game termination works
- [ ] Model loading states work
- [ ] Mobile works
- [ ] Completed games can be verified server-side
- [ ] Winning awards +5 JTB credits
- [ ] Reward cannot be claimed repeatedly

### JTB

- [ ] Authentication required
- [ ] Signup works
- [ ] Login works
- [ ] Employment status captured
- [ ] New users receive 10 interactions
- [ ] Credits are server-controlled
- [ ] Successful interaction deducts one credit
- [ ] Failed requests do not deduct credits
- [ ] JTB is grounded in approved information
- [ ] API key never reaches browser
- [ ] Rate limiting exists
- [ ] Exhausted state exists
- [ ] Chess reward works
- [ ] Contact CTA works

### Security

- [ ] Supabase RLS configured
- [ ] No secrets committed
- [ ] No client-trusted credits
- [ ] No client-trusted chess rewards
- [ ] Server-side authentication checks
- [ ] Server-side input validation

### Deployment

- [ ] GitHub repository
- [ ] Vercel deployment
- [ ] Production domain
- [ ] Environment variables configured
- [ ] Production build passes
- [ ] Mobile tested
- [ ] Desktop tested
- [ ] Major browsers tested

---

# 33. Claude Code Instructions

You are implementing this project as a production-quality personal portfolio.

Before writing substantial code:

1. Inspect the existing repository.
2. Understand the current architecture.
3. Do not overwrite existing functionality without checking it first.
4. Maintain a clear component architecture.
5. Prefer small reusable components.
6. Do not create unnecessary abstractions.
7. Do not add dependencies unless they solve a concrete requirement.
8. Use current stable APIs and patterns.
9. Keep secrets out of source code.
10. Use environment variables.
11. Validate all server-side inputs.
12. Never trust client-side credits.
13. Never trust client-side chess reward claims.
14. Optimize the 3D experience aggressively.
15. Keep the site accessible without WebGL.
16. Implement responsive behavior from the beginning.
17. Use TypeScript strictly.
18. Avoid `any` unless genuinely necessary.
19. Add error and loading states.
20. Do not fabricate portfolio content or achievements.

When a design choice is ambiguous:

> Prefer the simplest implementation that preserves the intended UX.

When a feature is technically expensive:

> Prototype the UX first before committing to the architecture.

---

# 34. Development Priority

Build in this exact order:

```text
1. Project skeleton
        ↓
2. Design system
        ↓
3. Conventional portfolio pages
        ↓
4. Data Universe prototype
        ↓
5. Data Universe → portfolio navigation
        ↓
6. ML project system
        ↓
7. Chess UI
        ↓
8. Client-side chess model
        ↓
9. Supabase Auth
        ↓
10. JTB
        ↓
11. Credit system
        ↓
12. Chess reward verification
        ↓
13. Performance
        ↓
14. Accessibility
        ↓
15. SEO
        ↓
16. Analytics
        ↓
17. Final visual polish
        ↓
18. Production deployment
```

Do not attempt to build every system simultaneously.

The first milestone should be:

> **A beautiful Data Universe that can navigate to placeholder portfolio sections.**

Once that works, progressively connect the real projects and interactive systems.

---

# 35. Final Product Vision

The finished website should feel less like:

> "Here is my resume."

and more like:

> **"Enter James's Data Universe."**

The visitor should be able to explore:

```text
                     JAMES
                       │
          ┌────────────┴────────────┐
          │                         │
        AI / ML              EXPERIENCE
          │                         │
      ┌───┴───┐                     │
      │       │                     │
     JTB    CHESS                  CBA
      │       │
      └───┬───┘
          │
      INTERACT
          │
       EXPLORE
          │
       CONNECT
```

The key differentiator is that **the portfolio itself demonstrates the skills it claims James possesses**.

The site should communicate:

> **Data Scientist. AI Builder. Machine Learning Engineer. Visual Storyteller.**

without relying solely on those labels.

The visitor should be able to experience the work directly.