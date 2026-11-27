// Generates the three UML draw.io files for project-docs/03-uml/. Run: node gen-uml.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2]
mkdirSync(out, { recursive: true })

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const TEAM = 'Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)'

const C = {
  blue: 'fillColor=#dae8fc;strokeColor=#6c8ebf;',
  orange: 'fillColor=#ffe6cc;strokeColor=#d79b00;',
  green: 'fillColor=#d5e8d4;strokeColor=#82b366;',
  purple: 'fillColor=#e1d5e7;strokeColor=#9673a6;',
  grey: 'fillColor=#f5f5f5;strokeColor=#666666;',
  red: 'fillColor=#f8cecc;strokeColor=#b85450;',
}

function page(name, id, w, h, build) {
  const cells = []
  let n = 2
  const api = {
    vertex(value, style, x, y, width, height) {
      const cid = `${id}-${n++}`
      cells.push(`<mxCell id="${cid}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`)
      return cid
    },
    edge(value, style, source, target, extra = '') {
      const cid = `${id}-${n++}`
      cells.push(`<mxCell id="${cid}" value="${esc(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${extra}</mxGeometry></mxCell>`)
      return cid
    },
    /** A free edge between two points (sequence-diagram messages). */
    line(value, style, x1, y1, x2, y2) {
      const cid = `${id}-${n++}`
      cells.push(`<mxCell id="${cid}" value="${esc(value)}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y1}" as="sourcePoint"/><mxPoint x="${x2}" y="${y2}" as="targetPoint"/></mxGeometry></mxCell>`)
      return cid
    },
  }
  build(api)
  return `<diagram name="${esc(name)}" id="${id}"><mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`
}

const file = (name, pages) =>
  writeFileSync(path.join(out, name), `<mxfile host="app.diagrams.net" agent="Echo Legacy engine docs">${pages.join('')}</mxfile>\n`)

