import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { checkList, ciChecks } from '../lib/prboard'
import { ChecksBox } from './ChecksBox'
import { CiFailBadge } from './CiFailBadge'
import { TipProvider } from './Tip'

// The same red build, shown on the card (badge) and in its panel (checks box): both must read 4/5
const rollup = [
  { name: 'lint', conclusion: 'SUCCESS' },
  { name: 'unit', conclusion: 'SUCCESS' },
  { name: 'build', conclusion: 'SUCCESS' },
  { name: 'detekt', conclusion: 'SUCCESS' },
  { name: 'e2e', conclusion: 'FAILURE' },
  { name: 'bugbot', conclusion: 'NEUTRAL' },
]

const render = (node: React.ReactNode) => renderToStaticMarkup(<TipProvider>{node}</TipProvider>)

describe('CI count — uniform on the card and in the panel', () => {
  it('shows passed / ran on the card badge', () => {
    expect(render(<CiFailBadge checks={ciChecks(rollup)} />)).toContain('✗ CI 4/5')
  })

  it('shows passed / ran in the panel checks box', () => {
    expect(render(<ChecksBox checks={checkList(rollup)} expanded={false} />)).toContain(
      'Merge conditions are failing (4/5)',
    )
  })
})
