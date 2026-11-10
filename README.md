# ai-ux-studio

Experiments in AI-composed user experiences.

- [`experiences/`](experiences/README.md) — **AI Experience Composer (AIXC), Phase 1**:
  a local Vodafone Egypt Services page whose main content can be recomposed as an editorial
  magazine from a natural-language prompt (Gemini), without changing the content or the site shell.
  **Pocket** (same page): peel any service off like a sticker, keep it in a pocket that peeks from
  the corner, and turn the page (Apple Books style) to see everything you kept.
  **Your RED world** (same page): at the end of the Pocket a Dock of categories rises; press an
  icon or pull it up and the page is pushed aside by a personal benefits layer beneath it, with a
  live status widget, a spotlight that shows one topic at a time, and a rules engine that ranks
  the topics per customer.
- [`voice-guide/`](voice-guide/README.md) — **Voice guide**: a voice-first guide that takes people to the
  answer on the real Vodafone Egypt website (navigate, open tabs, spotlight, read live values), keeps one
  conversation across the CMS pages, the `/spa/` app and the shop, and keeps its site knowledge in step with
  the live site. Agent setup and the current brief: [`voice-guide/AGENTS.md`](voice-guide/AGENTS.md),
  [`voice-guide/docs/prompts/vodafone-live-demo.prompt.md`](voice-guide/docs/prompts/vodafone-live-demo.prompt.md).
