# prolog

Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

The **access rules** of the Echo Legacy engine, written in Prolog: [`access_rules.pl`](access_rules.pl). They decide what each registered asker may see: deny by default, deny beats allow, and (in later tickets) release dates and a frozen policy after the death trigger.

The engine loads the rules in-process with [tau-prolog](http://tau-prolog.org/) (`engine/src/prolog/bridge.ts`), so no Prolog install is needed. Tests: `pnpm test` (see `tests/engine/prolog-bridge.test.ts`). Demo: `pnpm engine:demo`.
