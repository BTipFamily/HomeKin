import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// What a 'use server' module is allowed to export.
//
// Next compiles one of these by collecting its exports into a runtime list:
//
//   ensureServerEntryExports([createSurvey, submitSurveyResponse, ...])
//
// A `export type { X }` specifier list survives that collection as a bare
// identifier. Nothing exists under that name at runtime, so the module throws
// ReferenceError the instant it is evaluated — before any page renders, and
// nowhere a try/catch could reach. That shipped once, in surveys.ts, and it cost
// three rounds of debugging because neither `tsc` nor `next build` complains:
// the TypeScript is entirely valid, and the fault is only in what the transform
// emits.
//
// So it is checked here instead. Source-level and crude, but it runs in
// milliseconds across every action module and catches the one thing that the
// rest of the toolchain is blind to.

const ACTIONS_DIR = join(process.cwd(), 'src/lib/actions')

function serverActionModules(): { name: string; source: string }[] {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(join(ACTIONS_DIR, name), 'utf8') }))
    .filter((f) => /^\s*['"]use server['"]/.test(f.source))
}

// The actions behind a form or a row button. Each one used to throw, which
// meant its failure reached the user as Next's redacted placeholder — no
// capacity message, no overpayment message, no "that is not yours to delete".
// Listed rather than inferred: the point is that removing a return type here
// has to be a deliberate act, not something a refactor does quietly.
const MUST_RETURN_STATE: Record<string, string[]> = {
  'signups.ts': ['upsertSignup', 'cancelSignup'],
  'balances.ts': ['reportManualPayment', 'confirmPayment', 'deletePayment'],
  'members.ts': ['updateMemberProfile', 'createProxyMember', 'updateMemberRole'],
  'reunions.ts': ['updateReunion'],
  'relationships.ts': ['deleteRelationship'],
  'announcements.ts': ['deleteAnnouncement'],
  'photos.ts': ['deletePhoto'],
  'sub-events.ts': ['deleteSubEvent', 'createSubEvent', 'updateSubEvent'],
  'surveys.ts': ['deleteSurvey'],
}

describe('actions a form posts to', () => {
  it('return their failures rather than throwing them', () => {
    for (const [file, actions] of Object.entries(MUST_RETURN_STATE)) {
      const source = readFileSync(join(ACTIONS_DIR, file), 'utf8')
      for (const action of actions) {
        const signature = new RegExp(
          `export async function ${action}\\b[\\s\\S]*?\\)\\s*:\\s*Promise<(ActionState|EventFormState|AnnouncementState)>`
        )
        expect(
          signature.test(source),
          `${file}::${action} must declare Promise<…State>. Without it the form has ` +
            `nothing to render and the reason is lost to React's production redaction.`
        ).toBe(true)
      }
    }
  })
})

describe("'use server' modules", () => {
  const modules = serverActionModules()

  it('finds the action modules', () => {
    expect(modules.length).toBeGreaterThan(0)
  })

  it('never re-exports a type through a specifier list', () => {
    // `export type { X }` — the form that leaks into the runtime export list.
    // `export type X = …` is fine: a declaration is erased properly.
    for (const { name, source } of modules) {
      const offenders = source
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter((l) => /^export\s+type\s*\{/.test(l.line))

      expect(
        offenders.map((o) => `${name}:${o.n} ${o.line}`),
        `${name} re-exports a type by specifier list. It will be emitted as a bare ` +
          `identifier and throw ReferenceError on module evaluation. Move the type to a ` +
          `plain module and import it from there.`
      ).toEqual([])
    }
  })

  it('never re-exports values through a specifier list either', () => {
    // Same collection path, same hazard, and it also hides whether what is being
    // exported is actually an async function.
    for (const { name, source } of modules) {
      const offenders = source
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter((l) => /^export\s*\{/.test(l.line))

      expect(offenders.map((o) => `${name}:${o.n} ${o.line}`)).toEqual([])
    }
  })

  it('only exports async functions and type declarations', () => {
    for (const { name, source } of modules) {
      const bad = source
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter((l) => l.line.startsWith('export'))
        .filter(
          (l) =>
            !/^export\s+async\s+function\s/.test(l.line) &&
            !/^export\s+type\s+\w+/.test(l.line) &&
            !/^export\s+interface\s/.test(l.line)
        )

      expect(
        bad.map((o) => `${name}:${o.n} ${o.line}`),
        `${name} has an export that is neither an async function nor a type ` +
          `declaration. A 'use server' module may only export async functions.`
      ).toEqual([])
    }
  })
})
