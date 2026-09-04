import { run } from './main'
import { isSupportedNode, MIN_NODE } from './nodeversion'

// Checked before anything reaches node:sqlite (src/cli/db.ts requires it lazily for this reason):
// an unsupported Node would otherwise abort with ERR_UNKNOWN_BUILTIN_MODULE, which says nothing
// about what to install.
if (!isSupportedNode(process.versions.node)) {
  console.error(`lookout needs Node ${MIN_NODE} — found v${process.versions.node}`)
  process.exit(1)
}

// node:sqlite is still behind an ExperimentalWarning; skills capture stderr, so keep it out of
// their output while letting every other warning through.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.error(w.message)
})

process.exitCode = run(process.argv.slice(2))
