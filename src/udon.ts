import * as os from 'os';
import * as vscode from 'vscode';
import * as vsuri from 'vscode-uri';
import { basenameOfUri, EvalEnv, EvalNode, evalPath, evalString, joinUri, parentOfUri, parseExpression, Uri } from './eval';
import path = require('path');
import { getClipboardAsImageBase64, getVersion, Result } from './climg2base64';
import * as https from 'https';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as tar from 'tar';
import safeRegex from 'safe-regex2';

// -------------------------------------------------------------
// v0.3.0
// -------------------------------------------------------------
const PRE_BUILD = {
  "linux-arm64":  ["https://github.com/nodamushi/climg2base64/releases/download/v0.3.0/climg2base64-linux-aarch64.tar.gz",   "climg2base64",     "b0e499ebb735bdbc4200eadaa4979f95be959329f31f1605e8a743d460e47a94"],
  "linux-x64":    ["https://github.com/nodamushi/climg2base64/releases/download/v0.3.0/climg2base64-linux-x86_64.tar.gz",    "climg2base64",     "ce4d6b3422994b862784c5f066f80f15c16e02d35da09c0398a4a1bea8afdcb5"],
  "win32-x64":    ["https://github.com/nodamushi/climg2base64/releases/download/v0.3.0/climg2base64-windows-x86_64.tar.gz",  "climg2base64.exe", "7f10b7e3e354fabc641bcf95e56e39d7082b592c08f468fa06e7bfef7734be1d"],
  "win32-arm64":  ["https://github.com/nodamushi/climg2base64/releases/download/v0.3.0/climg2base64-windows-aarch64.tar.gz", "climg2base64.exe", "6420ee0ae39106982c7224f3b9cd7364cf1bb08833d8403e08b172656866e28d"],
  "darwin-arm64": ["https://github.com/nodamushi/climg2base64/releases/download/v0.3.0/climg2base64-macos-aarch64.tar.gz",   "climg2base64",     "109946eb2e9327d5665e565a7d0525c6711fed113cce9345756c5ed2a72e5d1b"],
} as Record<string, [string, string, string]>;

// -------------------------------------------------------------
// Plugin config file
// -------------------------------------------------------------
const PLUGIN_CONFIG_FILE = "udon.json";

// -------------------------------------------------------------
// Config
// -------------------------------------------------------------
const DEFAULT_IMAGE_FORMAT = "webp";
const DEFAULT_BASE_DIRECTORY = "${fileDirname}/image";
const DEFAULT_BASE_DIRECTORIES: string[][] = [];
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
  'baseDirectories',
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
  baseDirectories?: any,
  defaultFileName?: string,
  rule?: any,
  suffixLength?: number,
  overwriteSelect?: boolean,
  suffixDelimiter?: string,
  saveInWorkspaceOnly?: boolean,
}

export interface Config {
  format: FormatName,
  execPath: string,
  baseDirectory: EvalNode,
  baseDirectories: Rule[],
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
  if (pattern === "*" || pattern === "**") {
    return /.*/;
  }
  if (!/^[\w \[\]\(\)\*\.\-/\+\{\}\^\$]+$/.test(pattern)) {
    throw new Error("Invalid pattern:" + pattern + ": Only alphanumeric and valid path characters are allowed.");
  }
  if (/\*\*\*/.test(pattern)) {
    throw new Error("Invalid pattern:" + pattern + ": contains ***");
  }

  let result = "^";
  let i = 0;

  if (pattern.startsWith("**/")) {
    i = 3;
  }
  const isSpecialChar = (c: string) => c === '.' || c === '[' || c === ']' ||
    c === '(' || c === ')' || c === '+' ||
    c === '{' || c === '}' || c === '^' ||
    c === '$';
  const isWildDir = (i: number) => i <= pattern.length - 4 && pattern.substring(i, i + 4) === "/**/";

  while (i < pattern.length) {
    let c = pattern[i];
    if (isWildDir(i)) {
      result += "/.*";
      i += 4;
    } else if (c === '*') {
      result += "[^/\\\\]*";
      i++;
    } else if (isSpecialChar(c)) {
      result += "\\" + c;
      i++;
    } else {
      let start = i;
      i++;

      if (i < pattern.length) {
        c = pattern[i];
        while (c !== '*' && !isSpecialChar(c) && !isWildDir(i)) {
          i++;
          if (i === pattern.length) { break; }
          c = pattern[i];
        }
      }
      result += pattern.substring(start, i);
    }
  }

