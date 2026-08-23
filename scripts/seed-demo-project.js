#!/usr/bin/env node
/**
 * Fills a Harness workspace with a demo Scrum project.
 *
 *   node scripts/seed-demo-project.js <workspace-path>
 *
 * Every write goes through `ScrumHostApi`, which is the same door the
 * interface and the agent tools use. A script that wrote `.scrum/` files
 * directly would be a second way into the store, and the one thing a demo
 * must not do is produce data the application could never have made.
 *
 * The content is chosen so every page has something real underneath it: a
 * hierarchy across all five types, a closed sprint with its commitment
 * baseline, a running sprint whose scope moved after it opened, blocked and
 * unestimated work for the dashboard's signals, and items left in the backlog.
 *
 * Run `pnpm build` first: this imports the built packages.
 */
import { readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createCommunityRuntime } from '@dsh-scrum/edition-community'
import { createHostApi } from '@dsh-scrum/scrum-harness-host'
import { readProjectFile } from '@dsh-scrum/adapter-storage-workspace-files'
import { toProjectKey, toTimestamp } from '@dsh-scrum/scrum-domain'

const DAY = 24 * 60 * 60 * 1000

function day(offset) {
  const at = new Date(Date.now() + offset * DAY)
  at.setUTCHours(9, 0, 0, 0)
  return toTimestamp(at.toISOString())
}

function hostFor(path) {
  const workspace = { id: `ws_${basename(path)}`, path, name: basename(path) }
  const session = { id: 'session_seed', workspaceId: workspace.id }
  const harness = {
    instanceId: 'dsh_local_1',
    currentWorkspace: async () => workspace,
    currentSession: async () => session,
  }
  return createHostApi(harness, createCommunityRuntime())
}

/**
 * The project to seed into, attaching or creating one as needed.
 *
 * A binding is keyed by the Harness instance and workspace identifiers, and
 * this script invents its own; a directory the real Harness has already bound
 * therefore reads as unbound here. So a project file that exists is attached
 * rather than recreated — the alternative is refusing to seed the very
 * workspace somebody opened Harness on.
 *
 * The project identifier is read with the store's own reader. Reading is the
 * only thing done off the host path: every write goes through the API.
 */
async function projectFor(host, path) {
  const entry = await host.entry()
  if (entry.state === 'no-workspace') {
    throw new Error('the path is not a workspace Harness can open')
  }
  if (entry.state === 'bound' || entry.state === 'archived') {
    await assertEmpty(host)
    return entry.project
  }
  const existing = await readProjectFile(path).catch(() => null)
  if (existing !== null) {
    await host.attach(existing.project.id)
    await assertEmpty(host)
    return existing.project
  }
  return (
    await host.initialise({
      key: toProjectKey('DAW'),
      name: 'DAW AI软件开发',
      description: 'AI 辅助的音乐生成软件',
    })
  ).project
}

/** Refuses a workspace that already holds work, rather than doubling it. */
async function assertEmpty(host) {
  const existing = await host.backlog()
  if (existing.length > 0) {
    throw new Error(
      `this workspace already holds ${existing.length} work items; seeding would double them`,
    )
  }
}

const EPICS = [
  { title: '音频引擎', description: '多轨播放、混音与实时效果链。', category: 'feature' },
  { title: 'AI 生成', description: '从文本与参考音频生成旋律与编曲。', category: 'feature' },
  { title: '工程与发布', description: '构建、打包、崩溃上报与更新。', category: 'ops' },
]

/**
 * The work under each epic.
 *
 * `estimate: null` and `blocked` are deliberate: the dashboard's signals are
 * only worth looking at on a project that actually has some.
 */
