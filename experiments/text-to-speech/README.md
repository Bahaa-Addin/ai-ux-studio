# Text to Speech × Vodafone Services — raw demo

The branch now also includes a [VoiceTut Arabic–English experiment](../voicetut/README.md), available directly on the same page without an extension. The original extension below is retained for comparison.

Branch: `experiment/text-to-speech`. Based on `fc52fe2` of `Bahaa-Addin/ai-ux-studio`.

The [upstream README](https://github.com/BuildChromeExtensions/textToSpeech) describes a Chrome extension with popup speech controls and a selection context menu; it does **not** contain a quick-start guide. The steps below are local setup instructions based on its Manifest V3 extension, not a claimed upstream guide.

`extension/` contains the unchanged runtime files, README, and GPL-3.0 license from upstream commit `15b2e5afcb6cc6c5a17d97386de0648244120ca4`. The README's screenshot images are omitted. No substitute browser speech API or custom integration is used. The existing AIXC launcher is disabled on this branch to isolate the demo.

## Run

From this branch's root, with Node 18+:

```sh
cd vodafone-services-clone
node scripts/serve.mjs --port 5181
```

1. Open Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked**.
2. Select this branch's `experiments/text-to-speech/extension` folder (the folder containing `manifest.json`).
3. Open http://127.0.0.1:5181/ in that same Chrome profile.
4. Select a service description, right-click the selection and choose **Read**.
5. Open the **Text to Speech** extension popup to paste text, choose an available voice, and try rate, pitch, volume, pause, resume, and stop.

The extension requests only the upstream `tts` and `contextMenus` permissions. It needs Chrome extension APIs, so embedding its scripts directly in the webpage will not work. Available voices and audible output depend on the browser/OS setup; confirm audio on the demo machine. The popup's language is hard-coded upstream to `en-US`.

## Demo checklist

- Read a selected Vodafone Cash description and compare spoken words with the selection.
- Paste the same text in the popup, select a voice, submit, pause/resume and stop.
- Try another rate and a longer paragraph. Note voice availability, pronunciation and whether controls work.

Disable/remove the extension when done. Return to the base branch to restore the AIXC launcher.

## Verified on 2026-10-24

- Loaded the unchanged extension in an isolated Chromium profile; its background service worker started.
- The local Vodafone Services page rendered, and the extension popup populated OS voices (including Samantha).
- Submitted the exact Vodafone Cash description through the popup's Speak button. Chrome emitted speech `start` and `word` events without errors.
- Audible output quality and the native right-click menu still need a human check. Popup playback was tested; pause/resume and selection-menu playback were not automated.
- The upstream popup limits typed text to 200 characters and duplicates voice names in option labels; both are retained unchanged for raw experimentation.