  result += "$";

  if (!safeRegex(result)) {
    throw new Error("Invalid pattern:" + pattern + " is not safe pattern.");
  }
  return new RegExp(result);
}

/**
 * get config value
 */
function get<T>(name: ConfigName, udon: vscode.WorkspaceConfiguration, ignoreWorkspaceConfig: boolean): T | undefined {
  if (ignoreWorkspaceConfig) {
    const value = udon.inspect(name);
    const x = value?.globalValue ?? value?.defaultValue;
    return x as T;
  }
  return udon.get<T>(name);
}

let DEBUG_ASSERTION = false; // true: test only
/**
 * Enables or disables debugging.
 *
 * @param {boolean} x - A flag to enable or disable debugging.
 *        Set to `true` to enable debugging, `false` to disable.
 */
function enableDebug(x: boolean) {
  DEBUG_ASSERTION = x;
}

/**
 * A debugging function that checks if all properties of a UserConfig object are present.
 * Throws an error if any required property is missing.
 * This function is used for debugging purposes only when debugging is enabled.
 *
 * @param {UserConfig} u - The UserConfig object to validate.
 * @returns {UserConfig} The original UserConfig object if all properties are present.
 * @throws {Error} If any required property is missing, an error is thrown.
 */
function assertFullUserConfig(u: UserConfig) {
  if (DEBUG_ASSERTION) {
    // check all config parameter
    for (const c of CONFIG_NAME) {
      if (!(c in u)) {
        throw Error(`Fatal Error: ${c} is not implemented`);
      }
    }
  }
  return u;
}

/**
 * read user configuration
 */
function getUserConfiguration(): UserConfig {
  const c = vscode.workspace.getConfiguration('udon');
  return assertFullUserConfig({
    format: get<string>('format', c, false),
    execPath: get<string>('execPath', c, true),
    baseDirectory: get<string>('baseDirectory', c, false),
    baseDirectories: get<any>('baseDirectories', c, false),
    defaultFileName: get<string>('defaultFileName', c, false),
    rule: get<any>('rule', c, false),
    suffixLength: get<number>('suffixLength', c, false),
    suffixDelimiter: get<string>('suffixDelimiter', c, false),
    saveInWorkspaceOnly: get<boolean>('saveInWorkspaceOnly', c, false),
  });
}

/**
 * Shitty Windows?
 */
function isWin(): boolean {
  return process.platform === 'win32';
}

function convertRule(replaceRuleAny: any[]) {
  let replaceRule: Rule[] = [];
  for (const x of replaceRuleAny) {
    if (!Array.isArray(x) || x.length !== 2) {
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
      replaceRule.push({
        pattern: patternToRegex(pattern),
        evalNode: evalNode,
      });
    } catch (error) {
      throw new ConfigError('rule', error);
    }
  }
  return replaceRule;
}

/**
 * Retrieves the configuration based on the given UserConfig and base configuration.
 * It validates and processes values from the UserConfig and applies defaults or values from the base configuration.
 *
 * @param {UserConfig} uc - The UserConfig object containing user-defined settings.
 * @param {boolean} throwError - Flag indicating whether to throw an error when encountering an invalid configuration.
 * @param {Config} [base] - An optional base configuration to fall back to if certain values are missing in the UserConfig.
 * @returns {Config} The resulting configuration object.
 *
 * This function handles various configuration options, such as format, execution path, base directory,
 * filename, rule, and suffix options. If any required field is missing or invalid, the function
 * will either throw an error or fall back to default or base configuration values based on the throwError flag.
 */
