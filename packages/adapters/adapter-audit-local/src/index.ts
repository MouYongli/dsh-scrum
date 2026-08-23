import {
  appendActivity,
  listActivityMonths,
  readActivity,
  workspaceLayout,
  type ActivityRecord,
} from '@dsh-scrum/adapter-storage-workspace-files'
import type {
  ActivityEvent,
  ActivityHistory,
  ActivityLog,
  ActivityWindow,
} from '@dsh-scrum/scrum-application'

/**
 * Community's audit trail: one line appended to a monthly file in the
 * workspace, and read back from the same files.
 *
 * Local because there is nowhere else. The record is the same shape the
 * application describes, so an edition that ships it to a service records the
 * same event; only where it lands differs.
 */
export function createLocalActivityLog(workspaceRoot: string): ActivityLog {
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
    read: async (window: ActivityWindow): Promise<ActivityHistory> => {
      const events: ActivityEvent[] = []
      const problems: string[] = []
      // Newest month first, and stop as soon as the window is full: a project
      // with three years of history must not read three years of files to
      // answer what happened this week.
      const months = [...(await listActivityMonths(layout))].reverse()
      // A month file is named for the instants inside it, so a window that
      // starts in September cannot be answered by August's file.
      const earliest = window.since?.slice(0, 'yyyy-mm'.length)
      for (const month of months) {
        if (events.length >= window.limit || (earliest !== undefined && month < earliest)) {
          break
        }
        const page = await readActivity(layout, month)
        problems.push(...page.problems.map((problem) => problem.message))
        for (const record of page.records) {
          if (window.since === undefined || record.at >= window.since) {
            events.push(record)
          }
        }
      }
      // Sorted rather than assumed: a file is appended in write order, and a
      // clock that stepped back would otherwise put an older record on top.
      events.sort((left, right) => right.at.localeCompare(left.at))
      return { events: events.slice(0, window.limit), problems }
    },
  }
}