const WORK = [
  {
    epic: 0,
    type: 'story',
    category: 'feature',
    title: '多轨混音',
    description: '把任意条音轨混成一路输出，支持每轨音量与声像。',
    estimate: 8,
    criteria: ['八轨同时播放不掉帧', '每轨音量与声像可独立调整'],
    subtasks: ['混音总线实现', '声道映射与相位检查'],
  },
  {
    epic: 0,
    type: 'task',
    category: 'feature',
    title: '低延迟音频回放',
    description: '把回放延迟压到 10ms 以内。',
    estimate: 5,
  },
  {
    epic: 0,
    type: 'bug',
    category: 'defect',
    title: '切换采样率时出现爆音',
    description: '从 44.1kHz 切到 48kHz 的瞬间输出一声爆响。',
    estimate: 3,
    details: { type: 'bug', severity: 'major', isRegression: true },
  },
  {
    epic: 1,
    type: 'story',
    category: 'feature',
    title: '按文本描述生成旋律',
    description: '输入一段文字描述，生成 8 小节的旋律草稿。',
    estimate: 13,
    criteria: ['生成结果可直接拖进音轨', '同一描述可重复生成不同结果'],
  },
  {
    epic: 1,
    type: 'story',
    category: 'feature',
    title: '风格迁移',
    description: '把已有片段迁移到另一种编曲风格。',
    estimate: 8,
  },
  {
    epic: 1,
    type: 'task',
    category: 'spike',
    title: '评估扩散模型的推理耗时',
    description: '在本地 GPU 上量一遍，决定是否需要蒸馏。',
    details: { type: 'task', timebox: 2, outcome: '' },
  },
  {
    epic: 1,
    type: 'bug',
    category: 'defect',
    title: '生成结果偶发整段静音',
    description: '约二十次里出现一次，日志没有异常。',
    details: { type: 'bug', severity: 'blocker', isRegression: false },
    blocked: '等待推理服务补上请求日志',
  },
  {
    epic: 2,
    type: 'task',
    category: 'ops',
    title: '构建 macOS 安装包',
    description: '在 CI 上出签名过的 dmg。',
    estimate: 5,
  },
  {
    epic: 2,
    type: 'task',
    category: 'tech_debt',
    title: '崩溃日志上报',
    description: '把崩溃栈收上来，先只做本地留存。',
    estimate: 3,
  },
  {
    epic: 2,
    type: 'task',
    category: 'docs',
    title: '写一份插件开发说明',
    description: '给第三方效果器作者看的。',
  },
]

