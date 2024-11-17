import * as assert from 'assert';
import * as vscode from 'vscode';
import * as exp from '../../eval';

const t = exp.__test__;

suite('exp Test Suite', () => {
  // vscode.window.showInformationMessage('Start all tests.');

  test('equals', () => {
    assert.equal(new t.TextNode("xyz").equals(new t.TextNode("xyz")), true);
    assert.equal(new t.TextNode("xyz").equals(new t.TextNode("xyzz")), false);
    assert.equal(new t.TextNode("file").equals(new t.VariableNode("file")), false);
    assert.equal(new t.VariableNode("file").equals(new t.VariableNode("file")), true);
    assert.equal(new t.VariableNode("file").equals(new t.VariableNode("  file  ")), true);
    assert.equal(new t.VariableNode("file").equals(new t.VariableNode("fileBasename")), false);
    assert.equal(new t.DateNode("YYYY-MM-DD").equals(new t.DateNode("YYYY-MM-DD")), true);
    assert.equal(new t.DateNode("YYYY-MM-DD").equals(new t.DateNode("  YYYY-MM-DD  ")), true);
    assert.equal(new t.DateNode("YYYY-MM-DD").equals(new t.DateNode("yyyy-mm-dd")), false);

    const l1 = new t.NodeList();
    const l2 = new t.NodeList();
    const l3 = new t.NodeList();
    const l4 = new t.NodeList();

    l1.append(new t.TextNode("aaa"));
    l2.append(new t.TextNode("aaa"));
    l3.append(new t.TextNode("aaa"));
    l3.append(new t.TextNode("aaa"));

    l1.append(new t.VariableNode("file"));
    l2.append(new t.VariableNode("file"));
    l3.append(new t.TextNode("file"));
    l4.append(new t.VariableNode("file"));

    l1.append(new t.TextNode("ccc"));
    l2.append(new t.TextNode("ccc"));
    l3.append(new t.TextNode("ccc"));

    assert.equal(l1.equals(l1), true);
    assert.equal(l1.equals(l2), true);
    assert.equal(l1.equals(l3), false);
    assert.equal(l1.equals(l4), false);
  });

  test('simple text parse', () => {
    const p = "foobar";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.TextNode("foobar")), true, `${p}: ${ret.debug()}`);
  });
  test('simple variable parse', () => {
    const p = "$imageFormat";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.VariableNode("imageFormat")), true, `${p}: ${ret.debug()}`);
  });
  test('simple variable path parse', () => {
    const p = "[$file/${ workspaceFolder }]()";
    const ret = t.parseExpression(p);
    const l = new t.NodeList();
    l.append(new t.TextNode("["))
      .append(new t.VariableNode("file"))
      .append(new t.TextNode("/"))
      .append(new t.VariableNode("workspaceFolder"))
      .append(new t.TextNode("]()"));

    assert.equal(ret.equals(l), true, `${p}: ${ret.debug()}`);
  });
  test('simple variable{} parse 1', () => {
    const p = "${workspaceFolderBasename}";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.VariableNode("workspaceFolderBasename")), true, `${p}: ${ret.debug()}`);
  });
  test('simple variable{} parse 2', () => {
    const p = "${    fileBasename    }";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.VariableNode("fileBasename")), true, `${p}: ${ret.debug()}`);
  });
  test('date parse 1', () => {
    const p = "$date";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.DateNode("YYYY-M-D")), true, `${p}: ${ret.debug()}`);
  });
  test('date parse 2', () => {
    const p = "${date}";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.DateNode("YYYY-M-D")), true, `${p}: ${ret.debug()}`);
  });
  test('date parse 3', () => {
    const p = "${date: YYYY-DD-MM hh-mm-ss }";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.DateNode("YYYY-DD-MM hh-mm-ss")), true, `${p}: ${ret.debug()}`);
  });

  test('relImg parse 1', () => {
    const p = "$relImage";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.RelativeNode("image", new t.VariableNode("file"))), true, `${p}: ${ret.debug()}`);
  });

  test('relImg parse 2', () => {
    const p = "${relImage}";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.RelativeNode("image", new t.VariableNode("file"))), true, `${p}: ${ret.debug()}`);
  });

  test('relImg parse 3', () => {
    const p = "${relImage: ${workspaceFolder}/img }";
    const ret = t.parseExpression(p);
    const l = new t.NodeList();
    l.append(new t.VariableNode("workspaceFolder"))
      .append(new t.TextNode("/img"));
    assert.equal(ret.equals(new t.RelativeNode("image", l)), true, `${p}: ${ret.debug()}`);
  });

  test('relImg parse 4', () => {
    const p = "${relImage: ${workspaceFolder} }";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.RelativeNode("image", new t.VariableNode("workspaceFolder"))), true, `${p}: ${ret.debug()}`);
  });

  test('relImg parse 5', () => {
    const p = "${relImage:  }";
    const ret = t.parseExpression(p);
    assert.equal(ret.equals(new t.RelativeNode("image", new t.VariableNode("file"))), true, `${p}: ${ret.debug()}`);
  });

  test('evalString date YYYY-MM-DD hh/mm/ss', () => {
    const d = new t.DateNode("YYYY-MM-DD hh/mm/ss");
    {
      let year = 2024;
      let month = 2;
      let day = 9;
      let hour = 4;
      let min = 2;
      let sec = 3;
      let path = t.evalString(d, {
        date: new Date(year, month - 1, day, hour, min, sec),
      });
      assert.equal(path, "2024-02-09 AM04/02/03");
    }
    {
      let year = 2024;
      let month = 10;
      let day = 20;
      let hour = 11;
      let min = 15;
      let sec = 33;
      let path = t.evalString(d, {
        date: new Date(year, month - 1, day, hour, min, sec),
      });
      assert.equal(path, "2024-10-20 AM11/15/33");
      hour = 22;
      path = t.evalString(d, {
        date: new Date(year, month - 1, day, hour, min, sec),
      });
      assert.equal(path, "2024-10-20 PM10/15/33");
      hour = 20;
      path = t.evalString(d, {
        date: new Date(year, month - 1, day, hour, min, sec),
      });
      assert.equal(path, "2024-10-20 PM08/15/33");
    }
  });

  test('evalString date YYY-M-D h/m/s', () => {
    const d = new t.DateNode("YYY-M-D h/m/s");

    let year = 2024;
    let month = 2;
    let day = 9;
    let hour = 4;
    let min = 2;
    let sec = 3;
    let path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "024-2-9 AM4/2/3");

    month = 10;
    day = 20;
    hour = 10;
    min = 20;
    sec = 30;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "024-10-20 AM10/20/30");

    hour = 12;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "024-10-20 PM0/20/30");

    hour = 22;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "024-10-20 PM10/20/30");

  });

  test('evalString date YY HH', () => {
    const d = new t.DateNode("YY HH");
    let year = 2024;
    let month = 2;
    let day = 9;
    let hour = 4;
    let min = 2;
    let sec = 3;
    let path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "24 04");
    hour = 10;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "24 10");
    hour = 12;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "24 12");
    hour = 23;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "24 23");
  });
  test('evalString date Y H', () => {
    const d = new t.DateNode("Y H");
    let year = 2024;
    let month = 2;
    let day = 9;
    let hour = 4;
    let min = 2;
    let sec = 3;
    let path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "4 4");
    hour = 23;
    path = t.evalString(d, {
      date: new Date(year, month - 1, day, hour, min, sec),
    });
    assert.equal(path, "4 23");
  });

  test('evalPath image/${date: YYYY/MM/DD/HH/mm/ss/}../foo/bar',() => {
    let e = t.parseExpression("image/${date: YYYY/MM/DD/HH/mm/ss/}../foo/bar");
    let year = 2024;
    let month = 2;
    let day = 9;
    let hour = 4;
    let min = 2;
    let sec = 3;
    let env = {
      date: new Date(year, month - 1, day, hour, min, sec),
    };
    let path = t.evalPath(e, env);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(path.path, "image/2024/02/09/04/02/foo/bar");
  });

  test('eval Variables', ()=> {
    let env = {
      date: new Date(),
      workspace: vscode.Uri.file("/foo/bar/workspace"),
      editor: vscode.Uri.file("/foo/bar/workspace/src/hoge/text.txt"),
      image: vscode.Uri.file("/foo/bar/workspace/img/hoge/fuga.webp"),
      image_format: "jpeg",
    };
    let p = "${workspaceFolder}";
    let e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "/foo/bar/workspace", p);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace", p);

    p = "${workspaceFolderBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "workspace", p);
    assert.equal(t.evalString(e, env), "workspace", p);

    p = "${file}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "/foo/bar/workspace/src/hoge/text.txt", p);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/src/hoge/text.txt", p);

    p = "${fileBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "text.txt", p);
    assert.equal(t.evalString(e, env), "text.txt", p);

    p = "${fileExtname}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, ".txt", p);
    assert.equal(t.evalString(e, env), ".txt", p);

    p = "${fileDirname}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "/foo/bar/workspace/src/hoge", p);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/src/hoge", p);
    p = "${fileDir}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "/foo/bar/workspace/src/hoge", p);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/src/hoge", p);

    p = "${fileDirnameBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "hoge", p);
    assert.equal(t.evalString(e, env), "hoge", p);
    p = "${fileDirBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalPath(e, env).path, "hoge", p);
    assert.equal(t.evalString(e, env), "hoge", p);

    p = "${image}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/img/hoge/fuga.webp", p);

    p = "${imageBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "fuga.webp", p);

    p = "${imageExtname}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), ".webp", p);

    p = "${imageDirname}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/img/hoge", p);

    p = "${imageDir}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "/foo/bar/workspace/img/hoge", p);

    p = "${imageDirnameBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "hoge", p);
    p = "${imageDirBasename}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(t.evalString(e, env), "hoge", p);

    p = "${imageFormat}";
    e = t.parseExpression(p);
    assert.equal(e.isSupportPath(env), true);
    assert.equal(t.evalString(e, env), "jpeg", p);

  })

  test('evalString [$imageBasename, $imageFormat](${relImage: ${workspaceFolder}})', () => {
    let e = t.parseExpression("[$imageBasename, $imageFormat](${relImage: ${workspaceFolder}})");
    let env = {
      date: new Date(),
      workspace: vscode.Uri.file("/foo/bar/workspace"),
      editor: vscode.Uri.file("/foo/bar/workspace/src/hoge/text.txt"),
      image: vscode.Uri.file("/foo/bar/workspace/img/hoge/fuga.webp"),
      image_format: "webp",
    };
    let text = t.evalString(e, env);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(text, "[fuga.webp, webp](img/hoge/fuga.webp)");

    env.image = vscode.Uri.file("/foo/img/piyo/taro.jpg");
    env.image_format = "jpeg";
    text = t.evalString(e, env);
    assert.equal(e.isSupportPath(env), false);
    assert.equal(text, "[taro.jpg, jpeg](../../img/piyo/taro.jpg)");
  });

});
