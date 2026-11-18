# Runbook: demo day

Setup, commands and troubleshooting are in the main [runbook](runbook.md). Public pages only: no Vodafone account is signed in to at any point (owner's instruction, 2026-10-23).

## T−1 day

1. Sync and check: `npm run sync -- --site vodafone-eg --origin web --dry-run`, read the report, then run it without `--dry-run` (runbook §5.1). Expect every gate check to pass. Then `npm run kb -- --site vodafone-eg --status`.
2. Microphone and live-site check on the demo Mac (runbook §3): the terminal says `Browser: Google Chrome`; words appear one by one; the cheapest-bundle request works on the live site.
3. Rehearse the [demo script](../product/demo-script.md) twice on the demo machine with the X-ray open.
4. Run the offline fallback once with the network unplugged: `npm run demo:live -- --replay` (speech recognition needs the network; type the requests if it is down).
5. Charge everything; pack the wired network adapter and the microphone.

## T−60 minutes

| Step | Command or action | Expected |
|---|---|---|
| Gateway | started by `npm run demo:live` (below); `curl http://127.0.0.1:4400/health` | `"ok":true` |
| Knowledge base | `npm run kb -- --site vodafone-eg --status`, or the committed default | the version you checked at T−1 |
| Demo browser | `npm run demo:live -- --kiosk --xray button` (add `--store postgres` if you activated a synced version) | `Browser: Google Chrome`; Vodafone home with the red microphone above the accessibility button |
| Cookie banner | Answer it in the demo browser (reject non-essential) | Banner gone |
| Microphone | Press, say "تجربة واحد اتنين", press | Words one by one; wave moves with the voice |
| Sound | Ask "إيه اللي في الصفحة دي؟" | Spoken answer audible in the room |
| Second screen | X-ray open on the presenter's screen if available | Turns appear |

## During the demo

- Speak at a normal pace, facing the microphone; press once to start and once to finish if the room is noisy.
- If a request is misheard, press and repeat. Never explain the bug on stage; use the fallback line in the script.
- Moment 7's notification is shown on the clone (`npm run dev -- --site vodafone-clone` in a second terminal), as the script says.

## The page watch

- Before the demo, open the album on a Vodafone page with nothing pocketed and press "Watch two example cards", or open any Vodafone page with `?aixc-watch=fill`.
- On the saved pages both stickers say "Watching · No change since 23 Oct".
- To reset between runs, `window.__aixcWatch.reset()` in the console. Never edit the 23 Oct fixture.
- Details: runbook section 3f.

## Fallbacks

| Problem | Do |
|---|---|
| Internet down | Close the demo browser; `npm run demo:live -- --replay`; type moments 1, 2, 4 and 8 in the panel (speech recognition needs the network); say so |
| Gateway error | Restart the gateway on the host; refresh the page; the session resumes |
| Microphone fails | Keyboard button → type the request |
| Bot challenge page | Do not retry. Switch to `--replay` and say so |
| Target missing on a page | The guide falls back or says it couldn't find it; continue to the next moment |

## After the demo

- Save the traces: `psql $DATABASE_URL -c "\copy (select * from trace_events where at > now() - interval '3 hours') to 'demo-traces.csv' csv header"`.
- Note every miss in `docs/handoff/HANDOFF.md` §8 and add misheard or misrouted requests to the evaluation set.
- If the machine is shared, delete `voice-guide/data/demo-profile` (cookie answers and permissions).
