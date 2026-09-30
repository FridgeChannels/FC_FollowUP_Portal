/** Task line already has a Task, or this call is already hanging on one. */
export function shouldResolveOpenPhoneTask(input: {
  hasTask: boolean;
  existingTaskId?: string | null;
}) {
  return !input.hasTask && !input.existingTaskId;
}
