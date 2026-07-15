// Fill a command template's placeholders. Shared by every dispatch (do-review, do-followup, handle-review).
export const fillPrompt = (template: string, branch: string, prNumber: number): string =>
  template.replaceAll('<branch_name>', branch).replaceAll('<pr_id>', String(prNumber))
