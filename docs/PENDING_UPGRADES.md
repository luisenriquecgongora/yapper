# Pending dependency upgrades

Dependabot opened this upgrade and it is **not merged yet**, because it fails CI and needs a build change first.

```mermaid
flowchart LR
    tsup["@yapper/core build<br/>tsup writes JS and .d.ts"]:::todo -->|"fails with TypeScript 7"| fix["Write .d.ts with tsc,<br/>or wait for tsup support"]:::todo --> merge["Merge PR #8"]:::done
    classDef todo fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
```
Legend: amber = work to do, green = the result.

## TypeScript 5 → 7 (Dependabot PR #8)

TypeScript 7 is the new native (Go) compiler. It no longer ships the JavaScript API (`ts.sys`, `ts.createProgram`, ...) that tsup uses to write `.d.ts` files, so `yarn build` in `packages/core` fails with `Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`. `packages/react` imports `core`'s `dist/`, so everything after it fails too.

Two ways forward:

1. **Wait** for a tsup release that supports TypeScript 7, then let Dependabot rebase PR #8.
2. **Split the build:** let tsup write only JavaScript (`dts: false` in its config), and write the type declarations with the TypeScript 7 compiler itself: `tsup && tsc -p tsconfig.json --emitDeclarationOnly --declaration --outDir dist`. Do the same in any other package that builds with tsup.

Either way, also check the `tsconfig.json` files for options TypeScript 7 removed (`moduleResolution: node`/`node10`, `esModuleInterop: false`, `baseUrl`), and list global types explicitly (`"types": ["node"]`), since TypeScript 7 no longer loads every `@types` package by default. Emiliano and Moza needed both changes.
