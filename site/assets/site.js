const menuButton = document.querySelector('[data-menu-button]')
const menu = document.querySelector('[data-menu]')

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true'
  menuButton.setAttribute('aria-expanded', String(!open))
  menu?.toggleAttribute('data-open', !open)
})

document.querySelectorAll('[data-menu] a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false')
    menu?.removeAttribute('data-open')
  })
})

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copyTarget)
    if (!target) return
    const text = target.textContent.trim()
    try {
      await navigator.clipboard.writeText(text)
      const original = button.textContent
      button.textContent = 'Copied'
      window.setTimeout(() => { button.textContent = original }, 1600)
    } catch {
      button.textContent = 'Select and copy'
      const range = document.createRange()
      range.selectNodeContents(target)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
  })
})

const docsSearch = document.querySelector('[data-docs-search]')
const docsLinks = [...document.querySelectorAll('[data-docs-link]')]
docsSearch?.addEventListener('input', () => {
  const query = docsSearch.value.trim().toLocaleLowerCase()
  docsLinks.forEach((link) => {
    const matches = !query || link.textContent.toLocaleLowerCase().includes(query)
    link.hidden = !matches
  })
})

const sections = [...document.querySelectorAll('.docs-content section[id]')]
const sectionLinks = new Map(docsLinks.map((link) => [link.getAttribute('href')?.slice(1), link]))
if ('IntersectionObserver' in window && sections.length) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
    if (!visible) return
    docsLinks.forEach((link) => link.removeAttribute('aria-current'))
    sectionLinks.get(visible.target.id)?.setAttribute('aria-current', 'location')
  }, { rootMargin: '-15% 0px -70%', threshold: [0, 0.25, 0.6] })
  sections.forEach((section) => observer.observe(section))
}

document.querySelectorAll('[data-current-year]').forEach((element) => {
  element.textContent = String(new Date().getFullYear())
})
