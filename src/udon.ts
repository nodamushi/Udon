import * as os from 'os';
import * as vscode from 'vscode';
import * as vsuri from 'vscode-uri';
import { basenameOfUri, EvalEnv, EvalNode, evalPath, evalString, parseExpression, Uri } from './eval';
import path = require('path');
import { getClipboardAsImageBase64, getVersion, Result } from './climg2base64';
import * as https from 'https';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as tar from 'tar';
import * as unzipper from 'unzipper';

// -------------------------------------------------------------
// v0.1.0
// -------------------------------------------------------------
const PRE_BUILD = {
  "linux-arm64": ["https://github.com/nodamushi/climg2base64/releases/download/v0.1.0/climg2base64-linux-aarch64.tar.gz", "climg2base64", "a6fcd37a1dcd891c2a1b065a2079fa31"],
  "linux-x64": ["https://github.com/nodamushi/climg2base64/releases/download/v0.1.0/climg2base64-linux-x86_64.tar.gz", "climg2base64", "f322ff62a50edc7eec2144736e824e64"],
  "win32-x64": ["https://github.com/nodamushi/climg2base64/releases/download/v0.1.0/climg2base64-windows-x86_64.zip", "climg2base64.exe", "225aec2ef55edffd429255ce2c6c3cb8"],
} as Record<string, [string, string, string]>;

// -------------------------------------------------------------
// Config
// -------------------------------------------------------------
const DEFAULT_IMAGE_FORMAT = "webp";
const DEFAULT_BASE_DIRECTORY = "${fileDirname}/image";
const DEFAULT_BASE_DIRECTORY_NODE = parseExpression(DEFAULT_BASE_DIRECTORY);
const DEFAULT_BASE_FILENAME = "${fileBasenameNoExtension}-${date: YYYY-M-D}";
const DEFAULT_BASE_FILENAME_NODE = parseExpression(DEFAULT_BASE_FILENAME);
const DEFAULT_REPLACE_RULE = [
  ["*.md", "![](${relImage:${fileDirname}})"],
  ["*.textile", "!${relImage:${fileDirname}}!"],
  ["*.adoc", "image::${relImage:${fileDirname}}[]"],
  ["*.html", "<img src=\"${relImage:${fileDirname}}\">"],
  ["*.cpp", "@image html ${relImage:${workspaceFolder}}"],
  ["*.hpp", "@image html ${relImage:${workspaceFolder}}"],
  ["*", "${relImage:${workspaceFolder}}"]
];
const DEFAULT_RULE = parseExpression("${relImage:${workspaceFolder}}");
const DEFAULT_SUFFIXS_LENGTH = 0;
const DEFAULT_SUFFIXS_DELIMITER = "_";
const FORMAT = [
  "jpeg",
  "png",
  "webp",
  "bmp",
  "gif",
  "avif"
] as const satisfies string[];
export type FormatName = (typeof FORMAT)[number];
const FORMAT_EXT = {
  "jpeg": ".jpg",
  "png": ".png",
  "webp": ".webp",
  "gif": ".gif",
  "avif": ".avif",
  "bmp": ".bmp",
};

const EXT_FORMAT: Record<string, FormatName> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".gif": "gif",
  ".avif": "avif",
  ".bmp": "bmp",
};
//-----------------------------------
const CONFIG_NAME = [
  'format',
  'saveInWorkspaceOnly',
  'execPath',
  'baseDirectory',
  'defaultFileName',
  'rule',
  'suffixLength',
  'suffixDelimiter',
] as const satisfies string[];
export type ConfigName = (typeof CONFIG_NAME)[number];

/**
 * Invalid user configuration
 */
export class ConfigError extends Error {
  config: ConfigName;

  constructor(config: ConfigName, reason: any) {
    if (reason instanceof Error) {
      super(reason.message);
    } else if (typeof reason === "string") {
      super(reason);
    } else {
      super();
    }

    this.config = config;
  }
}

interface UserConfig {
  format?: string,
  execPath?: string,
  baseDirectory?: string,
  defaultFileName?: string,
  rule?: any,
  suffixLength?: number,
  overwriteSelect?: boolean,
  suffixDelimiter?: string,
  saveInWorkspaceOnly?: boolean,
}

interface Config {
  format: FormatName,
  execPath: string,
  baseDirectory: EvalNode,
  defaultFileName: EvalNode,
  rule: Rule[],
  suffixLength: number,
  suffixDelimiter: string,
  saveInWorkspaceOnly: boolean
}

interface Rule {
  pattern: RegExp,
  evalNode: EvalNode,
}

