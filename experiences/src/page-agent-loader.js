/**
 * Official Page Agent quick-start demo, off unless asked for: ?demo=page-agent (English) or
 * ?agentLang=ar (Arabic). Technical evaluation only: prompts and page content go to the upstream
 * testing LLM, and its controls sit over the Reimagine launcher, so the page never loads it by itself.
 * https://github.com/alibaba/page-agent#-quick-start
 */
const params = new URL(location.href).searchParams

if (params.get('demo') === 'page-agent' || params.has('agentLang')) {
  await new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/page-agent@1.12.4/dist/iife/page-agent.demo.js?autoInit=false'
    script.crossOrigin = 'anonymous'
    // page-agent-demo.js reports a failed load itself (window.PageAgent stays unset).
    script.onload = script.onerror = resolve
    document.head.append(script)
  })
  await import('./page-agent-demo.js')
}
