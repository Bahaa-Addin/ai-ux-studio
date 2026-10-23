# Runbook: demo day

## T−1 day

1. Sync and check: `npm run sync -- --site vodafone-eg --full`, then `npm run kb -- --site vodafone-eg --status` (activated, 0 errors). Read the diff in the report for anything on the demo pages.
2. Rehearse the [demo script](../product/demo-script.md) twice on the demo machine with the X-ray open.
3. Run the offline fallback once with the network unplugged: `npm run dev -- --site vodafone-clone`.
4. Charge everything; pack the wired network adapter and the microphone.

## T−60 minutes

| Step | Command or action | Expected |
|---|---|---|
| Gateway | `curl https://<gateway>/health` | `ok`, store `postgres`, agent `on` |
| Sync | `npm run sync -- --site vodafone-eg` | activated or unchanged |
| Demo browser | `npm run demo:browser -- --start https://web.vodafone.com.eg/ar/home --kiosk --xray button` | Vodafone home with the red microphone above the accessibility button |
| Cookie banner | Answer it in the demo browser (reject non-essential) | Banner gone |
| Demo account | Sign in on `/spa/myHome`, then go back to `/ar/home` | Signed in |
| Microphone | Press, say "تجربة واحد اتنين", press | Words one by one; wave moves with the voice |
| Sound | Ask "إيه اللي في الصفحة دي؟" | Spoken answer audible in the room |
| Second screen | X-ray open on the presenter's screen if available | Turns appear |

## During the demo

- Speak at a normal pace, facing the microphone; press once to start and once to finish if the room is noisy.
- If a request is misheard, press and repeat. Never explain the bug on stage; use the fallback line in the script.
- Keep the second tab with the clone ready for moment 7.

## Fallbacks

| Problem | Do |
|---|---|
| Internet down | Switch to the clone tab (`vodafone-clone`); run moments 1, 4, 8 there; say so |
| Gateway error | Restart the gateway on the host; refresh the page; the session resumes |
| Microphone fails | Keyboard button → type the request |
| Bot challenge page | Solve it yourself in the demo browser, then continue |
| Target missing on a page | The guide falls back or says it couldn't find it; continue to the next moment |

## After the demo

- Save the traces: `psql $DATABASE_URL -c "\copy (select * from trace_events where at > now() - interval '3 hours') to 'demo-traces.csv' csv header"`.
- Note every miss in `docs/handoff/HANDOFF.md` §8 and add misheard or misrouted requests to the evaluation set.
- Sign the demo account out and clear the demo profile's site data if the machine is shared.