function getConfiguration(uc: UserConfig, throwError: boolean, base?: Config): Config {

  const format: FormatName = (uc.format && FORMAT.includes(uc.format.trim() as any))
    ? uc.format.trim() as any
    : (base?.format ?? DEFAULT_IMAGE_FORMAT);

  const execPath: string = uc.execPath ? uc.execPath.trim() :
    (base?.execPath ?? "");
    console.log(execPath);

  let baseDirectory: EvalNode;
  if (uc.baseDirectory) {
    try {
      baseDirectory = parseExpression(uc.baseDirectory);
    } catch (error) {
      if (throwError) {
        throw new ConfigError("baseDirectory", error);
      } else {
        if (base) {
          baseDirectory = base.baseDirectory;
        } else {
          baseDirectory = DEFAULT_BASE_DIRECTORY_NODE;
        }
      }
    }
  } else {
    baseDirectory = base?.baseDirectory ?? DEFAULT_BASE_DIRECTORY_NODE;
  }

  let baseDirectories: Rule[];
  if (uc.baseDirectories) {
    if (!Array.isArray(uc.baseDirectories)) {
      if (throwError) {
        throw new ConfigError('baseDirectories', "baseDirectories is not array");
      } else {
        baseDirectories = base?.baseDirectories ?? convertRule(DEFAULT_BASE_DIRECTORIES);
      }
    } else {
      try {
        baseDirectories = convertRule(uc.baseDirectories);
      } catch (error) {
        if (throwError) {
          throw error;
        } else {
          baseDirectories = base?.baseDirectories ?? convertRule(DEFAULT_BASE_DIRECTORIES);
        }
      }
    }
  } else {
    baseDirectories = base?.baseDirectories ?? convertRule(DEFAULT_BASE_DIRECTORIES);
  }

  let baseFilename: EvalNode;
  if (uc.defaultFileName) {
    try {
      baseFilename = parseExpression(uc.defaultFileName);
    } catch (error) {
      if (throwError) {
        throw new ConfigError("defaultFileName", error);
      } else {
        baseFilename = base?.defaultFileName ?? parseExpression(DEFAULT_BASE_FILENAME);
      }
    }
  } else {
    baseFilename = base?.defaultFileName ?? parseExpression(DEFAULT_BASE_FILENAME);
  }

  let replaceRule: Rule[];
  if (uc.rule) {
    if (!Array.isArray(uc.rule)) {
      if (throwError) {
        throw new ConfigError('rule', "replace rule is not array");
      } else {
        replaceRule = base?.rule ?? convertRule(DEFAULT_REPLACE_RULE);
      }
    } else {
      try {
        replaceRule = convertRule(uc.rule);
      } catch (error) {
        if (throwError) {
          throw error;
        } else {
          replaceRule = base?.rule ?? convertRule(DEFAULT_REPLACE_RULE);
        }
      }
    }
  } else {
    replaceRule = base?.rule ?? convertRule(DEFAULT_REPLACE_RULE);
  }

  const suffixLen = uc.suffixLength ?? (base?.suffixLength ?? DEFAULT_SUFFIXS_LENGTH);
  const suffixDelimiter = uc.suffixDelimiter ?? (base?.suffixDelimiter ?? DEFAULT_SUFFIXS_DELIMITER);
  const saveInWorkspace = uc.saveInWorkspaceOnly ?? (base?.saveInWorkspaceOnly ?? true);

  return {
    format: format,
    execPath: execPath,
    baseDirectory: baseDirectory,
    baseDirectories: baseDirectories,
    defaultFileName: baseFilename,
    rule: replaceRule,
    suffixLength: suffixLen,
    suffixDelimiter: suffixDelimiter,
    saveInWorkspaceOnly: saveInWorkspace,
  };
}


function getUdonJsonConfigPaths(editor?: vscode.Uri | null) {
  let paths: Uri[] = [];
  const wf = vscode.workspace.workspaceFolders;
  if (editor) {
    const { workspace } = getUriAndWorkspace(editor);
    if (workspace) {
      paths.push(joinUri(workspace.uri, ".vscode", PLUGIN_CONFIG_FILE));
    } else if (wf && wf.length === 1) {
      paths.push(joinUri(wf[0].uri, ".vscode", PLUGIN_CONFIG_FILE));
    }
  } else if (wf && wf.length === 1) {
    paths.push(joinUri(wf[0].uri, ".vscode", PLUGIN_CONFIG_FILE));
  }
  if (vscode.workspace.workspaceFile) {
    paths.push(joinUri(parentOfUri(vscode.workspace.workspaceFile), PLUGIN_CONFIG_FILE));
  }
  return paths;
}

