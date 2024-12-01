# README for dev (memo)

- [Visual Studio Code, Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
  - [nodamushi Orginization](https://dev.azure.com/nodamushi/): https://dev.azure.com/nodamushi/

## Install Node.js

```sh
scoop install nvm
nvm install <VERSION>
nvm use <VERSION>
```

## Install vsce

```sh
npm install -g @vscode/vsce
```

## Build package

```sh
vsce package
```

## Publish

```sh
vsce publish
```

## Run test

```sh
npm run test
```

### Test environment variables

- `DISABLE_DOWNLOAD_TEST=1`: Skip binary download test

