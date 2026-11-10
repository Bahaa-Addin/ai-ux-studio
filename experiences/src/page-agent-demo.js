// Same upstream demo model; manual initialization enables language selection.
const arabic = new URL(location.href).searchParams.get('agentLang') === 'ar'
const controls = document.createElement('aside')
controls.className = 'agent-language'
controls.setAttribute('aria-label', 'Page Agent language')
controls.innerHTML = `<label>Agent language / لغة المساعد
  <select aria-label="Agent language"><option value="en">English</option><option value="ar">العربية</option></select>
</label><small>${arabic ? 'تغيير اللغة يبدأ جلسة جديدة' : 'Changing language starts a fresh session'}</small>`
document.body.append(controls)
const select = controls.querySelector('select')
select.value = arabic ? 'ar' : 'en'
select.addEventListener('change', () => {
  const url = new URL(location.href)
  url.searchParams.set('agentLang', select.value)
  location.assign(url)
})

const style = document.createElement('style')
style.textContent = `
  .agent-language { position:fixed; top:130px; right:16px; z-index:2147483646;
    background:white; color:#222; border:1px solid #ddd; border-radius:12px;
    padding:10px 14px; box-shadow:0 4px 20px #0002; font:14px system-ui; }
  .agent-language label { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .agent-language select { padding:5px; font:inherit; }
  .agent-language small { display:block; margin-top:5px; color:#666; }
  .arabic-agent { position:fixed; bottom:16px; right:16px; z-index:2147483646;
    width:min(410px,calc(100vw - 32px)); box-sizing:border-box; padding:18px;
    border:1px solid #ddd; border-radius:16px; background:white; color:#222;
    box-shadow:0 8px 32px #0003; font:16px/1.6 system-ui; }
  .arabic-agent h2 { margin:0 0 6px; font-size:20px; }
  .arabic-agent p { margin:4px 0 12px; font-size:13px; }
  .arabic-agent textarea { width:100%; box-sizing:border-box; min-height:88px; padding:10px;
    border:1px solid #aaa; border-radius:8px; font:inherit; resize:vertical; }
  .arabic-agent button { padding:8px 18px; margin:8px 0 0 8px; border:0; border-radius:8px;
    font:inherit; cursor:pointer; background:#e60000; color:white; }
  .arabic-agent button:disabled { opacity:.5; cursor:default; }
  .arabic-agent output { display:block; max-height:180px; overflow:auto; white-space:pre-wrap; }
  @media(max-width:480px) { .agent-language { top:110px; left:16px; } }
`
document.head.append(style)

if (!window.PageAgent) {
  const error = document.createElement('p')
  error.textContent = arabic ? 'تعذر تحميل المساعد. تحقق من اتصال الإنترنت وأعد تحميل الصفحة.' : 'Page Agent could not load. Check your connection and reload.'
  controls.append(error)
} else {
  const agent = window.pageAgent = new window.PageAgent({
    model: 'qwen3.5-plus',
    baseURL: 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
    apiKey: 'NA',
    language: 'en-US', // Upstream 1.12.4 supports only en-US and zh-CN UI locales.
    instructions: { system: arabic
      ? 'Understand Arabic user commands. Write all user-facing answers and questions in Arabic. Keep service names as published. Do not interact with the agent-language or arabic-agent controls; they belong to your own interface.'
      : 'Respond in English. Do not interact with the agent-language controls; they belong to your own interface.' },
  })
  if (!arabic) {
    agent.panel.show()
  } else {
    agent.panel.hide()
    const panel = document.createElement('form')
    panel.className = 'arabic-agent'
    panel.lang = 'ar'
    panel.dir = 'rtl'
    panel.innerHTML = `<h2>مساعد الصفحة</h2>
      <p>اكتب طلبك بالعربية. يستخدم هذا العرض خدمة الذكاء الاصطناعي التجريبية.</p>
      <label for="arabic-task">ماذا تريد أن تفعل؟</label>
      <textarea id="arabic-task" required maxlength="1000" placeholder="انتقل إلى خدمات شكراً واضغط السهم التالي مرة واحدة"></textarea>
      <button type="submit">تنفيذ</button><button type="button" disabled>إيقاف</button>
      <output role="status" aria-live="polite">جاهز</output>`
    document.body.append(panel)
    const input = panel.querySelector('textarea')
    const submit = panel.querySelector('[type=submit]')
    const stop = panel.querySelector('[type=button]')
    const output = panel.querySelector('output')
    stop.addEventListener('click', () => { void agent.stop() })
    panel.addEventListener('submit', async event => {
      event.preventDefault()
      const task = input.value.trim()
      if (!task || agent.status === 'running') return
      submit.disabled = true
      stop.disabled = false
      input.disabled = true
      select.disabled = true
      output.textContent = 'جارٍ تنفيذ طلبك…'
      try {
        const result = await agent.execute(task)
        output.textContent = agent.status === 'stopped' ? 'تم إيقاف المهمة.'
          : result.success ? result.data : 'تعذر إكمال المهمة. حاول مرة أخرى.\n' + result.data
      } catch (error) {
        output.textContent = 'تعذر إكمال المهمة. تحقق من الاتصال وحاول مرة أخرى.'
        console.error(error)
      } finally {
        submit.disabled = false
        stop.disabled = true
        input.disabled = false
        select.disabled = false
      }
    })
  }
}