function patternToRegex(pattern: string) {
  if (!/^[\w\*\.\-]+$/.test(pattern)) {
    throw new Error("Invalid pattern:" + pattern + ": Only alphanumeric, '*', '.', and '-' are allowed.");
  }

  return new RegExp("^" + pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    + "$");
}


/**
 * Wrapper function that is only for type checking.
 */
function get<T>(name: ConfigName, cfg?: vscode.WorkspaceConfiguration): T | undefined {
  const udon = cfg ?? vscode.workspace.getConfiguration('udon');
  return udon.get<T>(name);
}

/**
 * read user configuration
 */
function getUserConfiguration(): UserConfig {
  const c = vscode.workspace.getConfiguration('udon');
  return {
    format: get<string>('format', c),
    execPath: get<string>('execPath', c),
    baseDirectory: get<string>('baseDirectory', c),
    defaultFileName: get<string>('defaultFileName', c),
    rule: get<any>('rule', c),
    suffixLength: get<number>('suffixLength', c),
    suffixDelimiter: get<string>('suffixDelimiter', c),
    saveInWorkspaceOnly: get<boolean>('saveInWorkspaceOnly', c),
  };
}

/**
 * Shitty Windows?
 */
function isWin(): boolean {
  return process.platform === 'win32';
}

function convertrule(replace_rule_any: any[]) {
  let replace_rule: Rule[] = [];
  for (const x of replace_rule_any) {
    if (!Array.isArray(x) || x.length != 2) {
      throw new ConfigError('rule', "invalid replace rule:  [pattern, rule]");
    }

    let [pattern, rule] = x;
    if (typeof pattern !== "string") {
      throw new ConfigError('rule', "invalid replace rule:  [pattern, rule]");
    }
    if (typeof rule !== "string") {
      throw new ConfigError('rule', "invalid replace rule:  [pattern, rule]");
    }
    try {
      const evalNode = parseExpression(rule);
      replace_rule.push({
        pattern: patternToRegex(pattern),
        evalNode: evalNode,
      });
    } catch (error) {
      throw new ConfigError('rule', error);
    }
  }
  return replace_rule;
}

function getConfiguration(uc: UserConfig, throwError: boolean): Config {

  const format0 = (uc.format ?? DEFAULT_IMAGE_FORMAT).trim();
  let format: FormatName;
  if (FORMAT.includes(format0 as any)) {
    format = format0 as any;
  } else {
    format = DEFAULT_IMAGE_FORMAT;
  }
  let exec_path = uc.execPath || "";
  exec_path = exec_path.trim();

  const base_directory_str = uc.baseDirectory || DEFAULT_BASE_DIRECTORY;
  let base_directory: EvalNode;
  try {
    base_directory = parseExpression(base_directory_str);
  } catch (error) {
    if (throwError) {
      throw new ConfigError("baseDirectory", error)
    } else {
      base_directory = DEFAULT_BASE_DIRECTORY_NODE;
    }
  }

  const base_filename_str = uc.defaultFileName || DEFAULT_BASE_FILENAME;
  let base_filename: EvalNode;
  try {
    base_filename = parseExpression(base_filename_str);
  } catch (error) {
    if (throwError) {
      throw new ConfigError("defaultFileName", error)
    } else {
      base_filename = parseExpression(DEFAULT_BASE_FILENAME);
    }
  }

  let replace_rule_any = uc.rule;
  if (!replace_rule_any || replace_rule_any.length == 0) {
    replace_rule_any = DEFAULT_REPLACE_RULE;
  }

  if (!Array.isArray(replace_rule_any)) {
    if (throwError) {
      throw new ConfigError('rule', "replace rule is not array");
    } else {
      replace_rule_any = DEFAULT_REPLACE_RULE;
    }
  }
  let replace_rule: Rule[];
  try {
    replace_rule = convertrule(replace_rule_any);
  } catch (error) {
    if (throwError) {
      throw error;
    } else {
      replace_rule = convertrule(DEFAULT_REPLACE_RULE);
    }
  }

  return {
    format: format,
    execPath: exec_path,
    baseDirectory: base_directory,
    defaultFileName: base_filename,
    rule: replace_rule,
    suffixLength: uc.suffixLength ?? DEFAULT_SUFFIXS_LENGTH,
    suffixDelimiter: uc.suffixDelimiter ?? DEFAULT_SUFFIXS_DELIMITER,
    saveInWorkspaceOnly: uc.saveInWorkspaceOnly ?? true,
  };
}


// -------------------------------------------------------------
// Udon 🍜
// -------------------------------------------------------------

