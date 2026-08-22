import {
  appendActivity,
  workspaceLayout,
  type ActivityRecord,
} from '@dsh-scrum/adapter-storage-workspace-files'
import type { ActivityEvent, ActivityRecorder } from '@dsh-scrum/scrum-application'

/**
 * Community's audit trail: one line appended to a monthly file in the
 * workspace.
 *
 * Local because there is nowhere else. The record is the same shape the
 * application describes, so an edition that ships it to a service records the
 * same event; only where it lands differs.
 */
export function createLocalActivityRecorder(workspaceRoot: string): ActivityRecorder {
  const layout = workspaceLayout(workspaceRoot)
  return {
    record: async (event: ActivityEvent) => {
      const record: ActivityRecord = {
        at: event.at,
        actorId: event.actorId,
        source: event.source,
        sessionId: event.sessionId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        revision: event.revision,
      }
      await appendActivity(layout, record)
    },
  }
}
