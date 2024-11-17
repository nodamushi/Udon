import { execFile, ExecFileException } from "child_process";


export interface Result {
  ok: boolean,
  base64: string,
  msg: string,
  file_path: string,
  format: string,
}

/**
 * climg2base64 error code to message
 */
function getErrorCodeMsg(error?: ExecFileException) {
  if (error) {
    switch (error.code ?? 0) {
      case 0: return "";
      case 1: return "Invalid image format";
      case 2: return "Clipboard has no image";
      case 3: return "Fail to create image";
      default: return "Clipboard error: " + error.code;
    }
  }
  return "";
}


/**
 * async run climg2base64
 */
export function getClipboardAsImageBase64(
  format: string,
  option: {
    command?: string,
    width?: number,
    height?: number,
    maxBufferMB?: number,
  }): Promise<Result> {

  const cmd = option.command || "climg2base64";
  const maxBufferMB = option.maxBufferMB || 128;
  let arg = [
    format,
    "--stderr-path",
  ];
  const w = (option.width ?? 0) | 0;
  const h = (option.height ?? 0) | 0;
  if (w >= 1) {
    arg.push("-w");
    arg.push(`${w}`);
  }
  if (h >= 1) {
    arg.push("-h");
    arg.push(`${h}`);
  }

  return new Promise<Result>(resolve => execFile(cmd, arg, {
    maxBuffer: maxBufferMB * 1024 * 1024
  },(error, stdout, stderr) => {
    if (error !== null && error.code !== 0) {
      resolve({
        ok: false,
        base64: "",
        msg: getErrorCodeMsg(error),
        file_path: "",
        format: format,
      });
    } else {
      resolve({
        ok: true,
        base64: stdout,
        msg: "OK",
        file_path: stderr,
        format: format,
      });
    }
  }))
}