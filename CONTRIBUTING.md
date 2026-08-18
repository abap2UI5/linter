_This project is open source and developed alongside other projects or during free time. Contributions are greatly appreciated!_

Check out the contribution guidelines [here.](https://abap2ui5.github.io/docs/resources/contribution.html)

## Before opening a pull request

```bash
npm ci
npx playwright install chromium   # the render gate needs a browser
npm test                          # test/run.mjs - the whole suite
```

`npm test` also gates the generated artefacts, so run `npm run generate-schema`
and `npm run generate-rules-page` after adding or rewording a rule and commit
what they write. [AGENTS.md](AGENTS.md) is the full contract: what the linter
can and cannot see, how a rule is added, and what a change owes the downstream
consumers.
