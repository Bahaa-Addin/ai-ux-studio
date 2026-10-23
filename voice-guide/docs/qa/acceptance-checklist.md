# Acceptance checklist: go / no-go for the live demo

Tick each line with the date and initials. Any unticked line in **Must** is a no-go.

## Must

### Brand (R1)
- [ ] Microphone, bar, panel, bubble, spotlight, toasts match SPEC-01 on `/en/home`, `/ar/home`, `/spa/storeLocator`, the shop
- [ ] No guide text in Times or any non-Vodafone face (spot-check in DevTools)
- [ ] Vodafone brand review signed off (T-603)

### Real pages and continuity (R2)
- [ ] Demo browser opens any seed page with the microphone visible
- [ ] "What's on this page?" correct on five random seed pages, both languages
- [ ] Moment 1 → 2 crosses CMS → SPA with the same conversation
- [ ] Moment 3 changes SPA route without the guide flickering
- [ ] Moment 5 reaches the shop with the same session
- [ ] Accessibility button and OneTrust banner fully visible and usable throughout
- [ ] Guide never pressed a commit button in any rehearsal (check `sdk.step` traces for commit-guard events)

### Live knowledge (R3)
- [ ] Last sync ≤ 2 hours before the demo, activated, 0 integrity errors
- [ ] Router tuning set ≥ 95%; held-out score recorded
- [ ] Rollback tested once (`npm run kb -- --rollback`)

### Voice (R4)
- [ ] Words appear one by one in the black bar for Arabic and English
- [ ] Waveform and halo follow the presenter's voice on the demo microphone
- [ ] First word p50 ≤ 1.0s in the last rehearsal (X-ray)
- [ ] "خلاص" and a press during speech both stop the guide at once
- [ ] Typing fallback opens from the keyboard button

### Operations
- [ ] Public HTTPS gateway healthy (`/health`), secrets set, not the dev defaults
- [ ] Offline fallback (`vodafone-clone`) rehearsed once with the network off
- [ ] Runbook dry run done by the person presenting

## Should
- [ ] Jev or Laya decider beats `local` on the held-out set and is switched on
- [ ] Vision descriptions for all hero banners in scope
- [ ] Recording of a clean rehearsal saved
