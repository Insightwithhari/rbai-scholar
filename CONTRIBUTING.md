# Contributing

Thanks for helping. This repository holds RBAi Scholar's documentation, client configurations, examples and the
benchmark. The search service's own code isn't here.

## Report a problem or ask a question

Open an [issue](https://github.com/Insightwithhari/rbai-scholar/issues). It helps to include:

- what you searched for, or which tool you called;
- the app you used (ChatGPT, Claude, Cursor, VS Code or your own code);
- what you expected and what you got, with the error message if there was one.

Never paste your API key, a sign-in code or a token. For a security problem, follow [SECURITY.md](SECURITY.md)
instead of opening an issue.

## Suggest a change

For a fix to the documentation, the configurations or the examples, open a pull request. Keep it small and say
what it fixes.

The files in `benchmark/data/` and `benchmark/results/` are recorded measurements, so we don't edit them in
place. If you think one is wrong, open an issue that names the file and the line. If a pull request does touch the
benchmark, run

```
node benchmark/score.mjs
```

(Node.js 18 or later, nothing to install) and check that it ends with "all … checks passed".
`benchmark/MANIFEST.json` records the SHA-256 of every data file, so a changed file needs its entry updated.

## Licence of contributions

Code you contribute is under the MIT License ([LICENSE](LICENSE)). Documentation and data are under CC BY 4.0
([LICENSE-DATA.md](LICENSE-DATA.md)).
