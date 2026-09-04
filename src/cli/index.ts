import { run } from './main'

// node:sqlite is still behind an ExperimentalWarning; skills capture stderr, so keep it out of
// their output while letting every other warning through.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.error(w.message)
})

process.exitCode = run(process.argv.slice(2))