async function createItem(host, spec, parentId) {
  const created = await host.createWorkItem({
    type: spec.type,
    title: spec.title,
    description: spec.description ?? '',
    category: spec.category ?? null,
    ...(spec.details === undefined ? {} : { typeDetails: spec.details }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(spec.criteria === undefined
      ? {}
      : { acceptanceCriteria: spec.criteria.map((text) => ({ text, satisfied: false })) }),
  })
  if (spec.estimate === undefined) {
    return created
  }
  return await host.updateWorkItem({
    workItemId: created.id,
    expectedRevision: created.revision,
    changes: { estimate: spec.estimate },
  })
}

async function latest(host, id) {
  return await host.workItem(id)
}

/**
 * Starting a sprint already moves its work out of the backlog, so a script
 * walking a card through the columns has to skip the step that has happened.
 */
async function move(host, id, status, resolution) {
  const item = await latest(host, id)
  if (item.status === status && resolution === undefined) {
    return item
  }
  return await host.moveWorkItemStatus({
    workItemId: id,
    expectedRevision: item.revision,
    status,
    ...(resolution === undefined ? {} : { resolution }),
  })
}

async function plan(host, ids, sprintId) {
  const items = await Promise.all(ids.map(async (id) => await latest(host, id)))
  await host.planSprint({
    sprintId,
    items: items.map((item) => ({ workItemId: item.id, expectedRevision: item.revision })),
  })
}

async function seed(path) {
  const host = hostFor(path)
  const project = await projectFor(host, path)
  console.log(`seeding ${project.key} · ${project.name} in ${path}`)

  const config = await host.settings()
  await host.configureProject({
    expectedRevision: config.revision,
    changes: {
      definitionOfReady: ['需求描述写清楚了', '验收标准至少一条', '估算过'],
      definitionOfDone: ['代码评审通过', '自动化测试覆盖', '在 macOS 与 Windows 上各跑一遍'],
      workInProgressLimit: 3,
      sprintLengthInDays: 14,
      stalledAfterDays: 3,
    },
  })

  const epics = []
  for (const spec of EPICS) {
    epics.push(await createItem(host, { ...spec, type: 'epic' }))
  }

  const items = []
  const subtasks = new Map()
  for (const spec of WORK) {
    const item = await createItem(host, spec, epics[spec.epic].id)
    items.push(item)
    for (const title of spec.subtasks ?? []) {
      const child = await createItem(host, { type: 'subtask', title, category: 'feature' }, item.id)
      subtasks.set(item.id, [...(subtasks.get(item.id) ?? []), child])
    }
    if (spec.blocked !== undefined) {
      const current = await latest(host, item.id)
      await host.blockWorkItem({
        workItemId: item.id,
        expectedRevision: current.revision,
        reason: spec.blocked,
      })
    }
  }

  // A sprint that has already been through the whole loop, so the review has
  // a baseline to compare against and velocity has one closed sprint to read.
  const past = await host.createSprint({
    name: '第 1 个 Sprint',
    goal: '把音频引擎跑通',
    startDate: day(-28),
    endDate: day(-14),
  })
  await plan(host, [items[0].id, items[1].id, items[2].id], past.id)
  const startedPast = await host.startSprint({ sprintId: past.id, expectedRevision: past.revision })
  for (const id of [items[0].id, items[1].id]) {
    for (const status of ['todo', 'in_progress', 'review']) {
      await move(host, id, status)
    }
    await move(host, id, 'done', 'done')
    // A subtask rides on its parent's sprint, so it is in this sprint too and
    // the close will ask about it unless it has finished as well.
    for (const child of subtasks.get(id) ?? []) {
      for (const status of ['todo', 'in_progress', 'review']) {
        await move(host, child.id, status)
      }
      await move(host, child.id, 'done', 'done')
    }
  }
  // Not everything committed to was delivered, which is the difference the
  // dashboard shows between what left the board and what was delivered.
  await move(host, items[2].id, 'todo')
  await move(host, items[2].id, 'done', 'wont_fix')
  const closing = await host.sprint(startedPast.id)
  await host.closeSprint({
    sprintId: closing.id,
    expectedRevision: closing.revision,
    resultSummary: '引擎的主链路跑通了，采样率的爆音这轮不修。',
    dispositions: [],
  })

  // The sprint being worked now.
  const current = await host.createSprint({
    name: '第 2 个 Sprint',
    goal: '出第一版可听的生成结果',
    startDate: day(-5),
    endDate: day(9),
  })
  await plan(host, [items[3].id, items[5].id, items[6].id], current.id)
  const running = await host.startSprint({
    sprintId: current.id,
    expectedRevision: current.revision,
  })
  await move(host, items[3].id, 'todo')
  await move(host, items[3].id, 'in_progress')
  await move(host, items[5].id, 'todo')
  await move(host, items[5].id, 'in_progress')
  await move(host, items[5].id, 'review')
  await move(host, items[6].id, 'todo')
  // Added after the sprint opened, which is what the scope change reports.
  await plan(host, [items[7].id], running.id)
  await move(host, items[7].id, 'todo')

  const all = await host.backlog()
  console.log(
    `done: ${all.length} work items, 2 sprints, ${all.filter((item) => item.sprintId === running.id).length} in the running one`,
  )
}

const target = process.argv[2]
if (target === undefined) {
  console.error('usage: node scripts/seed-demo-project.js <workspace-path>')
  process.exit(1)
}

try {
  await readdir(resolve(target))
} catch {
  console.error(`no such directory: ${target}`)
  process.exit(1)
}

try {
  await seed(resolve(target))
} catch (error) {
  // A refusal is an ordinary outcome here — the workspace already holds work —
  // and a stack trace would suggest the script itself is broken.
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
