// a message typed while the agent was still working, held until its turn ends
export type Queued = { text: string; to: string | null } // to: null = start a new chat session

export type Drain = {
  next: Queued | null // send this one now
  rest: Queued[] // keep waiting for the turn `next` starts
  restore: string[] // hand these back to the input, unsent
}

// What a turn's end does with the queue: a clean end sends the oldest message, a failed one (crash
// or an error answer) gives them all back to the input. A queued "new session" was typed while that
// new session was starting: it goes to the session that just answered, not to yet another new chat
export const drainQueue = (queue: Queued[], failed: boolean, sessionId: string | null): Drain => {
  if (queue.length === 0) return { next: null, rest: [], restore: [] }
  if (failed) return { next: null, rest: [], restore: queue.map((q) => q.text) }
  const [first, ...rest] = queue
  return { next: { text: first.text, to: first.to ?? sessionId }, rest, restore: [] }
}