const title = (api, text, sub, w) =>
  api.vertex(`<b style="font-size:20px">${text}</b><br>${sub}<br><span style="font-size:10px">${TEAM}</span>`, 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;', 40, 10, w, 70)

/* ------------------------------------------------------------------ */
/* Use case diagram                                                    */
/* ------------------------------------------------------------------ */
const useCase = page('Use Case Diagram', 'uc', 1400, 980, (api) => {
  title(api, 'Echo Legacy — Use Case Diagram', 'Actors and what they do with the system (CS 413 final project). Fictional example people: owner Ramon, asker Maria, trustee Lito.', 1300)
  api.vertex('Echo — Legacy diary', `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#333333;verticalAlign=top;fontStyle=1;fontSize=14;`, 260, 100, 860, 850)

  const actor = (label, x, y) => api.vertex(label, 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontStyle=1;', x, y, 40, 80)
  const owner = actor('Owner', 140, 300)
  const trustee = actor('Trustee', 140, 700)
  const asker = actor('Registered Asker', 1220, 260)
  const gemini = actor('Gemini model\n(external)', 1220, 470)
  const clock = actor('Clock\n(death trigger)', 1220, 760)

  const uc = (label, x, y, color = C.blue) => api.vertex(label, `ellipse;whiteSpace=wrap;html=1;${color}fontSize=12;`, x, y, 200, 64)
  const signIn = uc('Sign in', 590, 130, C.grey)
  const write = uc('Write entry', 300, 220)
  const mode = uc('Choose writing mode', 300, 320)
  const process = uc('Process entry text<br>(normalize, extract, correct, diff)', 590, 220, C.orange)
  const append = uc('Append to hash chain', 590, 320, C.orange)
  const list = uc('View entry list', 300, 420)
  const policy = uc('Edit legacy policy', 300, 520)
  const compile = uc('Compile policy<br>(lexer → parser → Prolog facts)', 590, 520, C.orange)
  const verify = uc('Verify vault', 300, 660, C.orange)
  const custody = uc('Transfer custody', 300, 800)
  const ask = uc('Ask a question', 880, 260, C.purple)
  const access = uc('Check access<br>(Prolog rules)', 590, 420, C.green)
  const cited = uc('Read cited answer', 880, 400, C.purple)
  const neutral = uc('Get neutral reply', 880, 530, C.purple)
  const letter = uc('Read released letter', 880, 650, C.purple)
  const trigger = uc('Fire death trigger', 880, 800, C.red)
  const freeze = uc('Freeze policy', 590, 800, C.red)

  const assoc = 'endArrow=none;html=1;rounded=0;'
  const inc = 'endArrow=open;html=1;rounded=0;dashed=1;endSize=10;fontSize=11;labelBackgroundColor=#ffffff;'
  for (const t of [signIn, write, list, policy, verify]) api.edge('', assoc, owner, t)
  for (const t of [signIn, verify, custody]) api.edge('', assoc, trustee, t)
  for (const t of [signIn, ask, cited, letter]) api.edge('', assoc, asker, t)
  api.edge('', assoc, gemini, ask)
  api.edge('', assoc, clock, trigger)

  api.edge('«include»', inc, write, process)
  api.edge('«include»', inc, write, append)
  api.edge('«extend»', inc, mode, write)
  api.edge('«include»', inc, policy, compile)
  api.edge('«include»', inc, ask, access)
  api.edge('«extend»', inc, neutral, ask)
  api.edge('«extend»', inc, letter, cited)
  api.edge('«include»', inc, trigger, freeze)

  api.vertex(
    '<b>Notes</b><br>• Deny by default: an asker with no protocol only ever gets the neutral reply.<br>• Askers can ask only after the death trigger fires; the policy is then frozen.<br>• The model answers only from what the tools return; it never reads the vault.<br>• A Letter of Wishes is a personal message, not a legal will.',
    'shape=note;whiteSpace=wrap;html=1;size=14;align=left;verticalAlign=top;spacingLeft=6;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;',
    40, 830, 210, 130,
  )
})
file('use-case-diagram.drawio', [useCase])

/* ------------------------------------------------------------------ */
/* Sequence diagrams                                                   */
/* ------------------------------------------------------------------ */
function sequence(name, id, heading, sub, participants, steps, height) {
  const COL = 170
  const width = 120 + participants.length * COL
  return page(name, id, width + 80, height + 40, (api) => {
    title(api, heading, sub, width)
    const xs = {}
    participants.forEach((p, i) => {
      const x = 60 + i * COL
      xs[p.key] = x + 60
      const style = p.actor
        ? 'shape=umlLifeline;participant=umlActor;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;verticalAlign=top;spacingTop=36;outlineConnect=0;size=40;fontStyle=1;'
        : `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;collapsible=0;recursiveResize=0;outlineConnect=0;size=50;${p.color ?? C.blue}fontStyle=1;fontSize=11;`
      api.vertex(p.label, style, x, 90, 120, height - 100)
    })
    const call = 'html=1;verticalAlign=bottom;endArrow=block;endFill=1;fontSize=11;labelBackgroundColor=#ffffff;'
    const ret = 'html=1;verticalAlign=bottom;endArrow=open;dashed=1;endSize=8;fontSize=11;labelBackgroundColor=#ffffff;'
    let y = 170
    let num = 1
    for (const s of steps) {
      if (s.frame) {
        const x1 = xs[s.from] - 70
        const x2 = xs[s.to] + 70
        api.vertex(s.frame, 'shape=umlFrame;whiteSpace=wrap;html=1;width=50;height=24;fontStyle=1;fillColor=none;', x1, y - 10, x2 - x1, s.height)
        api.vertex(s.guard, 'text;html=1;align=left;fontSize=11;fontStyle=2;', x1 + 56, y - 10, 300, 22)
        y += 22
        continue
      }
      if (s.else) {
        api.line('', 'endArrow=none;dashed=1;html=1;strokeColor=#666666;', xs[s.from] - 70, y, xs[s.to] + 70, y)
        api.vertex(s.else, 'text;html=1;align=left;fontSize=11;fontStyle=2;', xs[s.from] - 64, y, 340, 22)
        y += 30
        continue
      }
      if (s.note) {
        api.vertex(s.note, 'shape=note;whiteSpace=wrap;html=1;size=12;align=left;spacingLeft=6;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;', xs[s.at] - 60, y - 6, s.w ?? 300, 44)
        y += 52
        continue
      }
      const label = `${num++}. ${s.msg}`
      if (s.from === s.to) {
        const x = xs[s.from]
        api.line(label, `${call}curved=0;align=left;spacingLeft=4;`, x, y, x, y + 22)
        // self call drawn as a short loop
        y += 40
        continue
      }
      api.line(label, s.ret ? ret : call, xs[s.from], y, xs[s.to], y)
      y += s.gap ?? 34
    }
  })
}

const askQuestion = sequence(
  '1. Ask a question',
  'sq1',
  'Sequence 1 — A registered asker asks a question',
  'Maria asks "What did he write about family?" after the death trigger. Only permitted entries ever reach the model.',
  [
    { key: 'asker', label: 'Maria : Registered Asker', actor: true },
    { key: 'ui', label: 'Echo UI<br>(Ask screen)' },
    { key: 'qa', label: 'Q&amp;A script<br>(scripting)', color: C.purple },
    { key: 'tools', label: 'Tools<br>search / check / fetch', color: C.purple },
    { key: 'prolog', label: 'Prolog<br>access rules', color: C.green },
    { key: 'vault', label: 'vault : Vault', color: C.orange },
    { key: 'model', label: 'Gemini model<br>(external)', color: C.grey },
  ],
  [
    { from: 'asker', to: 'ui', msg: 'ask("What did he write about family?")' },
    { from: 'ui', to: 'qa', msg: 'answer(asker from session, question)' },
    { from: 'qa', to: 'vault', msg: 'verify()' },
    { from: 'vault', to: 'qa', msg: 'true (else TamperDetected)', ret: true },
    { from: 'qa', to: 'model', msg: 'question + instructions + tool list' },
    { from: 'model', to: 'qa', msg: 'call search_entries("family")', ret: true },
    { from: 'qa', to: 'tools', msg: 'search_entries(maria, "family")' },
    { from: 'tools', to: 'prolog', msg: 'can_see(maria, summary, E)?' },
    { from: 'prolog', to: 'tools', msg: 'E = e1, e3, e5, … (deny by default, deny beats allow)', ret: true },
    { from: 'tools', to: 'vault', msg: 'entriesFor(maria, summary, today)' },
    { from: 'vault', to: 'tools', msg: 'frozen copies of permitted entries', ret: true },
    { from: 'tools', to: 'qa', msg: '{ count, matches: [entry_id, date, summary] }', ret: true },
    { frame: 'alt', guard: '[permitted entries found]', from: 'ui', to: 'model', height: 232 },
    { from: 'qa', to: 'model', msg: 'tool results only' },
    { from: 'model', to: 'qa', msg: '{ answer, citations: [2019-03-02, …] }', ret: true },
    { from: 'qa', to: 'qa', msg: 'every claim cited? quotes only from full access?' },
    { from: 'qa', to: 'ui', msg: 'cited answer', ret: true },
    { else: '[nothing permitted, or any error]', from: 'ui', to: 'model' },
    { from: 'qa', to: 'ui', msg: 'neutral reply: "I don\'t have anything I can share about that."', ret: true, gap: 44 },
    { from: 'ui', to: 'asker', msg: 'show answer with dates', ret: true },
    { note: 'The model never reads the vault directly: it sees only what the tools return, and the tools ask the Prolog rules first.', at: 'tools', w: 420 },
  ],
  1000,
)

const writeEntry = sequence(
  '2. Write an entry',
  'sq2',
  'Sequence 2 — The owner writes an entry',
  'The writing mode is chosen by polymorphism; the pipeline is pure; the entry is appended to the hash chain. The original text is always kept.',
  [
    { key: 'owner', label: 'Ramon : Owner', actor: true },
    { key: 'ui', label: 'Echo UI<br>(Write screen)' },
    { key: 'mode', label: 'mode : WritingMode<br>(LightFix)', color: C.blue },
    { key: 'pipe', label: 'Pipeline<br>(pure functions)', color: C.orange },
    { key: 'entry', label: 'entry : DiaryEntry', color: C.blue },
    { key: 'vault', label: 'vault : Vault', color: C.orange },
    { key: 'chain', label: 'HashChain', color: C.orange },
  ],
  [
    { from: 'owner', to: 'ui', msg: 'type text, tags; choose mode light_fix' },
    { from: 'ui', to: 'mode', msg: 'WritingMode.forName("light_fix").apply(text)' },
    { from: 'mode', to: 'pipe', msg: 'processEntryText(text, tags, knownPeople)' },
    { from: 'pipe', to: 'mode', msg: '{ original, normalized, corrected, extracted, changes }', ret: true },
    { frame: 'alt', guard: '[mode = review]', from: 'owner', to: 'pipe', height: 196 },
    { from: 'mode', to: 'ui', msg: 'corrected text + diff [-teh-] {+the+}', ret: true },
    { from: 'owner', to: 'ui', msg: 'accept or reject the correction' },
    { else: '[mode = verbatim or light_fix]', from: 'owner', to: 'pipe' },
    { from: 'mode', to: 'ui', msg: 'final text (original kept alongside)', ret: true, gap: 50 },
    { from: 'ui', to: 'entry', msg: 'new DiaryEntry({ id, date, text, tags })' },
    { from: 'ui', to: 'vault', msg: 'append(entry)' },
    { from: 'vault', to: 'chain', msg: 'appendLink(chain, entry)' },
    { from: 'chain', to: 'vault', msg: 'new frozen chain (prevHash → hash)', ret: true },
    { from: 'vault', to: 'ui', msg: 'count()', ret: true },
    { from: 'ui', to: 'owner', msg: '"Saved · chain verified"', ret: true },
  ],
  800,
)

const compilePolicy = sequence(
  '3. Compile a policy',
  'sq3',
  'Sequence 3 — The owner saves a legacy policy',
  'Lexer → recursive-descent parser → interpreter → Prolog facts. After the death trigger the policy is frozen.',
  [
    { key: 'owner', label: 'Ramon : Owner', actor: true },
    { key: 'ui', label: 'Policy editor' },
    { key: 'om', label: 'ramon : Owner<br>(model)', color: C.blue },
    { key: 'lex', label: 'Lexer', color: C.orange },
    { key: 'parse', label: 'Parser<br>(recursive descent)', color: C.orange },
    { key: 'interp', label: 'Interpreter', color: C.orange },
    { key: 'prolog', label: 'Prolog<br>access rules', color: C.green },
  ],
  [
    { from: 'owner', to: 'ui', msg: 'save policy text' },
    { from: 'ui', to: 'om', msg: 'isPolicyFrozen?' },
    { frame: 'alt', guard: '[policy frozen]', from: 'ui', to: 'prolog', height: 540 },
    { from: 'om', to: 'ui', msg: 'PolicyFrozen', ret: true },
    { from: 'ui', to: 'owner', msg: '"The policy locked when the legacy was released."', ret: true },
    { else: '[not frozen]', from: 'ui', to: 'prolog' },
    { from: 'ui', to: 'lex', msg: 'tokenize(text)' },
    { from: 'lex', to: 'ui', msg: 'tokens (type, value, line, column) or PolicySyntaxError', ret: true },
    { from: 'ui', to: 'parse', msg: 'parse(tokens)' },
    { frame: 'alt', guard: '[syntax error]', from: 'ui', to: 'prolog', height: 300 },
    { from: 'parse', to: 'ui', msg: 'PolicySyntaxError (line 3, column 7)', ret: true },
    { from: 'ui', to: 'owner', msg: 'highlight line 3, column 7', ret: true },
    { else: '[valid]', from: 'ui', to: 'prolog' },
    { from: 'parse', to: 'ui', msg: 'syntax tree', ret: true },
    { from: 'ui', to: 'interp', msg: 'compile(tree)' },
    { from: 'interp', to: 'prolog', msg: 'assertz(grant/deny/release/custody_transfer/trustee/default_mode)' },
    { from: 'interp', to: 'ui', msg: 'facts compiled', ret: true },
    { from: 'ui', to: 'owner', msg: '"Policy saved"', ret: true },
  ],
  860,
)
file('sequence-diagrams.drawio', [askQuestion, writeEntry, compilePolicy])

/* ------------------------------------------------------------------ */
/* Class diagram                                                       */
/* ------------------------------------------------------------------ */
const classDiagram = page('Class Diagram', 'cls', 1900, 1500, (api) => {
  title(api, 'Echo Legacy engine — Class Diagram', 'Built classes match engine/src exactly. «planned» classes come with later tickets. Visibility: + public, - private (#field), {static}, «abstract».', 1800)
  const cls = (name, stereo, attrs, methods, x, y, w, color = C.blue, planned = false) => {
    const head = `<div style="text-align:center">${stereo ? `<i>${esc(stereo)}</i><br>` : ''}<b>${esc(name)}</b></div>`
    const section = (lines) => (lines.length ? lines.map(esc).join('<br>') : '&nbsp;')
    const html = `${head}<hr size="1">${section(attrs)}<hr size="1">${section(methods)}`
    const h = 46 + 16 * (attrs.length + methods.length) + (stereo ? 14 : 0)
    return api.vertex(html, `rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=6;spacingTop=2;fontSize=11;${color}${planned ? 'dashed=1;' : ''}`, x, y, w, h)
  }

  // Entries
  const entry = cls('Entry', '«abstract»', ['- #data: EntryData'], ['+ id, date, text, tags {get}', '+ kind: string «abstract»', '+ describe(): string «abstract»', '+ summarize(maxWords = 20): string', '+ isReadableOn(today, asker): boolean', '+ toRecord(): EntryRecord'], 60, 110, 290)
  const diary = cls('DiaryEntry', '', [], ['+ kind = "diary"', '+ describe(): string'], 40, 400, 170)
  const letter = cls('LetterOfWishes', '', ['+ DISCLAIMER: string {static}', '- #title: string', '- #recipient: string', '- #releaseDate: string'], ['+ title, recipient, releaseDate {get}', '+ describe(): string', '+ summarize(): string', '+ isReadableOn(today, asker): boolean'], 230, 400, 270)

  // Model
  const owner = cls('Owner', '', ['- #name: string', '- #vault: Vault', '- #vaultKey: symbol', '- #beneficiaries: Beneficiary[]', '- #policyFrozen: boolean'], ['+ name, vault, beneficiaries {get}', '+ addBeneficiary(b: Beneficiary): void', '+ assignProtocol(b, p: Protocol): void', '+ freezePolicy(): void', '+ findBeneficiary(nameOrId): Beneficiary', '+ isPolicyFrozen: boolean {get}'], 600, 110, 290)
  const vault = cls('Vault', '', ['- #chain: ChainLink[]', '- #key: symbol', '- #registered: WeakSet<Beneficiary>'], ['+ claim(): symbol', '+ admit(b, key: symbol): void', '+ append(entry: Entry): void', '+ count(): number', '+ verify(): true', '+ entriesFor(b, level, today): Entry[]', '+ read(b, entryId, today): Entry'], 600, 420, 290, C.orange)
  const ben = cls('Beneficiary', '', ['- #id: string', '- #displayName: string', '- #protocol: Protocol | null', '- #sealed: boolean'], ['+ id, displayName, protocol {get}', '+ assignProtocol(p: Protocol): void', '+ seal(): void'], 990, 110, 260)
  const prot = cls('Protocol', '', ['- #holder: string', '- #grants: Grant[]', '- #sealed: boolean'], ['+ holder, grants, isSealed {get}', '+ addGrant(g: Grant): void', '+ seal(): void', '+ decide(entry, level): Effect'], 990, 330, 260)
  const grant = cls('Grant', '', ['- #level: existence | summary | full', '- #selector: mentions | tag | letter', '- #effect: allow | deny'], ['+ level, selector, effect {get}', '+ matches(entry: Entry): boolean', '+ covers(level): boolean'], 990, 540, 260)

  // Chain + pipeline
  const link = cls('ChainLink', '«type»', ['+ index: number', '+ prevHash: string', '+ record: EntryRecord', '+ hash: string'], [], 600, 700, 200, C.orange)
  const chain = cls('HashChain', '«module»', ['+ GENESIS_HASH: string'], ['+ appendLink(chain, entry): ChainLink[]', '+ verifyChain(chain): true', '+ linkHash(prevHash, record): string', '+ canonicalJson(value): string'], 300, 700, 270, C.orange)
  const pipe = cls('Pipeline', '«module» pure functions', [], ['+ normalize(text): string', '+ extractNamesAndTopics(text, tags, people): Extracted', '+ correct(text): string', '+ diff(original, corrected): DiffPart[]', '+ renderDiff(parts): string', '+ processEntryText(text, tags, people): Processed'], 40, 900, 340, C.orange)

  // Policy + Prolog
  const lexer = cls('Lexer', '«module»', [], ['+ tokenize(source): Token[]'], 1340, 110, 220, C.orange)
  const facts = cls('PrologFacts', '«module»', [], ['+ quoteAtom(text): string', '+ entryFacts(entries, people): string[]', '+ personFacts(id, grants | null): string[]'], 1650, 560, 230, C.green)
  const msgs = cls('Messages', '«module»', ['+ MESSAGES: catalog', '+ NEUTRAL_REPLY: string'], ['+ messageFor(error, audience): UserMessage'], 1650, 790, 230, C.purple)
  const token = cls('Token', '«type»', ['+ type: TokenType', '+ value: string', '+ line: number', '+ column: number'], [], 1600, 110, 180, C.orange)
  const parser = cls('Parser', '«planned»', [], ['+ parse(tokens): PolicyTree'], 1340, 280, 220, C.grey, true)
  const interp = cls('Interpreter', '«planned»', [], ['+ compile(tree): PrologFact[]'], 1340, 420, 220, C.grey, true)
  const prolog = cls('PrologSession', '', ['- #session'], ['+ load(program): Promise<PrologSession> {static}', '+ assert(fact): Promise<void>', '+ ask(goal): Promise<boolean>', '+ all(goal, variable): Promise<string[]>'], 1340, 560, 280, C.green)
  const qa = cls('QAScript', '«planned» scripting', [], ['+ answer(asker, question): CitedAnswer'], 1340, 790, 280, C.grey, true)

  // Writing modes (planned)
  const wm = cls('WritingMode', '«abstract» «planned»', [], ['+ apply(text): WritingResult', '+ forName(mode): WritingMode {static}'], 440, 960, 260, C.grey, true)
  const verbatim = cls('Verbatim', '«planned»', [], ['+ apply(text)'], 400, 1150, 140, C.grey, true)
  const light = cls('LightFix', '«planned»', [], ['+ apply(text)'], 560, 1150, 140, C.grey, true)
  const review = cls('Review', '«planned»', [], ['+ apply(text)'], 720, 1150, 140, C.grey, true)

  // Exceptions
  const base = cls('EchoLegacyError', '', [], [], 1060, 1000, 180, C.red)
  const exc = [
    cls('AccessDenied', '', [], [], 860, 1160, 140, C.red),
    cls('AmbiguousName', '', [], [], 1010, 1160, 150, C.red),
    cls('PolicyFrozen', '', [], [], 1170, 1160, 140, C.red),
    cls('PolicySyntaxError', '', ['+ line: number', '+ column: number'], [], 1320, 1160, 170, C.red),
    cls('TamperDetected', '', ['+ index: number'], [], 1500, 1160, 160, C.red),
    cls('UnknownEntryType', '', [], [], 1670, 1160, 160, C.red),
  ]
  const errorBox = api.vertex('Error', `rounded=0;whiteSpace=wrap;html=1;fontSize=11;${C.grey}`, 1100, 900, 100, 30)

  const gen = 'endArrow=block;endFill=0;endSize=12;html=1;rounded=0;'
  const dep = 'endArrow=open;dashed=1;html=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;'
  const comp = (label) => `endArrow=none;startArrow=diamondThin;startFill=1;startSize=14;html=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;`
  const agg = 'endArrow=none;startArrow=diamondThin;startFill=0;startSize=14;html=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;'
  const assoc = 'endArrow=open;html=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;'

  api.edge('', gen, diary, entry)
  api.edge('', gen, letter, entry)
  for (const sub of [verbatim, light, review]) api.edge('', gen, sub, wm)
  for (const e of exc) api.edge('', gen, e, base)
  api.edge('', gen, base, errorBox)

  api.edge('1          1', comp(), owner, vault)
  api.edge('1        0..*', agg, owner, ben)
  api.edge('1        0..1', assoc, ben, prot)
  api.edge('1        0..*', comp(), prot, grant)
  api.edge('1        0..*', comp(), vault, link)
  api.edge('«use»', dep, vault, chain)
  api.edge('«create»', dep, vault, entry)
  api.edge('«use»', dep, grant, entry)
  api.edge('«use»', dep, vault, prot)
  api.edge('«create»', dep, lexer, token)
  api.edge('«use»', dep, parser, lexer)
  api.edge('«use»', dep, interp, parser)
  api.edge('«use»', dep, interp, prolog)
  api.edge('«use»', dep, qa, prolog)
  api.edge('«use»', dep, qa, vault)
  api.edge('«use»', dep, wm, pipe)
  api.edge('«throw»', dep, vault, exc[0])
  api.edge('«throw»', dep, chain, exc[4])
  api.edge('«throw»', dep, lexer, exc[3])
  api.edge('«throw»', dep, owner, exc[2])
  api.edge('«throw»', dep, vault, exc[5])
  api.edge('«use»', dep, facts, grant)
  api.edge('«use»', dep, facts, entry)
  api.edge('«use»', dep, msgs, base)
})
file('class-diagram.drawio', [classDiagram])
console.log('ok')
