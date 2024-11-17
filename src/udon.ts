import * as vscode from 'vscode';
import * as vsuri from 'vscode-uri';
import { basenameOfUri, EvalEnv, EvalNode, evalPath, evalString, parseExpression, Uri } from './eval';
import path = require('path');
import { getClipboardAsImageBase64, Result } from './clip';

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
  const exec_path = uc.execPath || (isWin() ? "climg2base64.exe" : "climg2base64");

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

  async pasteUdon() {
    await pastaRamen(this.config, this);
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
/**
 * parse "[image file name][,w=WIDTH][,h=HEIGHT]"
 */
function parseSelectText(text: string | null) {
  if (!text) {
    return {};
  }
  text = text.trim().replace(NEWLINE_TEXT, "");
  const texts = text.split(",");

  let name: string | undefined = undefined;
  let max_width: number | undefined = undefined;
  let max_height: number | undefined = undefined;
  let format: FormatName | undefined = undefined;
  let overwrite: boolean | undefined = undefined;
  for (let x of texts) {
    x = x.trim();
    if (x.startsWith("w=") || x.startsWith("w:")) {
      let y = x.substring(2).trim();
      max_width = parseInt(y, 10);
    } else if (x.startsWith("h=") || x.startsWith("h:")) {
      let y = x.substring(2).trim();
      max_height = parseInt(y, 10);
    } else if (FORMAT.includes(x as any)) {
      format = x as any;
    } else if (x === "jpg") {
      format = "jpeg";
    } else {
      name = x.trim();
    }
  }

  if (name) {
    if (name.startsWith("?")) {
      overwrite = true;
    }
    name = name.replace(REMOVE_TEXT, "").trim();
    let ext = path.extname(name);
    if (EXT_FORMAT[ext]) {
      format = EXT_FORMAT[ext];
      name = name.substring(0, name.length - ext.length);
    }
  }

  return {
    name: name,
    max_width: max_width,
    max_height: max_height,
    format: format,
    overwrite: overwrite
  }
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


async function pastaRamen(config: Config, logger: Logger) {
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
    workspaces: vscode.workspace.workspaceFolders?.map((x)=> {
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
  logger.log(`[INFO] exec path: ${config.execPath}`);
  let resultP = getClipboardAsImageBase64(info.format,
    {
      command: config.execPath,
      width: info.max_width,
      height: info.max_height
    }
  );


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
};