interface Logger {
  log(message: string): void;
};

export class Udon implements Logger {
  context: vscode.ExtensionContext;
  config: Config;
  channel: vscode.OutputChannel;

  constructor(ctx: vscode.ExtensionContext) {
    this.context = ctx;
    this.config = getConfiguration(getUserConfiguration(), false);
    this.channel = vscode.window.createOutputChannel("udon🍜");
    this.channel.appendLine(`Extension Path: ${ctx.extension.extensionPath}`);
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        this.config = getConfiguration(getUserConfiguration(), false);
      })
    );
  }

  log(message: string): void {
    this.channel.appendLine(message);
  }

  deactivate() {
    this.channel.dispose();
  }

  get_default_bin_path() {
    return defualt_climg2base64_path(this.context.extensionPath);
  }
  get_default_bin_dir() {
    return defualt_climg2base64_dir(this.context.extensionPath);
  }

  async pasteUdon() {
    await pastaRamen(this.config, this.get_default_bin_path(), this);
  }

  async download_pre_build(show_err_msg: boolean) {
    const x = get_download_url();
    if (!x) {
      this.log("[ERROR] This OS and CPU are not supported. Please build yourself.");
      this.log("        cargo install --git https://github.com/nodamushi/climg2base64");
      if (show_err_msg) {
        vscode.window.showErrorMessage("This OS/CPU are not supported. Please build climg2base64 yourself.")
      }
      return false;
    } else {
      const dir = this.get_default_bin_dir();
      this.log(`[INFO] Download: ${x[0]} (${x[2]})`)
      this.log(`[INFO] Save directory: ${dir}`)
      try {
        vscode.window.showInformationMessage("Download climg2base64 binary.");
        let y = await download(x, dir);
        return y !== null;
      } catch (err) {
        this.log(`[ERROR] Fail to download ${x[0]}: ${err}`);
        if (show_err_msg) {
          vscode.window.showErrorMessage(`Fail to download ${x[0]}`);
        }
        return false;
      }
    }
  }

  async auto_download_pre_build() {
    if (!this.config.execPath) {
      const p = this.get_default_bin_path();
      const downloaded = await exists(p);
      if (!downloaded) {
        this.log("[INFO] Auto download pre build climg2base64 binary.");
        await this.download_pre_build(false);
      } else {
        try {
          const v = await getVersion(p)
          this.log("[INFO] climg2base64 version: " + v);
        } catch (err) {
          this.log(`[ERROR] Fail to get version: ${err}`);
        }
      }
    }
  }
}


function getRule(rules: Rule[], uri: vscode.Uri) {
  const name = basenameOfUri(uri);
  for (const r of rules) {
    if (r.pattern.test(name)) {
      return r.evalNode;
    }
  }
  return DEFAULT_RULE;
}

async function fileExists(uri: Uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    return false;
  }
}

function zeroFill(i: number, n: number): string {
  return i.toString().padStart(n, '0');
}

