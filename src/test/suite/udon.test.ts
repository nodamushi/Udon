import * as assert from 'assert';
import * as vscode from 'vscode';
import * as udon from '../../udon';
import * as evals from '../../eval';
import * as os from 'os';
import * as tmp from 'tmp';

const t = udon.__test__;
const et = evals.__test__;
const tmpdir = tmp.dirSync();
tmpdir.removeCallback();

function getDate(year: number, month: number, day: number, hour: number, min: number, sec: number) {
  return new Date(year, month - 1, day, hour, min, sec);
}


suite('exp Test Suite', function () {

  // test('download test', async function () {
  //   this.timeout(20000);
  //   for (const x in t.PRE_BUILD) {
  //     const y = t.PRE_BUILD[x];
  //     let z = await t.download(y, tmpdir.name);
  //     assert.notEqual(z, null);
  //   }
  // });


  test('parseSelectText', () => {
    {
      let x = t.parseSelectText(null);
      assert.deepStrictEqual(x, {});
    }
    {
      let x = t.parseSelectText("");
      assert.deepStrictEqual(x, {});
    }
    {
      let x = t.parseSelectText("w:100,h:200")
      assert.deepStrictEqual(x, { max_width: 100, max_height: 200 });
    }
    {
      let x = t.parseSelectText("?");
      assert.deepStrictEqual(x, { overwrite: true });
    }
    {
      let x = t.parseSelectText("\r\n\t<>\\*?%&|\n");
      assert.deepStrictEqual(x, {});
    }
    {
      let x = t.parseSelectText("_foobar.jpg");
      assert.deepStrictEqual(x, { name: "_foobar", format: "jpeg" });
    }
    {
      let x = t.parseSelectText("w:500, ?_foobar.png  , h=100");
      assert.deepStrictEqual(x, { overwrite: true, name: "_foobar", format: "png", max_width: 500, max_height: 100 });
    }
  });

  test("patternToRegex", () => {
    {
      let x = t.patternToRegex("*");
      for (const v of [
        "",
        "foo",
        "foo.txt",
        "foo.tar.gz"
      ]) {
        assert.equal(x.test(v), true);
      }
    }
    {
      let x = t.patternToRegex("*.tar.gz");
      for (const v of [
        "",
        "foo.txt",
        "foo.tar.gz.txt",
        "foo.gz"
      ]) {
        assert.equal(x.test(v), false, `${v} is match`);
      }
      for (const v of [
        "hoge.tar.gz",
        "foo.tar.gz.tar.gz"
      ]) {
        assert.equal(x.test(v), true, `${v} is not match`);
      }
    }
  });

  test("testRulePattern", () => {
    {
      const p = "*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        ".txt",
        "hoge.txt",
        "foo/bar/bar.txt",
        "foo/piyo/.txt",
        "foo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), true, `Pattern: ${p} != ${v}`);
      }
    }

    {
      const p = "*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "",
        "hoge.txt.piyo",
        "foo/bar.txt/piyo",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), false, `Pattern: ${p} == ${v}`);
      }
    }
    {
      const p = "foo/*/*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "foo/bar/bar.txt",
        "foo/piyo/.txt",
        "foo/piyo/taro.txt",
        "taro/foo/piyo/taro.txt",
        "ziro/taro/foo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), true, `Pattern: ${p} != ${v}`);
      }
    }
    {
      const p = "foo/*/*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "",
        "foo/bar/baz/bar.txt",
        "foo/bar/bar.txt/bar.txt",
        "barfoo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), false, `Pattern: ${p} != ${v}`);
      }
    }
    {
      const p = "foo/**/*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "foo/bar.txt",
        "foo/bar/bar.txt",
        "foo/bar/piyo/.txt",
        "foo/bar/piyo/piyo/taro.txt",
        "taro/foo/piyo/taro.txt",
        "ziro/taro/foo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), true, `Pattern: ${p} != ${v}`);
      }
    }
    {
      const p = "foo/**/*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "",
        "foobar/bar.txt",
        "barfoo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), false, `Pattern: ${p} != ${v}`);
      }
    }
    {
      const p = "**/*.txt";
      let x = t.patternToRegex(p);
      for (const v of [
        "foo/bar.txt",
        "foo/bar/bar.txt",
        "foo/bar/piyo/.txt",
        "foo/bar/piyo/piyo/taro.txt",
        "taro/foo/piyo/taro.txt",
        "ziro/taro/foo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), true, `Pattern: ${p} != ${v}`);
      }
    }
    {
      const p = "*";
      let x = t.patternToRegex(p);
      for (const v of [
        "",
        "foo/bar.txt",
        "foo/bar/bar.txt",
        "foo/bar/piyo/.txt",
        "foo/bar/piyo/piyo/taro.txt",
        "taro/foo/piyo/taro.txt",
        "ziro/taro/foo/piyo/taro.txt",
      ]) {
        assert.equal(t.testRulePattern(x, vscode.Uri.file(v)), true, `Pattern: ${p} != ${v}`);
      }
    }
  });

  test("getSaveImagePath", async () => {
    let x = await t.getSaveImagePath({
      format: "webp",
      execPath: "",
      baseDirectory: et.parseExpression("/foo/bar"),
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 2,
      suffixDelimiter: "_",
      saveInWorkspaceOnly: true
    }, {
      date: getDate(2024, 11, 24, 12, 16, 34),
    }, "w:200", async () => false);
    assert.strictEqual(x.format, "webp");
    assert.strictEqual(x.path.path, "/foo/bar/20241124121634.webp");
    assert.strictEqual(x.max_height, undefined);
    assert.strictEqual(x.max_width, 200);
  });

  test("getSaveImagePath_seq", async () => {
    let x = await t.getSaveImagePath({
      format: "jpeg",
      execPath: "",
      baseDirectory: et.parseExpression("/foo/bar"),
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 3,
      suffixDelimiter: "-",
      saveInWorkspaceOnly: true
    }, {
      date: getDate(2024, 11, 24, 12, 16, 34),
    }, "h:200", async (path: vscode.Uri) => {
      let x = path.path.split("-");
      if (x.length == 2) {
        let y = parseInt(x[1]);
        return y < 11;
      } else {
        return true;
      }
    });
    assert.strictEqual(x.format, "jpeg");
    assert.strictEqual(x.path.path, "/foo/bar/20241124121634-011.jpg");
    assert.strictEqual(x.max_height, 200);
    assert.strictEqual(x.max_width, undefined);
  });
  test("getSaveImagePath_override", async () => {
    let x = await t.getSaveImagePath({
      format: "png",
      execPath: "",
      baseDirectory: et.parseExpression("/foo/bar"),
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 3,
      suffixDelimiter: "-",
      saveInWorkspaceOnly: true
    }, {
      date: getDate(2024, 11, 24, 12, 16, 34),
    }, "h:200,?foobar", async (path: vscode.Uri) => {
      let x = path.path.split("-");
      if (x.length == 2) {
        let y = parseInt(x[1]);
        return y < 11;
      } else {
        return true;
      }
    });
    assert.strictEqual(x.format, "png");
    assert.strictEqual(x.path.path, "/foo/bar/foobar.png");
    assert.strictEqual(x.max_height, 200);
    assert.strictEqual(x.max_width, undefined);
  });

  test("getSaveImagePath_not_override", async () => {
    let x = await t.getSaveImagePath({
      format: "png",
      execPath: "",
      baseDirectory: et.parseExpression("/foo/bar"),
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 1,
      suffixDelimiter: "-",
      saveInWorkspaceOnly: true
    }, {
      date: getDate(2024, 11, 24, 12, 16, 34),
    }, "h:200,?", async (path: vscode.Uri) => {
      let x = path.path.split("-");
      if (x.length == 2) {
        let y = parseInt(x[1]);
        return y < 11;
      } else {
        return true;
      }
    });
    assert.strictEqual(x.format, "png");
    assert.strictEqual(x.path.path, "/foo/bar/20241124121634-11.png");
    assert.strictEqual(x.max_height, 200);
    assert.strictEqual(x.max_width, undefined);
  });

});