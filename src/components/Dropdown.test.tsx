import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dropdown } from './Dropdown'
import { TipProvider } from './Tip'

const options = [
  { value: 'a', label: 'Alpha', icon: 'eye' as const },
  { value: 'b', label: 'Beta', icon: 'check-circle' as const },
]

const render = (value: string) =>
  renderToStaticMarkup(
    <TipProvider>
      <Dropdown value={value} options={options} onChange={() => {}} label="Pick one" />
    </TipProvider>,
  )

describe('Dropdown', () => {
  it('shows the selected option on its closed button', () => {
    const html = render('b')
    expect(html).toContain('Beta')
    expect(html).not.toContain('Alpha')
    expect(html).toContain('aria-expanded="false"')
  })
})
