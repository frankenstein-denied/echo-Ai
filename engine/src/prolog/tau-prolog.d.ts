// Echo Legacy engine — tau-prolog ships no type definitions.
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
declare module 'tau-prolog' {
  const pl: any
  export = pl
}
declare module 'tau-prolog/modules/promises.js' {
  const loader: (pl: any) => void
  export = loader
}
declare module 'tau-prolog/modules/lists.js' {
  const loader: (pl: any) => void
  export = loader
}
