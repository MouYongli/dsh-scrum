/**
 * Interface copy, in the two languages the plugin ships.
 *
 * Product text is Chinese; the English entries exist because the Harness
 * locale service expects a namespace to answer in whatever language the shell
 * is running in, and a missing entry falls back to the key, which is worse
 * than an untranslated sentence.
 *
 * Nothing here is assembled from fragments. A sentence built by concatenating
 * translated pieces reads as a sentence in exactly one language.
 */
export const SCRUM_NAMESPACE = 'scrum'

export type Locale = 'zh' | 'en'

export const SCRUM_MESSAGES = {
  zh: {
    'entry.label': 'Scrum',
    'entry.open': '打开 Scrum 工作台',
    'workbench.title': 'Scrum',
    'workbench.close': '关闭',
    'state.noWorkspace.title': '请先选择一个代码工作区',
    'state.noWorkspace.body': 'Scrum 项目保存在工作区目录中，需要先选择工作区才能使用。',
    'state.unbound.title': '此工作区尚未启用 Scrum 项目管理',
    'state.unbound.body': '创建一个新的 Scrum 项目，数据会保存在该工作区的 .scrum 目录中。',
    'state.unbound.create': '创建新的 Scrum 项目',
    'state.bound.title': '项目已就绪',
    'state.bound.body': '概览、Backlog 与 Sprint 看板将在后续版本接入此工作台。',
    'state.archived.title': '项目已归档',
    'state.archived.body': '归档项目只能查看，恢复后才能继续编辑。',
    'state.stale.title': '绑定已失效',
    'state.stale.body': '此工作区绑定的 Scrum 项目已不存在，可以解除绑定后重新创建。',
    'state.moved.notice': '此工作区的位置与绑定时不同，请确认这是同一个目录。',
    'wizard.title': '创建 Scrum 项目',
    'wizard.name': '项目名称',
    'wizard.key': '项目标识',
    'wizard.keyHint': '用作工作项编号前缀，例如 SCR-12。',
    'wizard.description': '项目描述',
    'wizard.submit': '创建项目',
    'wizard.cancel': '取消',
    'wizard.creating': '正在创建……',
    'error.title': '操作未完成',
    'error.notConnected': '此 Shell 没有把 Scrum 接到工作区，暂时无法读取数据。',
    'type.epic': '史诗',
    'type.story': '故事',
    'type.task': '任务',
    'type.bug': '缺陷',
    'priority.critical': '最高',
    'priority.high': '高',
    'priority.medium': '中',
    'priority.low': '低',
  },
  en: {
    'entry.label': 'Scrum',
    'entry.open': 'Open the Scrum workbench',
    'workbench.title': 'Scrum',
    'workbench.close': 'Close',
    'state.noWorkspace.title': 'Select a code workspace first',
    'state.noWorkspace.body':
      'A Scrum project lives in a workspace directory, so one has to be open.',
    'state.unbound.title': 'This workspace has no Scrum project yet',
    'state.unbound.body': 'Create one, and its data is stored in the .scrum directory here.',
    'state.unbound.create': 'Create a Scrum project',
    'state.bound.title': 'The project is ready',
    'state.bound.body':
      'The overview, the backlog and the sprint board arrive in this workbench next.',
    'state.archived.title': 'This project is archived',
    'state.archived.body': 'An archived project is read-only until it is restored.',
    'state.stale.title': 'This binding no longer resolves',
    'state.stale.body':
      'The project this workspace was attached to is gone. Detach and create a new one.',
    'state.moved.notice':
      'This workspace is not where it was when it was attached. Check that it is the same directory.',
    'wizard.title': 'Create a Scrum project',
    'wizard.name': 'Project name',
    'wizard.key': 'Project key',
    'wizard.keyHint': 'Used as the work item prefix, such as SCR-12.',
    'wizard.description': 'Description',
    'wizard.submit': 'Create project',
    'wizard.cancel': 'Cancel',
    'wizard.creating': 'Creating…',
    'error.title': 'That did not go through',
    'error.notConnected':
      'This shell did not connect Scrum to a workspace, so there is nothing to read.',
    'type.epic': 'Epic',
    'type.story': 'Story',
    'type.task': 'Task',
    'type.bug': 'Bug',
    'priority.critical': 'Critical',
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',
  },
} as const satisfies Record<Locale, Record<string, string>>

export type MessageKey = keyof (typeof SCRUM_MESSAGES)['zh']

export const MESSAGE_KEYS: readonly MessageKey[] = Object.keys(
  SCRUM_MESSAGES.zh,
) as readonly MessageKey[]

/** How a component reads its text. The shell's locale service satisfies it. */
export type Translate = (key: MessageKey) => string

/**
 * A translator over the shipped dictionary, for a shell that has no locale
 * service and for tests. Chinese is the fallback, because the product's
 * interface language is Chinese and an English shell missing an entry should
 * still show something a user can act on.
 */
export function createTranslate(locale: Locale = 'zh'): Translate {
  const dictionary = SCRUM_MESSAGES[locale]
  return (key) => dictionary[key] ?? SCRUM_MESSAGES.zh[key]
}
