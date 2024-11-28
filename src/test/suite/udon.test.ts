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

function createRule(pattern: string, rule: string) {
  const p = t.patternToRegex(pattern);
  const r = et.parseExpression(rule);
  return {
    pattern: p,
    evalNode: r
  };
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


  test("getConfiguration full", () => {
    let c = t.getConfiguration({
      format: "png",
      execPath: "hoge",
      baseDirectory: "$workspaceFolder",
      baseDirectories: [
        ["*.md", "a"],
        ["*.txt", "b"]
      ],
      defaultFileName: "${date: Y}",
      rule: [
        ["*.md", "xx"],
        ["*.txt", "yy"],
      ],
      suffixLength: 2,
      suffixDelimiter: "@",
      saveInWorkspaceOnly: false,
    }, true);

    assert.equal(c.format, "png");
    assert.equal(c.execPath, "hoge");
    assert.deepEqual(c.baseDirectory, new et.VariableNode("workspaceFolder"));
    assert.deepEqual(c.baseDirectories, [
      { pattern: /^[^/\\]*\.md$/, evalNode: new et.TextNode("a") },
      { pattern: /^[^/\\]*\.txt$/, evalNode: new et.TextNode("b") }
    ]);
    assert.deepEqual(c.defaultFileName, new et.DateNode("Y"));
    assert.deepEqual(c.rule, [
      { pattern: /^[^/\\]*\.md$/, evalNode: new et.TextNode("xx") },
      { pattern: /^[^/\\]*\.txt$/, evalNode: new et.TextNode("yy") }
    ]);
    assert.equal(c.suffixLength, 2);
    assert.equal(c.suffixDelimiter, "@");
    assert.equal(c.saveInWorkspaceOnly, false);
  });

  test("getConfiguration empty", () => {
    let c = t.getConfiguration({}, true);

    assert.equal(c.format, t.DEFAULT_IMAGE_FORMAT);
    assert.equal(c.execPath, "");
    assert.deepEqual(c.baseDirectory, t.DEFAULT_BASE_DIRECTORY_NODE);
    assert.equal(c.baseDirectories.length, t.DEFAULT_BASE_DIRECTORIES.length);
    assert.deepEqual(c.defaultFileName, t.DEFAULT_BASE_FILENAME_NODE);
    assert.equal(c.rule.length, t.DEFAULT_REPLACE_RULE.length);
    assert.deepEqual(c.rule[0], { pattern: /^[^/\\]*\.md$/, evalNode: et.parseExpression("![](${relImage:${fileDirname}})") });
    assert.equal(c.suffixLength, t.DEFAULT_SUFFIXS_LENGTH);
    assert.equal(c.suffixDelimiter, t.DEFAULT_SUFFIXS_DELIMITER);
    assert.equal(c.saveInWorkspaceOnly, true);
  });

  test("getConfiguration empty rule", () => {
    let c = t.getConfiguration({
      rule: [],
      baseDirectories: []
    }, true);

    assert.equal(c.format, t.DEFAULT_IMAGE_FORMAT);
    assert.equal(c.execPath, "");
    assert.deepEqual(c.baseDirectory, t.DEFAULT_BASE_DIRECTORY_NODE);
    assert.equal(c.baseDirectories.length, t.DEFAULT_BASE_DIRECTORIES.length);
    assert.deepEqual(c.defaultFileName, t.DEFAULT_BASE_FILENAME_NODE);
    assert.equal(c.rule.length, t.DEFAULT_REPLACE_RULE.length);
    assert.deepEqual(c.rule[0], { pattern: /^[^/\\]*\.md$/, evalNode: et.parseExpression("![](${relImage:${fileDirname}})") });
    assert.equal(c.suffixLength, t.DEFAULT_SUFFIXS_LENGTH);
    assert.equal(c.suffixDelimiter, t.DEFAULT_SUFFIXS_DELIMITER);
    assert.equal(c.saveInWorkspaceOnly, true);
  });

  test("getConfiguration ignore error", () => {
    const arr: any[] = [{
      format: "jpeg",
      execPath: "hoge",
      baseDirectory: "${piyo"
    }, {
      format: "jpeg",
      execPath: "hoge",
      baseDirectories: [
        ["*.md", "${piyo"],
        ["*.txt", "${piyo"]
      ]
    }, {
      format: "jpeg",
      execPath: "hoge",
      baseDirectories: "hoge"
    }, {
      format: "jpeg",
      execPath: "hoge",
      defaultFileName: "${date: Y"
    }, {
      format: "jpeg",
      execPath: "hoge",
      rule: [
        ["*.md", "${piyo"],
        ["*.txt", "${piyo"],
      ]
    }, {
      format: "jpeg",
      execPath: "hoge",
      rule: "hoge",
    }];
    for (const x of arr) {
      const c = t.getConfiguration(x, false);
      assert.equal(c.format, "jpeg");
      assert.equal(c.execPath, "hoge");
      assert.deepEqual(c.baseDirectory, t.DEFAULT_BASE_DIRECTORY_NODE);
      assert.equal(c.baseDirectories.length, t.DEFAULT_BASE_DIRECTORIES.length);
      assert.deepEqual(c.defaultFileName, t.DEFAULT_BASE_FILENAME_NODE);
      assert.equal(c.rule.length, t.DEFAULT_REPLACE_RULE.length);
      assert.deepEqual(c.rule[0], { pattern: /^[^/\\]*\.md$/, evalNode: et.parseExpression("![](${relImage:${fileDirname}})") });
      assert.equal(c.suffixLength, t.DEFAULT_SUFFIXS_LENGTH);
      assert.equal(c.suffixDelimiter, t.DEFAULT_SUFFIXS_DELIMITER);
      assert.equal(c.saveInWorkspaceOnly, true);
    }
  });


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
      baseDirectories: [],
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
      baseDirectories: [],
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
      baseDirectories: [],
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 3,
      suffixDelimiter: "-",
      saveInWorkspaceOnly: true
    }, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/foo/bar.txt")
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
      baseDirectories: [],
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


  test("getSaveImagePath with baseDirectories 1", async () => {
    let config = {
      format: "jpeg" as const,
      execPath: "",
      baseDirectory: et.parseExpression("/foo/bar"),
      baseDirectories: [
        createRule("foo/*/*.md", "/y"),
        createRule("foo/**/*.md", "/a"),
        createRule("bar/*.txt", "/z"),
        createRule("foo/*.txt", "${date: YYYY }"),
        createRule("*.md", "/x"),
      ],
      defaultFileName: et.parseExpression("${date: YYYYMMDDHHmmss}"),
      rule: [{ pattern: t.patternToRegex("*"), evalNode: et.parseExpression("hoge") }],
      suffixLength: 3,
      suffixDelimiter: "-",
      saveInWorkspaceOnly: true
    };
    let x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/foo/bar.txt")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "2024/20241124121634.jpg");

    x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/foo/bar.md")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "/a/20241124121634.jpg");

    x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/piyo/bar.md")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "/x/20241124121634.jpg");

    x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/foo/piyo/bar.md")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "/y/20241124121634.jpg");

    x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("/foo/fuga/piyo/bar.md")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "/a/20241124121634.jpg");

    x = await t.getSaveImagePath(config, {
      date: getDate(2024, 11, 24, 12, 16, 34),
      editor: vscode.Uri.file("abc/def/bar.ts")
    }, "", async () => { return false; });
    assert.strictEqual(x.path.path, "/foo/bar/20241124121634.jpg");

  });

});