async function loadUdonJsonConfig(uri: vscode.Uri): Promise<UserConfig | null> {
  if (!await fileExists(uri)) {
    return null;
  }
  try {
    const f = await vscode.workspace.fs.readFile(uri);
    const jsonString = Buffer.from(f).toString('utf8');
    const json = JSON.parse(jsonString);
    // ---------- Getter  -------------------------------
    type Getter<T> = (name: string) => T | undefined;
    function get<T>(name: ConfigName, f: Getter<T>) {
      return f(name) ?? f("udon." + name);
    };
    const getType = <T>(name: ConfigName, typename: string) => {
      return get<T>(name, x => {
        return (typeof json[x] === typename) ? json[x] : undefined;
      });
    };
    const getString = (name: ConfigName) => {
      return getType<string>(name, "string");
    };
    const getBoolean = (name: ConfigName) => {
      return getType<boolean>(name, "boolean");
    };
    const getNumber = (name: ConfigName) => {
      return getType<number>(name, "number");
    };
    const getAny = (name: ConfigName) => {
      return get<any>(name, x => {
        return json[x];
      });
    };
    return assertFullUserConfig({
      format: getString('format'),
      execPath: getString('execPath'),
      baseDirectory: getString('baseDirectory'),
      baseDirectories: getAny('baseDirectories'),
      defaultFileName: getString('defaultFileName'),
      rule: getAny('rule'),
      suffixLength: getNumber('suffixLength'),
      suffixDelimiter: getString('suffixDelimiter'),
      saveInWorkspaceOnly: getBoolean('saveInWorkspaceOnly'),
    });
  } catch (err) {
    console.log(`Json parse error:  ${uri.path}, ${err}`);
    throw Error(`JSON Parse error:  ${uri.path}, ${err}`);
  }
}

async function loadUdonJsonConfigs(uri: vscode.Uri[]): Promise<UserConfig | null> {
  const result: UserConfig = {};
  let count = 0;

  for (const u of uri) {
    count = 0;
    const c = await loadUdonJsonConfig(u);
    if (!c) {
      continue;
    }

    for (const n of CONFIG_NAME) {
      // ignore execPath of udon.json
      if (n === 'execPath') {
        continue;
      }

      if (n in result) {
        count += 1;
      } else if (c[n] !== undefined) {
        result[n] = c[n];
        count += 1;
      }
    }
    if (count === CONFIG_NAME.length) {
      break;
    }
  }

  return count === 0 ? null : result;
}

// -------------------------------------------------------------
// Udon 🍜
// -------------------------------------------------------------

interface Logger {
  log(message: string): void;
};

/**
 * Udon extension object
 */
export class Udon implements Logger {
  context: vscode.ExtensionContext;
  config: Config;
  channel: vscode.OutputChannel;

