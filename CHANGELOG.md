# Change Log

All notable changes to the "udon" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [v0.1.2] - 2024/12/2

- Add base save directory pattern rule (`udon.baseDirectory`)
- Introduced a new settings file (`.vscode/udon.json`) to manage plugin-specific configurations. This allows separating personal environment settings from version-controlled files, ensuring only relevant configurations are tracked in Git.

## [v0.1.1] - 2024/11/24

- Support directory pattern (`udon.rule`)
    - `foo/*/*.txt`: match `foo/bar/baz.txt`
    - `foo/**/*.txt`: match `foo/bar.txt`, `foo/bar/baz.txt`, `foo/bar/baz/hoge.txt`
- Show error when config has invalid values.


## [v0.1.0] - 2024/11/24

- Initial release