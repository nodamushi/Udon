import * as assert from 'assert';
import * as c from '../../climg2base64';

const t = c.__test__;

suite('climg2base64 Test Suite', function () {

  // ------------------------------------------------------------------
  // getErrorCodeMsg - error cases
  // ------------------------------------------------------------------
  test("getErrorCodeMsg: returns empty string when error is undefined", () => {
    assert.strictEqual(t.getErrorCodeMsg(undefined), "");
  });

  test("getErrorCodeMsg: returns empty string when error.code is 0", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 0 } as any), "");
  });

  // ------------------------------------------------------------------
  // getErrorCodeMsg - edge cases
  // ------------------------------------------------------------------
  test("getErrorCodeMsg: exit code 1 → Invalid image format", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 1 } as any), "Invalid image format");
  });

  test("getErrorCodeMsg: exit code 2 → Clipboard has no image", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 2 } as any), "Clipboard has no image");
  });

  test("getErrorCodeMsg: exit code 3 → Fail to create image", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 3 } as any), "Fail to create image");
  });

  test("getErrorCodeMsg: exit code 4 → Fail to init clipboard", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 4 } as any), "Fail to init clipboard");
  });

  test("getErrorCodeMsg: unknown exit code returns generic message", () => {
    assert.strictEqual(t.getErrorCodeMsg({ code: 99 } as any), "Clipboard error: 99");
  });

});