  constructor(ctx: vscode.ExtensionContext) {
    this.context = ctx;
    try {
      this.config = getConfiguration(getUserConfiguration(), true);
    } catch (err) {
      this.config = getConfiguration(getUserConfiguration(), false);
      this.log(`[ERROR] Config: ${err}`);
      vscode.window.showErrorMessage(`Udon🍜 configuration error: ${err}`);
    }
    this.channel = vscode.window.createOutputChannel("udon🍜");
    this.channel.appendLine(`Extension Path: ${ctx.extension.extensionPath}`);
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        try {
          this.config = getConfiguration(getUserConfiguration(), true);
        } catch (err) {
          this.config = getConfiguration(getUserConfiguration(), false);
          this.log(`[ERROR] Config: ${err}`);
          vscode.window.showErrorMessage(`Udon🍜 configuration error: ${err}`);
        }
      })
    );
  }

  log(message: string): void {
    this.channel.appendLine(message);
  }

  deactivate() {
    this.channel.dispose();
  }

  /**
   * default climg2base64 path
   */
  getDefaultBinPath() {
    return defaultClimg2base64Path(this.context.extensionPath);
  }

  /**
   * default climg2base64 directory
   */
  getDefaultBinDir() {
    return defaultClimg2base64Dir(this.context.extensionPath);
  }

  /**
   * paste image
   */
  async pasteUdon() {
    let c = this.config;
    let list = getUdonJsonConfigPaths(vscode.window.activeTextEditor?.document.uri);
    for (const l of list) {
      this.log("udon.json: " + l.path);
    }
    try {
      let c2 = await loadUdonJsonConfigs(list);
      if (c2) {
        c = getConfiguration(c2, true, c);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Udon🍜: udon.json error: ${err}`);
      return;
    }

    await pastaRamen(c, this.getDefaultBinPath(), this);
  }

  /**
   * download pre-build climg2base64
   */
  async downloadPreBuild(showErrMsg: boolean) {
    const x = getDownloadUrl();
    if (!x) {
      this.log("[ERROR] This OS and CPU are not supported. Please build yourself.");
      this.log("        cargo install --git https://github.com/nodamushi/climg2base64");
      if (showErrMsg) {
        vscode.window.showErrorMessage("This OS/CPU are not supported. Please build climg2base64 yourself.");
      }
      return false;
    } else {
      const dir = this.getDefaultBinDir();
      this.log(`[INFO] Download: ${x[0]} (${x[2]})`);
      this.log(`[INFO] Save directory: ${dir}`);
      try {
        vscode.window.showInformationMessage("Download climg2base64 binary.");
        let y = await download(x, dir);
        return y !== null;
      } catch (err) {
        this.log(`[ERROR] Fail to download ${x[0]}: ${err}`);
        if (showErrMsg) {
          vscode.window.showErrorMessage(`Fail to download ${x[0]}`);
        }
        return false;
      }
    }
  }

  /**
   * download pre-build climg2base64
   */
  async autoDownloadPreBuild() {
    if (!this.config.execPath) {
      const p = this.getDefaultBinPath();
      const downloaded = await exists(p);
      if (!downloaded) {
        this.log("[INFO] Auto download pre build climg2base64 binary.");
        await this.downloadPreBuild(false);
      } else {
        try {
          const v = await getVersion(p);
          this.log("[INFO] climg2base64 version: " + v);
        } catch (err) {
          this.log(`[ERROR] Fail to get version: ${err}`);
        }
      }
    }
  }
}

/**
 * Removes the query and fragment parts from the given Uri.
 *
 * @param {Uri} uri - The Uri from which the query and fragment will be removed.
 * @returns {Uri} A new Uri without the query and fragment.
 */
function removeQueryAndFragment(uri: Uri) {
  return vscode.Uri.from({
    scheme: uri.scheme,
    authority: uri.authority,
    path: uri.path,
  });
}

/**
 * Returns a new Uri with the specified scheme, keeping the original authority and path.
 *
 * @param {Uri} uri - The original Uri to modify.
 * @param {string} scheme - The new scheme to set for the Uri.
 * @returns {Uri} A new Uri with the updated scheme.
 */
function newSchemeUri(uri: Uri, scheme: string) {
  return vscode.Uri.from({
    scheme,
    authority: uri.authority,
    path: uri.path,
  });
}

/**
 * Returns the Uri and its corresponding workspace if available.
 *
 * @param {Uri} originalUri - The original Uri to check.
 * @returns {Object} An object containing the Uri and the workspace, if found.
 *
 * The function checks if the Uri belongs to a workspace and returns the workspace.
 * If the Uri's scheme is not "file" or "vscode-remote", it will try to change the scheme
 * and check again for a workspace.
 */
function getUriAndWorkspace(originalUri: Uri) {
  let uri = originalUri;
  let workspace = vscode.workspace.getWorkspaceFolder(uri);
  if (workspace) { return { uri, workspace }; }

  if (uri.scheme !== "file" && uri.scheme !== "vscode-remote") {
    uri = newSchemeUri(uri, "file");
    workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (workspace) { return { uri, workspace }; }

    uri = newSchemeUri(uri, "vscode-remote");
    workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (workspace) { return { uri, workspace }; }
  }

  return { uri: originalUri, workspace };
}

/**
 * Tests if the given Uri matches the provided regular expression pattern
 * by checking the current directory and its parent directories.
 *
 * @param {RegExp} pattern - The regular expression pattern to test.
 * @param {vscode.Uri} uri - The Uri to check.
 * @returns {boolean} True if the pattern matches the Uri, otherwise false.
 */
function testRulePattern(pattern: RegExp, uri: vscode.Uri) {
  let current = basenameOfUri(uri);
  let dir = parentOfUri(uri);
  while (true) {
    if (pattern.test(current)) {
      return true;
    }
    let x = basenameOfUri(dir);
    let nextdir = parentOfUri(dir);
    if (!x || dir.path === nextdir.path) {
      return false;
    }
    current = x + "/" + current;
    dir = nextdir;
  }
}

/**
 * Retrieves the EvalNode associated with the first rule that matches
 * the given Uri based on its pattern. If no rule matches, returns the default value.
 *
 * @param {Rule[]} rules - The array of rules to check.
 * @param {vscode.Uri} uri - The Uri to test against the rules.
 * @param {EvalNode} defaultValue - The default value to return if no rule matches.
 * @returns {EvalNode} The EvalNode of the matching rule or the default value.
 */
function getRule(rules: Rule[], uri: vscode.Uri, defaultValue: EvalNode) {
  for (const r of rules) {
    if (testRulePattern(r.pattern, uri)) {
      return r.evalNode;
    }
  }
  return defaultValue;
}

/**
 * Checks if the file at the given Uri exists in the workspace.
 *
 * @param {Uri} uri - The Uri of the file to check.
 * @returns {Promise<boolean>} A promise that resolves to true if the file exists, otherwise false.
 */
async function fileExists(uri: Uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Pads the number with leading zeros to ensure it has a specified length.
 *
 * @param {number} i - The number to pad.
 * @param {number} n - The desired length of the resulting string.
 * @returns {string} A string representation of the number with leading zeros.
 */
function zeroFill(i: number, n: number): string {
  return i.toString().padStart(n, '0');
}

/**
 * Represents the information required to save an image.
 *
 * @interface SaveImageInfo
 * @property {Uri} path - The path where the image will be saved.
 * @property {number} [maxWidth] - The maximum width of the image (optional).
 * @property {number} [maxHeight] - The maximum height of the image (optional).
 * @property {FormatName} format - The format of the image (e.g., jpeg, png).
 */
interface SaveImageInfo {
  path: Uri,
  maxWidth?: number,
  maxHeight?: number,
  format: FormatName,
}
const NEWLINE_TEXT = /[\r\n]/g;
const REMOVE_TEXT = /[[\r\n\t\\\]*?"<>|&%]/g;

/**
 * Represents the result of parsing a select operation for an image.
 *
 * @interface ParseSelectResult
 * @property {string} [name] - The name of the image (optional). If provided, it may be used as the file name.
 * @property {number} [maxWidth] - The maximum width of the image (optional).
 * @property {number} [maxHeight] - The maximum height of the image (optional).
 * @property {FormatName} [format] - The format of the image (e.g., jpeg, png) (optional).
 * @property {boolean} [overwrite] - Indicates whether to overwrite an existing image when saving (optional).
 */
interface ParseSelectResult {
  name?: string;
  maxWidth?: number;
  maxHeight?: number;
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
      v.maxWidth = parseInt(y, 10);
    } else if (x.startsWith("h=") || x.startsWith("h:")) {
      let y = x.substring(2).trim();
      v.maxHeight = parseInt(y, 10);
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

    if (name.length === 0) {
      delete v.name;
    } else {
      v.name = name;
    }
  }

  return v;
}

/**
 * return save image path, and image maxWidth/maxHeight.
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
  const node = env.editor ? getRule(config.baseDirectories, env.editor, config.baseDirectory) : config.baseDirectory;
  const base = removeQueryAndFragment(evalPath(node, env));
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
    maxWidth: selected.maxWidth,
    maxHeight: selected.maxHeight,
    format: format
  };
}

async function pastaRamen(config: Config, defaultClimg2base64: string, logger: Logger) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    logger.log("[ERROR] An active editor NOT found.");
    vscode.window.showErrorMessage("An active text editor NOT found.");
    return;
  }

  let { uri: editorUri, workspace } = getUriAndWorkspace(editor.document.uri);
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length !== 0) {
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
      return [x.name, x.uri];
    })
  };

  let info = await getSaveImagePath(config, env, selectText);
  logger.log(`[INFO] Image save path: ${info.path}, ${info.format}, w:${info.maxWidth ?? 0}, h:${info.maxHeight ?? 0}`);
  if (config.saveInWorkspaceOnly) {
    const { workspace: w } = getUriAndWorkspace(info.path);
    if (!w) {
      logger.log(`[ERROR] Attempted to save a file outside the workspace: ${info.path}`);
      vscode.window.showErrorMessage("Cannot save outside the workspace." + info.path.path);
      return;
    }
  }
  let execpath = config.execPath;
  logger.log(`[INFO] exec path: ${execpath}`);
  if (execpath.length === 0) {
    if (!(await exists(defaultClimg2base64))) {
      logger.log(`[ERRRO] climg2base64 path is not configured`);
      vscode.window.showErrorMessage("climg2base64 path is not configured");
      return;
    }
    execpath = defaultClimg2base64;
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
        width: info.maxWidth,
        height: info.maxHeight
      }
    );
  } catch (err) {
    logger.log(`[ERRRO] climg2base64 error. ${err}`);
    vscode.window.showErrorMessage(`climg2base64 error. ${err}`);
    return;
  }

  env.image = info.path;
  env.imageFormat = info.format;
  const rule = getRule(config.rule, editorUri, DEFAULT_RULE);
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
      vscode.window.showErrorMessage("File save failed");
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


function sha256sum(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', (err) => reject(err));
  });
}

function getDownloadUrl() {
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

function defaultClimg2base64Dir(extensionPath: string) {
  return path.join(extensionPath, "bin");
}

function defaultClimg2base64Path(extensionPath: string) {
  if (isWin()) {
    return path.join(extensionPath, "bin", "climg2base64.exe");
  } else {
    return path.join(extensionPath, "bin", "climg2base64");
  }
}


function downloadUrl(url: string, savePath: string, maxRedirects: number = 5) {
  return new Promise<string>((resolve, reject) => {
    https.get(url, (response) => {
      // Redirect check
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (maxRedirects === 0) {
          reject(new Error('Too many redirects'));
        } else if (location) {
          downloadUrl(location, savePath, maxRedirects - 1).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirection location not provided'));
        }
        return;
      } else if (response.statusCode !== 200) {
        fs.unlink(savePath, () => {
          reject(new Error(`HTTP status code ${response.statusCode}`));
        });
        return;
      }
      const file = fs.createWriteStream(savePath);
      file
        .on('finish', () => {
          file.close();
          sha256sum(savePath).then(resolve).catch(reject);
        })
        .on("error", (err) => {
          file.close();
          fs.unlink(savePath, () => reject(err));
        });
      response.pipe(file);
    }).on("error", (err) => {
      fs.unlink(savePath, () => reject(err));
    });
  });
}

async function unpack(file: string, outdir: string) {
  await tar.x({
    file: file,
    cwd: outdir
  });
}

function deleteFile(path: string) {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
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
    });
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
    });
  });
}

function getExtname(url: vscode.Uri) {
  if (url.path.endsWith(".tar.gz")) {
    return ".tar.gz";
  } else {
    return vsuri.Utils.extname(url);
  }
}

/**
 * download climg2base64 binary from GitHub, and unpack (tar.gz).
 * - `urlContents`: PRE_BUILD[x]
 * - `saveDir`: output directory
 */
async function download(urlContents: [string, string, string], saveDir: string) {
  const [url, contents, sha256] = urlContents;
  let u = vscode.Uri.parse(url);
  const ext = getExtname(u);
  const tmpName = "tmp" + ext;
  const tmpPath = path.join(saveDir, tmpName);
  if (!await exists(saveDir)) {
    await mkdir(saveDir);
  }

  const downloadSha256 = await downloadUrl(url, tmpPath);
  if (downloadSha256 !== sha256) {
    throw new Error(`${url} SHA256 Error: ${sha256} != ${downloadSha256}`);
  }
  await unpack(tmpPath, saveDir);
  await deleteFile(tmpPath);
  const output = path.join(saveDir, contents);
  if (await exists(output)) {
    return output;
  } else {
    return null;
  }
}

//-------------------------------------------------------
// Test: src/test/suite/udon.test.ts
//-------------------------------------------------------
/* eslint-disable @typescript-eslint/naming-convention -- Test-only export. TypeScript has no #[cfg(test)] equivalent, so internals are exposed via the __test__ pattern. */
export const __test__ = {
  CONFIG_NAME,
  Udon,
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_BASE_DIRECTORY,
  DEFAULT_BASE_DIRECTORY_NODE,
  DEFAULT_BASE_DIRECTORIES,
  DEFAULT_BASE_FILENAME,
  DEFAULT_BASE_FILENAME_NODE,
  DEFAULT_REPLACE_RULE,
  DEFAULT_RULE,
  DEFAULT_SUFFIXS_LENGTH,
  DEFAULT_SUFFIXS_DELIMITER,

  getConfiguration,
  getUserConfiguration,
  ConfigError,
  getRule,
  parseSelectText,
  getSaveImagePath,
  getDownloadUrl,
  patternToRegex,
  download,
  testRulePattern,
  PRE_BUILD,
  enableDebug,
  loadUdonJsonConfig,
  loadUdonJsonConfigs
};
/* eslint-enable @typescript-eslint/naming-convention */