interface SaveImageInfo {
  path: Uri,
  max_width?: number,
  max_height?: number,
  format: FormatName,
}
const NEWLINE_TEXT = /[\r\n]/g;
const REMOVE_TEXT = /[[\r\n\t\\\]*?"<>|&%]/g;

interface ParseSelectResult {
  name?: string;
  max_width?: number;
  max_height?: number;
  format?: FormatName;
  overwrite?: boolean;
};

/**
 * parse "[image file name][,w=WIDTH][,h=HEIGHT]"
 */
function parseSelectText(text: string | null): ParseSelectResult {
  let v: ParseSelectResult = {};
  if (!text) {
    return v;
  }

  text = text.trim().replace(NEWLINE_TEXT, "");
  const texts = text.split(",");

  for (let x of texts) {
    x = x.trim();
    if (x.startsWith("w=") || x.startsWith("w:")) {
      let y = x.substring(2).trim();
      v.max_width = parseInt(y, 10);
    } else if (x.startsWith("h=") || x.startsWith("h:")) {
      let y = x.substring(2).trim();
      v.max_height = parseInt(y, 10);
    } else if (FORMAT.includes(x as any)) {
      v.format = x as any;
    } else if (x === "jpg") {
      v.format = "jpeg";
    } else {
      v.name = x.trim();
    }
  }

  if (v.name) {
    if (v.name.startsWith("?")) {
      v.overwrite = true;
    }
    let name = v.name.replace(REMOVE_TEXT, "").trim();
    let ext = path.extname(name);
    if (EXT_FORMAT[ext]) {
      v.format = EXT_FORMAT[ext];
      name = name.substring(0, name.length - ext.length);
    }

    if (name.length == 0) {
      delete v.name;
    } else {
      v.name = name;
    }
  }

  return v;
}

/**
 * return save image path, and image max_width/height.
 * @param config Config
 * @param env Eval env
 * @param selectedText Selected text on the editor
 * @param existFile Do not give a value for this argument. It is for testing purposes only.
 */
async function getSaveImagePath(
  config: Config,
  env: EvalEnv,
  selectedText: string | null,
  // for test
  existFile?: (path: Uri) => Promise<boolean>,
): Promise<SaveImageInfo> {
  const base = evalPath(config.baseDirectory, env);
  const selected = parseSelectText(selectedText);
  const format = selected.format ?? config.format;

  let name: string;
  let overwrite: boolean;
  if (!selected.name) {
    name = evalString(config.defaultFileName, env);
    overwrite = false;
  } else {
    name = selected.name;
    overwrite = selected.overwrite ?? false;
  }
  name = name.replace(REMOVE_TEXT, "");
  if (!name) {
    name = evalString(DEFAULT_BASE_FILENAME_NODE, env);
  }

  const ext = FORMAT_EXT[format];
  let path = vsuri.Utils.joinPath(base, name + ext);
  if (!overwrite) {
    let i = 1;
    const n = config.suffixLength;
    const exists = existFile ?? fileExists;
    while (await exists(path)) {
      const name2 = name + config.suffixDelimiter + zeroFill(i++, n) + ext;
      path = vsuri.Utils.joinPath(base, name2);
    }
  }

  return {
    path: path,
    max_width: selected.max_width,
    max_height: selected.max_height,
    format: format
  };
}


async function pastaRamen(config: Config, default_climg2base64: string, logger: Logger) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    logger.log("[ERROR] An active editor NOT found.");
    vscode.window.showErrorMessage("An active text editor NOT found.");
    return;
  }
  const editorUri = editor.document.uri;
  let workspace = vscode.workspace.getWorkspaceFolder(editorUri);
  if (!workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length != 0) {
    workspace = vscode.workspace.workspaceFolders[0];
  }
  let workspaceUri = workspace?.uri;
  const selection: vscode.Selection = editor.selection;
  const selectText = editor.document.getText(selection).trim();

  let env: EvalEnv = {
    date: new Date(),
    editor: editorUri,
    workspace: workspaceUri,
    workspaces: vscode.workspace.workspaceFolders?.map((x) => {
      return [x.name, x.uri]
    })
  };

  let info = await getSaveImagePath(config, env, selectText);
  logger.log(`[INFO] Image save path: ${info.path}, ${info.format}, w:${info.max_width ?? 0}, h:${info.max_height ?? 0}`);
  if (config.saveInWorkspaceOnly) {
    if (!vscode.workspace.getWorkspaceFolder(info.path)) {
      logger.log(`[ERROR] Attempted to save a file outside the workspace: ${info.path}`);
      vscode.window.showErrorMessage("Cannot save outside the workspace." + info.path.path);
      return;
    }
  }
  let execpath = config.execPath;
  logger.log(`[INFO] exec path: ${execpath}`);
  if (execpath.length == 0) {
    if (!(await exists(default_climg2base64))) {
      logger.log(`[ERRRO] climg2base64 path is not configured`);
      vscode.window.showErrorMessage("climg2base64 path is not configured");
      return;
    }
    execpath = default_climg2base64;
  }
  if (!(await exists(execpath))) {
    logger.log(`[ERRRO] exec path: ${execpath} not found.`);
    vscode.window.showErrorMessage(`${execpath} not found.`);
    return;
  }

  let resultP;
  try {
    resultP = getClipboardAsImageBase64(execpath, info.format,
      {
        width: info.max_width,
        height: info.max_height
      }
    );
  } catch (err) {
    logger.log(`[ERRRO] climg2base64 error. ${err}`);
    vscode.window.showErrorMessage(`climg2base64 error. ${err}`);
    return;
  }

  env.image = info.path;
  env.image_format = info.format;
  const rule = getRule(config.rule, editorUri);
  const text = evalString(rule, env);

  let result: Result;
  try {
    result = await resultP;
  } catch (error) {
    logger.log(`[ERROR] Fail to get clipboard ${error}`);
    vscode.window.showErrorMessage("Fail to get clipboard" + error);
    return;
  }

  if (!result.ok) {
    logger.log(`[ERROR] Fail to get clipboard image: ${result.msg}`);
    vscode.window.showErrorMessage("Failed: " + result.msg);
    return;
  }
  logger.log(`[INFO] Success.get clipboard image: ${result.msg}`);

  try {
    const buf = Buffer.from(result.base64, 'base64');
    await vscode.workspace.fs.writeFile(info.path, buf);
    logger.log(`[INFO] Success. save base64 image. ${env.image}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.log(`[ERROR] Fail to writeFle: ${error.message}, ${env.image}`);
      vscode.window.showErrorMessage("Failed: " + error.message);
    } else {
      logger.log(`[ERROR] Fail to writeFle: ${env.image}`);
      vscode.window.showErrorMessage("File save failed")
    }
    return;
  }

  logger.log(`[INFO] Insert text: ${text}`);
  editor.edit(edit => {
    if (selection.isEmpty) {
      edit.insert(selection.start, text);
    } else {
      edit.replace(selection, text);
    }
  });
}


//-------------------------------------------------------
// Download
//-------------------------------------------------------


function md5sum(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    fs.createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', (err) => reject(err));
  });
}

function get_download_url() {
  let p = os.platform();
  let name: string = p;
  const a = os.arch();
  name += "-" + a;
  if (name in PRE_BUILD) {
    return PRE_BUILD[name];
  } else {
    return null;
  }
}

function defualt_climg2base64_dir(extension_path: string) {
  return path.join(extension_path, "bin");
}

function defualt_climg2base64_path(extension_path: string) {
  if (isWin()) {
    return path.join(extension_path, "bin", "climg2base64.exe");
  } else {
    return path.join(extension_path, "bin", "climg2base64");
  }
}


function download_url(url: string, save_path: string, maxRedirects: number = 5) {
  return new Promise<string>((resolve, reject) => {
    https.get(url, (response) => {
      // Redirect check
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (maxRedirects == 0) {
          reject(new Error('Too many redirects'));
        } else if (location) {
          download_url(location, save_path, maxRedirects - 1).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirection location not provided'));
        }
        return;
      } else if (response.statusCode !== 200) {
        fs.unlink(save_path, () => {
          reject(new Error(`HTTP status code ${response.statusCode}`));
        });
        return;
      }
      const file = fs.createWriteStream(save_path);
      file
        .on('finish', () => {
          file.close();
          md5sum(save_path).then(resolve).catch(reject);
        })
        .on("error", (err) => {
          file.close();
          fs.unlink(save_path, () => reject(err));
        });
      response.pipe(file);
    }).on("error", (err) => {
      fs.unlink(save_path, () => reject(err));
    });
  });
}

async function unpack(file: string, outdir: string) {
  if (file.endsWith(".tar.gz")) {
    await tar.x({
      file: file,
      cwd: outdir
    });
  } else if (file.endsWith('.zip')) {
    await fs.createReadStream(file)
      .pipe(unzipper.Extract({ path: outdir }))
      .promise();
  }
}

function deleteFile(path: string) {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    })
  });
}

function exists(path: string) {
  return new Promise<boolean>((resolve, reject) => {
    fs.stat(path, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    })
  });
}

function mkdir(dir: string) {
  return new Promise<void>((resolve, reject) => {
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    })
  })
}

function getExtname(url: vscode.Uri) {
  if (url.path.endsWith(".tar.gz")) {
    return ".tar.gz";
  } else {
    return vsuri.Utils.extname(url);
  }
}

async function download(url_contents: [string, string, string], save_dir: string) {
  const [url, contents, md5] = url_contents;
  let u = vscode.Uri.parse(url);
  const ext = getExtname(u);
  const tmp_name = "tmp" + ext;
  const tmp_path = path.join(save_dir, tmp_name);
  if (!await exists(save_dir)) {
    await mkdir(save_dir);
  }

  const download_md5 = await download_url(url, tmp_path);
  if (download_md5 !== md5) {
    throw new Error(`${url} MD5 Error: ${md5} != ${download_md5}`);
  }
  await unpack(tmp_path, save_dir);
  await deleteFile(tmp_path);
  const output = path.join(save_dir, contents);
  if (await exists(output)) {
    return output;
  } else {
    return null;
  }
}

//-------------------------------------------------------
// Test: src/test/suite/udon.test.ts
//-------------------------------------------------------
export const __test__ = {
  Udon,
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_BASE_DIRECTORY,
  DEFAULT_BASE_FILENAME,
  DEFAULT_REPLACE_RULE,
  DEFAULT_RULE,
  getConfiguration,
  getUserConfiguration,
  ConfigError,
  getRule,
  parseSelectText,
  getSaveImagePath,
  get_download_url,
  patternToRegex,
  download,
  PRE_BUILD,
};
