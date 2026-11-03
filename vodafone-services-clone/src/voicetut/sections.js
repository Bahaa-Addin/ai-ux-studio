// Read captured page copy, excluding links, CTA labels, and the speech controls.
export function sectionSpeech(section) {
  const lines = [section.title, section.description]
  for (const item of section.items) {
    if (item.title !== section.title) lines.push(item.title)
    lines.push(item.description)
  }
  return lines.filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).join('\n\n')
}

export function mountSectionReaders(root, sections, onRead) {
  if (!root) return []
  const readers = []
  for (const section of sections) {
    const element = [...root.querySelectorAll('[data-aixc-section]')]
      .find(node => node.dataset.aixcSection === section.id)
    const heading = element?.querySelector('h2')
    if (!heading) continue

    const controls = document.createElement('div')
    controls.className = 'vt-section-controls'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vt-section-read'
    button.setAttribute('aria-controls', 'vt-text')
    const message = document.createElement('span')
    message.className = 'vt-section-status'
    message.id = `vt-section-status-${section.id}`
    message.setAttribute('role', 'status')
    message.setAttribute('aria-live', 'polite')
    button.setAttribute('aria-describedby', message.id)
    controls.append(button, message)
    heading.parentElement.append(controls)

    const reader = {
      title: section.title,
      text: sectionSpeech(section),
      button,
      setState(label = 'Read this section', detail = '') {
        button.textContent = label
        button.setAttribute('aria-label', `${label}: ${section.title}`)
        button.setAttribute('aria-busy', String(label === 'Generating…'))
        message.textContent = detail
      },
    }
    reader.setState()
    button.addEventListener('click', () => onRead(reader))
    readers.push(reader)
  }
  return readers
}
