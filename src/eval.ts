import * as vscode from 'vscode';
import * as vsuri from 'vscode-uri';
import * as path from 'path';

export type Uri = vsuri.URI | vscode.Uri;
type UriString = Uri | string;

export const parentOfUri = vsuri.Utils.dirname;
export const basenameOfUri = vsuri.Utils.basename;
export const extnameOfUri = vsuri.Utils.extname;
export const resolveUri = vsuri.Utils.resolvePath;
export const joinUri = vsuri.Utils.joinPath;

function asPath(uristr: UriString) {
  if (typeof uristr === "string") {
    return uristr;
  } else {
    return uristr.path;
  }
}

export interface EvalEnv {
  date: Date,
  editor?: vscode.Uri,
  workspace?: vscode.Uri,
  workspaces?: [string, vscode.Uri][],
  image?: vscode.Uri,
  image_format?: string,
}

// -------------------------------------------------------------------------------
// Node
// -------------------------------------------------------------------------------
export interface EvalNode {
  equals(x: EvalNode): boolean;
  // return debug text
  debug(): string;

  // support evalPath?
  isSupportPath(env: EvalEnv): boolean;
  // eval path
  evalPath(env: EvalEnv): UriString;
  // eval string
  evalString(env: EvalEnv): string;
}

export function evalPath(node: EvalNode, env: EvalEnv): Uri {
  const path = node.evalPath(env);
  if (typeof path === "string") {
    return resolveUri(vscode.Uri.from(
      {
        scheme: vscode.env.uriScheme,
        path: path,
      }
    ));
  } else {
    return resolveUri(path);
  }
}

export function evalString(node: EvalNode, env: EvalEnv): string {
  return node.evalString(env);
}

// -------------------------------------------------------------------------------
//  Variables
// -------------------------------------------------------------------------------
const VARIABLE_NAMES = [
  "workspaceFolder",
  "workspaceFolderBasename",
  "file",
  "fileBasename",
  "fileExtname",
  "fileBasenameNoExtension",
  "fileDirname", "fileDir",
  "fileDirnameBasename", "fileDirBasename",
  "image",
  "imageBasename",
  "imageExtname",
  "imageBasenameNoExtension",
  "imageDirname", "imageDir",
  "imageDirnameBasename", "imageDirBasename",
  "imageFormat"
] as const satisfies string[];
type VariableName = (typeof VARIABLE_NAMES)[number];

// error message
const EDITOR_NOT_FOUND = "Editor file path is not detected";
const IMAGE_NOT_FOUND = "Invalid image variable."
const WORKSPACE_NOT_FOUND = "Workspace path is not detected";

class VariableNode implements EvalNode {
  name: VariableName;
  constructor(x: string) {
    const trimed = x.trim();
    for (const y of VARIABLE_NAMES) {
      if (trimed === y) {
        this.name = trimed;
        return;
      }
    }
    throw Error(`Unkonwn Variable Name: ${trimed}`);
  }
  debug(): string {
    return "[Var: " + this.name + "]";
  }

  evalPath(env: EvalEnv): UriString {

    switch (this.name) {
      case 'file':
        if (env.editor) {
          return env.editor;
        } else {
          throw Error(EDITOR_NOT_FOUND)
        }

      case 'fileBasename':
        if (env.editor) {
          return basenameOfUri(env.editor);
        } else {
          throw Error(EDITOR_NOT_FOUND)
        }

      case 'fileBasenameNoExtension':
        if (env.editor) {
          const name = basenameOfUri(env.editor);
          const ext = path.extname(name);
          return name.substring(0, name.length - ext.length);
        } else {
          throw Error(EDITOR_NOT_FOUND);
        }

      case 'fileDir': case 'fileDirname':
        if (env.editor) {
          return parentOfUri(env.editor);
        } else {
          throw Error(EDITOR_NOT_FOUND)
        }

      case 'fileDirBasename': case 'fileDirnameBasename':
        if (env.editor) {
          return basenameOfUri(parentOfUri(env.editor));
        } else {
          throw Error(EDITOR_NOT_FOUND)
        }

      case 'fileExtname':
        if (env.editor) {
          return extnameOfUri(env.editor);
        } else {
          throw Error(EDITOR_NOT_FOUND)
        }

      case 'image':
        if (env.image) {
          return env.image;
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageBasename':
        if (env.image) {
          return basenameOfUri(env.image);
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageBasenameNoExtension':
        if (env.image) {
          const name = basenameOfUri(env.image);
          const ext = path.extname(name);
          return name.substring(0, name.length - ext.length);
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageExtname':
        if (env.image) {
          return extnameOfUri(env.image);
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageDir': case 'imageDirname':
        if (env.image) {
          return parentOfUri(env.image);
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageDirBasename': case 'imageDirnameBasename':
        if (env.image) {
          return basenameOfUri(parentOfUri(env.image));
        } else {
          throw Error(IMAGE_NOT_FOUND);
        }

      case 'imageFormat':
        return env.image_format ?? "";

      case 'workspaceFolder':
        if (env.workspace) {
          return env.workspace;
        } else {
          throw Error(WORKSPACE_NOT_FOUND);
        }

      case 'workspaceFolderBasename':
        if (env.workspace) {
          return basenameOfUri(env.workspace);
        } else {
          throw Error(WORKSPACE_NOT_FOUND);
        }

      default:
        throw new Error(this.name satisfies never);
    }
  }

  evalString(env: EvalEnv): string {
    const x = this.evalPath(env);
    if (typeof x === "string") {
      return x;
    } else {
      return x.path;
    }
  }

  isSupportPath(env: EvalEnv): boolean {
    switch (this.name) {
      case 'file':
      case 'fileBasename':
      case 'fileBasenameNoExtension':
      case 'fileDir': case 'fileDirname':
      case 'fileDirBasename': case 'fileDirnameBasename':
      case 'fileExtname':
        return !!env.editor;

      // Image is an output. Therefore, $imageX can't be used as a path.
      case 'image': case 'imageBasename': case 'imageExtname':
      case 'imageBasenameNoExtension':
      case 'imageDir': case 'imageDirname':
      case 'imageDirBasename': case 'imageDirnameBasename':
        return false;

      case 'imageFormat':
        return !!env.image_format;

      case 'workspaceFolder':
      case 'workspaceFolderBasename':
        return !!env.workspace;
      default:
        throw new Error(this.name satisfies never);
    }
  }

  equals(x: EvalNode): boolean {
    if (x === this) {
      return true;
    }
    if (x instanceof VariableNode) {
      return x.name === this.name;
    }
    return false;
  }
}


class EmptyNode implements EvalNode {
  evalPath(env: EvalEnv): UriString {
    return "";
  }
  evalString(env: EvalEnv): string {
    return ""
  }
  equals(x: EvalNode): boolean {
    return x == this || x instanceof EmptyNode;
  }
  debug(): string {
    return "[Empty]";
  }
  isSupportPath(env: EvalEnv): boolean {
    return true;
  }
}

class NodeList implements EvalNode {
  nodes: EvalNode[];
  constructor() {
    this.nodes = [];
  }

  length() {
    return this.nodes.length;
  }

  isEmpty() {
    return this.length() === 0;
  }

  debug(): string {
    let t = this.nodes.map((x) => { return x.debug() }).join(", ");
    return "[List: " + t + "]";
  }

  simplify() {
    const n = this.nodes;
    if (n.length == 0) {
      return new EmptyNode();
    } else if (n.length == 1) {
      return n[0];
    } else {
      return this;
    }
  }
  append(n: EvalNode) {
    this.nodes.push(n);
    return this;
  }

  isSupportPath(env: EvalEnv): boolean {
    for (let x of this.nodes) {
      if (!x.isSupportPath(env)) {
        return false;
      }
    }
    return true;
  }

  evalPath(env: EvalEnv): UriString {
    let x = this.nodes.map((x) => {
      return x.evalPath(env);
    });
    if (x.length == 0) {
      return "";
    } else if (x.length == 1) {
      return x[0];
    } else if (typeof x[0] === "string") {
      return x.map(asPath).join("");
    } else {
      let first = x[0];
      let path = x.map(asPath).join("");
      return vscode.Uri.from(
        {
          scheme: first.scheme,
          authority: first.authority,
          path: path,
          query: first.query,
          fragment: first.fragment
        }
      );
    }
  }

  evalString(env: EvalEnv): string {
    let x = this.nodes.map((x) => {
      return x.evalString(env);
    });
    return x.join("");
  }

  equals(x: EvalNode): boolean {
    if (x == this) {
      return true;
    }
    if (x instanceof NodeList) {
      const a = this.nodes;
      const b = x.nodes;
      if (a.length != b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!a[i].equals(b[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
}

class TextNode implements EvalNode {
  text: string
  constructor(x: string) {
    this.text = x;
  }
  debug(): string {
    return "[Text: " + this.text + "]";
  }
  evalPath(env: EvalEnv): UriString {
    return this.text;
  }
  evalString(env: EvalEnv): string {
    return this.text;
  }
  isSupportPath(env: EvalEnv): boolean {
    return true;
  }

  equals(x: EvalNode): boolean {
    if (x == this) {
      return true;
    }
    if (x instanceof TextNode) {
      return x.text === this.text;
    }
    return false;
  }
}

/**
 * ${workspace: name}
 */
class WorkspaceNode implements EvalNode {
  name: string | null;
  constructor(x?: string) {
    if (x) {
      this.name = x;
    } else {
      this.name = null;
    }
  }
  equals(x: EvalNode): boolean {
    if (x == this) return true;
    if (x instanceof WorkspaceNode) {
      return this.name === x.name;
    }
    return false;
  }

  debug(): string {
    return `[Workspace: ${this.name}]`;
  }

  isSupportPath(env: EvalEnv): boolean {
    if (!this.name) {
      return !!env.workspace;
    }

    if (env.workspaces) {
      for (const w of env.workspaces) {
        if (w[0] === this.name) return true;
      }
    }
    return false;
  }

  evalPath(env: EvalEnv): UriString {
    if (!this.name) {
      if (env.workspace) {
        return env.workspace;
      }
      return "";
    }

    if (env.workspaces) {
      for (const w of env.workspaces) {
        if (w[0] === this.name) {
          return w[1];
        }
      }
    }
    return "";
  }
  evalString(env: EvalEnv): string {
    if (!this.name) {
      if (env.workspace) {
        return env.workspace.path;
      }
      return "";
    }

    if (env.workspaces) {
      for (const w of env.workspaces) {
        if (w[0] === this.name) {
          return w[1].path;
        }
      }
    }
    return "";
  }
}
/**
 * ${date: YYYY-MM-DD}
 */
class DateNode implements EvalNode {
  pattern: string
  constructor(x: string) {
    this.pattern = x.trim();
  }

  debug(): string {
    return "[Date: " + this.pattern + "]";
  }

  equals(x: EvalNode): boolean {
    if (x instanceof DateNode) {
      return this.pattern === x.pattern;
    }
    return false;
  }

  isSupportPath(env: EvalEnv): boolean {
    return true;
  }

  evalPath(env: EvalEnv): UriString {
    return this.evalString(env);
  }

  evalString(env: EvalEnv): string {
    const date = env.date;

    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();

    const hour24 = date.getHours();
    const hour = hour24.toString();
    const hour12 = (hour24 - (hour24 < 12 ? 0 : 12)).toString();
    const am_pm = hour24 < 12 ? "AM" : "PM";

    const min = date.getMinutes().toString();
    const sec = date.getSeconds().toString();

    return this.pattern
      // Year YYYY, YYY, YY, Y
      .replace("YYYY", year)
      .replace("YYY", year.slice(-3))
      .replace("YY", year.slice(-2))
      .replace("Y", year.slice(-1))
      // Month MM, M
      .replace("MM", `0${month}`.slice(-2))
      .replace("M", month)
      // Day DD, D
      .replace("DD", `0${day}`.slice(-2))
      .replace("D", day)
      // hour HH, H, hh, h
      .replace("HH", `0${hour}`.slice(-2))
      .replace("H", hour)
      .replace("hh", am_pm + `0${hour12}`.slice(-2))
      .replace("h", `${am_pm}${hour12}`)
      // min mm, m
      .replace("mm", `0${min}`.slice(-2))
      .replace("m", min)
      // sec ss, s
      .replace("ss", `0${sec}`.slice(-2))
      .replace("s", sec);
  }
}

type RelativeSource = "image" | "image-dir" | "editor" | "editor-dir";

class RelativeNode implements EvalNode {
  source: RelativeSource;
  arg: EvalNode;
  constructor(source: RelativeSource, arg: EvalNode) {
    this.source = source;
    this.arg = arg;
  }
  isSupportPath(env: EvalEnv): boolean {
    switch (this.source) {
      // Image is an output. Therefore $relImageX can't be used as an path.
      case "image":
      case "image-dir":
        return false;

      case "editor":
      case "editor-dir":
        return true;

      default:
        throw new Error(this.source satisfies never);
    }
  }

  evalPath(env: EvalEnv): UriString {
    return this.evalString(env);
  }

  evalString(env: EvalEnv): string {
    const base = this.arg.evalPath(env);
    let target: Uri;
    switch (this.source) {
      case "image":
        if (env.image) {
          target = env.image;
        } else {
          throw new Error(IMAGE_NOT_FOUND);
        }
        break;
      case "image-dir":
        if (env.image) {
          target = parentOfUri(env.image);
        } else {
          throw new Error(IMAGE_NOT_FOUND);
        }
        break;

      case "editor":
        if (env.editor) {
          target = env.editor;
        } else {
          throw new Error(EDITOR_NOT_FOUND);
        }
        break;
      case "editor-dir":
        if (env.editor) {
          target = parentOfUri(env.editor);
        } else {
          throw new Error(EDITOR_NOT_FOUND);
        }
        break;
      default:
        throw new Error(this.source satisfies never);
    }
    let tp = target.fsPath;
    let bp: string;
    if (typeof base === "string") {
      bp = base;
    } else {
      bp = base.fsPath;
    }
    return path.relative(bp, tp).split(path.sep).join("/");
  }

  equals(x: EvalNode): boolean {
    if (x == this) {
      return true;
    }
    if (x instanceof RelativeNode) {
      return x.source === this.source && this.arg.equals(x.arg);
    }
    return false;
  }

  debug(): string {
    return `[Rel(${this.source}): ${this.arg.debug()}]`;
  }
}


// -----------------------------------------------------------
// Parser
// -----------------------------------------------------------

// generate node from variable name
function createVariable(name: string, arg: NodeList | null, parent: NodeList, original: string) {
  switch (name) {
    // ------------------------------------------------------------------------
    // ${workspace: name}
    // ------------------------------------------------------------------------
    case "workspace": {
      if (!arg || arg.isEmpty()) {
        parent.append(new WorkspaceNode());
      } else {
        const a = arg.simplify();
        if (a instanceof TextNode) {
          parent.append(new WorkspaceNode(a.text));
        } else {
          throw new Error(`Invalid format, $workspace is invalid format: ${original}`);
        }
      }
      break;
    }
    // ------------------------------------------------------------------------
    // ${date: YYYY-MM-DD}
    // ------------------------------------------------------------------------
    case "date": {
      if (!arg || arg.isEmpty()) {
        parent.append(new DateNode("YYYY-M-D"));
      } else {
        const a = arg.simplify();
        if (a instanceof TextNode) {
          parent.append(new DateNode(a.text));
        } else {
          throw new Error(`Invalid format, $date is invalid format: ${original}`);
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // ${relImage: ${workspaceFolder}/images}
    // ${relImageDir: ${workspaceFolder}/images}
    // ${relFile: ${workspaceFolder}/images}
    // ${relFileDir: ${workspaceFolder}/images}
    // ------------------------------------------------------------------------
    case "relImage":
    case "relImageDir":
    case "relFile":
    case "relFileDir": {
      let x: RelativeSource;
      switch (name) {
        case 'relImage': x = 'image'; break;
        case "relImageDir": x = 'image-dir'; break;
        case "relFile": x = 'editor'; break;
        case "relFileDir": x = 'editor-dir'; break;
        default:
          throw new Error(name satisfies never);
      }
      if (!arg || arg.isEmpty()) {
        parent.append(new RelativeNode(x, new VariableNode("fileDirname")));
      } else {
        parent.append(new RelativeNode(x, arg.simplify()));
      }
      break;
    }

    // ------------------------------------------------------------------------
    // variable
    // ------------------------------------------------------------------------
    default: {
      if (arg) {
        throw new Error(`Invalid format,  $${name}: ${original}`);
      }
      parent.append(new VariableNode(name));
    }
  }
}

/**
 * parse expression
 * @param expressoin user input expression
 */
export function parseExpression(expressoin: string): EvalNode {
  const top = new NodeList();
  parse(new TextReader(expressoin), top, false);
  return top.simplify();
}

/**
 * parser support class.
 * read code point
 */
class TextReader {

  text: string; // text
  length: number; // text.length
  cursor: number; // current read point
  marker: number; // substr marker

  constructor(text: string) {
    this.text = text;
    this.length = text.length;
    this.cursor = 0;
    this.marker = 0;
  }

  /**
   * return substring
   */
  get() {
    const f = this.marker;
    const e = this.cursor;
    if (f >= e) {
      return "";
    } else {
      return this.text.substring(f, e);
    }
  }

  /**
   * reset marker position
   */
  mark(add: number = 0) {
    this.marker = this.cursor + add;
  }

  /**
   * get() has text?
   */
  hasValue() {
    return this.marker < this.cursor;
  }

  /**
   * return next codepoint.
   * cursor is not changed.
   */
  next() {
    const idx = this.cursor;
    if (this.length == idx) {
      return undefined;
    } else {
      return this.text.codePointAt(idx);
    }
  }

  /**
   * increment cursor
   */
  skip() {
    const idx = this.cursor;
    if (this.length !== idx) {
      this.cursor = idx + 1;
    }
  }

  hasNext() {
    return this.cursor != this.length;
  }
}

const CODEa = 'a'.charCodeAt(0); // a
const CODEz = 'z'.charCodeAt(0); // z
const CODEA = 'A'.charCodeAt(0); // A
const CODEZ = 'Z'.charCodeAt(0); // Z
const CODE0 = '0'.charCodeAt(0); // 0
const CODE9 = '9'.charCodeAt(0); // 9

const CODE_DOLL = "$".codePointAt(0); // $
const CODE_LB = "}".codePointAt(0);   // }
const CODE_RB = "{".codePointAt(0);   // {
const CODE_COL = ':'.charCodeAt(0);   // :
const CODE_SP = ' '.charCodeAt(0);    // space

function isVariableChar(code: number): boolean {
  return (CODEa <= code && code <= CODEz) ||
    (CODEA <= code && code <= CODEZ) ||
    (CODE0 <= code && code <= CODE9);
}

/**
 * @param r reader
 * @param parent node list
 * @param exit_LB true: exit when "}" found.
 * @return true: OK, false: NG (exit_LB == true && "}" not found)
 */
function parse(r: TextReader, parent: NodeList, exit_LB: boolean) {
  while (r.hasNext()) {
    const c = r.next();
    if (exit_LB && c === CODE_LB) { // }

      if (r.hasValue()) {
        const text = r.get().trimEnd();
        if (text.length != 0) {
          parent.append(new TextNode(text));
        }
      }
      r.skip();
      return true;

    } else if (c === CODE_DOLL) { // $
      if (r.hasValue()) {
        parent.append(new TextNode(r.get()));
      }
      r.skip();
      let pre = r.next();

      if (!pre) { // $EOF
        parent.append(new TextNode("$"));
      } if (pre == CODE_DOLL) {
        r.skip();
        r.mark();
        parent.append(new TextNode("$"));
      } else if (pre == CODE_RB) { // ${
        r.skip();
        parseVarieble(r, parent);
        r.mark();
      } else { // $name
        r.mark();
        while (pre && isVariableChar(pre)) {
          r.skip();
          pre = r.next();
        }
        if (r.hasValue()) {
          createVariable(r.get(), null, parent, r.text);
        } else {
          parent.append(new TextNode("$"));
        }
        r.mark();
      }
    } else {
      r.skip();
    }
  }

  if (r.hasValue()) {
    parent.append(new TextNode(r.get()));
  }
  return exit_LB ? false : true;
}

// parse ${varname: arg}
function parseVarieble(r: TextReader, parent: NodeList) {
  let name: string | null = null;
  let arg: NodeList | null = null;
  let ok = false;

  r.mark();
  while (r.hasNext()) {
    const c = r.next();
    if (c === CODE_COL) { // :
      name = r.get().trim();
      arg = new NodeList();
      r.skip();
      // skip space
      let c2 = r.next();
      while (c2 === CODE_SP) {
        r.skip();
        c2 = r.next();
      }
      r.mark();
      ok = parse(r, arg, true);
      break;
    } else if (c == CODE_LB) { // }
      name = r.get().trim();
      r.skip();
      r.mark();
      ok = true;
      break;
    } else {
      r.skip();
    }
  }

  if (!ok) {
    throw new Error(`Invalid format, not closed: ${r.text}`);
  }
  if (!name || name.length == 0) {
    throw new Error(`Invalid format, variable name is empry: ${r.text}`);
  }
  createVariable(name, arg, parent, r.text);
}


//-------------------------------------------------------
// Test: src/test/suite/eval.test.ts
//-------------------------------------------------------
export const __test__ = {
  NodeList,
  TextNode,
  VariableNode,
  DateNode,
  RelativeNode,
  parseExpression,
  evalPath,
  evalString,
};
