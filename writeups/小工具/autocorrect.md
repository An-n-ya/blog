---
layout: doc
outline: deep
public: true
---

# Autocorrect
编程领域博客会包含大量中西文混排的内容，然而中文和英文有着完全不同的排版逻辑，虽然目前还没有标准的排版规范，但为了更舒适的阅读体验，有一些所谓 de facto 的中西文混排规范，比如英文单词、数字前后应当加空格；全角标点前后不加空格。我们当然可以手动添加这些空格，可难免有漏网之鱼，这时候就可以用到 Autocorrect 这个工具来识别所有的排版错误并更正。本篇博客来研究下这个工具是如何实现的。

## 功能简介
在命令行中可以使用`autocorrect --fix .`来修复当前目录下文件中所有的中西文混排错误。
除了命令行工具外，还可以在将 autocorrect 应用在 CI 中、浏览器插件中、或者是 git hooks 中。为了防止本博客出现中英文混排错误，我就在本博客项目的 .git 目录中加入了以下 hook：
```sh
#!/bin/bash

# 获取当前 commit 中已修改的 markdown 文件
MARKDOWN_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.md$')

# 如果没有 markdown 文件被修改，直接退出
if [ -z "$MARKDOWN_FILES" ]; then
    exit 0
fi

# 遍历每个 Markdown 文件，执行 lint 命令
for FILE in $MARKDOWN_FILES; do
    echo "Linting $FILE..."
    autocorrect --lint "$FILE"

    # 检查 lint 命令的退出状态，如果失败则终止 commit
    if [ $? -ne 0 ]; then
        echo "Linting failed for $FILE. Commit aborted."
        exit 1
    fi
done

echo "All Markdown files passed linting."
exit 0
```
这是一段 `pre-commit` 的 hook，当 autocorrect 发现有 lint 错误，就拒绝 commit。

## 实现
那么 autocorrect 是怎么实现的呢？一个很直觉的方案是使用 regex。没错，autocorrect 是使用 regex 实现的所有功能，但中西文混排中有这么多规则，它是怎么管理这些规则的呢？正则表达式是如何识别汉字的呢？下面我们深入[autocorrect](https://github.com/huacnlee/autocorrect)项目源码，看下它是如何实现的。

autocorrect 项目目录下有很多子项目，比如 `autocorrect-lsp`, `autocorrect-wasm` 等等，这些子项目是把 autocorrect 本体的能力暴露给各种各样环境的，本篇博客不关注这些，所以我们重点看目录 `autocorrect` 下的内容。

autocorrect 是一个 lib 项目，它暴露的最重要的函数就是 `autocorrect::format`，跟踪这个函数的调用链，会发现它会把字符串按`空格/换行`分成若干子字符串，然后对每个子字符串应用一系列 `RULES`，然后应用后的结果串起来变成最终的字符串输出，这里的 `RULES` 是 autocorrect 定义的全局变量数组，这个数组中包含了若干中西文混排的 regex 规则。

### 匹配汉字的正则表达式
那么匹配汉字的 regex 规则是什么样子的呢？根据 [unicode 汉字标准](https://zh.wikipedia.org/zh-hans/Wikipedia:Unicode%E6%89%A9%E5%B1%95%E6%B1%89%E5%AD%97)，汉字在 unicode 中分布很散（因为每次发布新的版本都会包含一些新汉字，这些新汉字就分本在新添加的分区中），以下是部分 unicode 汉字范围：
-    基本汉字（CJK Unified Ideographs）：范围从\u4e00 到\u9fa5。
-    扩展 A 区块（CJK Unified Ideographs Extension A）：范围从\u3400 到\u4DBF。
-    扩展 B 区块（CJK Unified Ideographs Extension B）：范围从\u20000 到\u2A6DF。
-    扩展 C 区块（CJK Unified Ideographs Extension C）：范围从\u2A700 到\u2B73F。
-    扩展 D 区块（CJK Unified Ideographs Extension D）：范围从\u2B740 到\u2B81F。
-    扩展 E 区块（CJK Unified Ideographs Extension E）：范围从\u2B820 到\u2CEAF。
-    扩展 F 区块（CJK Unified Ideographs Extension F）：范围从\u2CEB0 到\u2EBEF。
写成 regex 的话就是这样：
```regex
[\u4e00-\u9fa5]|[\u3400-\u4DBF]|[\u20000-\u2A6DF]|[\u2A700-\u2B73F]|[\u2B740-\u2B81F]|[\u2B820-\u2CEAF]|[\u2CEB0-\u2EBEF]
```
这个写法肯定不是不完备的，而且很丑陋。regex 引擎提供了一个更便捷的方式（虽然也不一定完备）： `\p{Han}` 。这里的 `\p{}` 是 regex 引擎提供的专门用来匹配 unicode 字符的规则，这个规则由 unicode 规定在[这里](https://unicode.org/reports/tr18/#Script_Property)，由于不同的语言都有自己的 regex 引擎实现，在使用这些"Script_Property"之前应看下自己语言里的 regex 引擎是否支持，autocorrect 是用 rust 语言写的，rust 语言的 regex 引擎关于 unicode 的支持文档在[这里](https://github.com/rust-lang/regex/blob/master/UNICODE.md).

从 unicode 的规范中可以看到 Han 具体包含了这些范围：
```
# Total code points: 77

# ================================================

2E80..2E99    ; Han # So  [26] CJK RADICAL REPEAT..CJK RADICAL RAP
2E9B..2EF3    ; Han # So  [89] CJK RADICAL CHOKE..CJK RADICAL C-SIMPLIFIED TURTLE
2F00..2FD5    ; Han # So [214] KANGXI RADICAL ONE..KANGXI RADICAL FLUTE
3005          ; Han # Lm       IDEOGRAPHIC ITERATION MARK
3007          ; Han # Nl       IDEOGRAPHIC NUMBER ZERO
3021..3029    ; Han # Nl   [9] HANGZHOU NUMERAL ONE..HANGZHOU NUMERAL NINE
3038..303A    ; Han # Nl   [3] HANGZHOU NUMERAL TEN..HANGZHOU NUMERAL THIRTY
303B          ; Han # Lm       VERTICAL IDEOGRAPHIC ITERATION MARK
3400..4DBF    ; Han # Lo [6592] CJK UNIFIED IDEOGRAPH-3400..CJK UNIFIED IDEOGRAPH-4DBF
4E00..9FFF    ; Han # Lo [20992] CJK UNIFIED IDEOGRAPH-4E00..CJK UNIFIED IDEOGRAPH-9FFF
F900..FA6D    ; Han # Lo [366] CJK COMPATIBILITY IDEOGRAPH-F900..CJK COMPATIBILITY IDEOGRAPH-FA6D
FA70..FAD9    ; Han # Lo [106] CJK COMPATIBILITY IDEOGRAPH-FA70..CJK COMPATIBILITY IDEOGRAPH-FAD9
16FE2         ; Han # Po       OLD CHINESE HOOK MARK
16FE3         ; Han # Lm       OLD CHINESE ITERATION MARK
16FF0..16FF1  ; Han # Mc   [2] VIETNAMESE ALTERNATE READING MARK CA..VIETNAMESE ALTERNATE READING MARK NHAY
20000..2A6DF  ; Han # Lo [42720] CJK UNIFIED IDEOGRAPH-20000..CJK UNIFIED IDEOGRAPH-2A6DF
2A700..2B739  ; Han # Lo [4154] CJK UNIFIED IDEOGRAPH-2A700..CJK UNIFIED IDEOGRAPH-2B739
2B740..2B81D  ; Han # Lo [222] CJK UNIFIED IDEOGRAPH-2B740..CJK UNIFIED IDEOGRAPH-2B81D
2B820..2CEA1  ; Han # Lo [5762] CJK UNIFIED IDEOGRAPH-2B820..CJK UNIFIED IDEOGRAPH-2CEA1
2CEB0..2EBE0  ; Han # Lo [7473] CJK UNIFIED IDEOGRAPH-2CEB0..CJK UNIFIED IDEOGRAPH-2EBE0
2EBF0..2EE5D  ; Han # Lo [622] CJK UNIFIED IDEOGRAPH-2EBF0..CJK UNIFIED IDEOGRAPH-2EE5D
2F800..2FA1D  ; Han # Lo [542] CJK COMPATIBILITY IDEOGRAPH-2F800..CJK COMPATIBILITY IDEOGRAPH-2FA1D
30000..3134A  ; Han # Lo [4939] CJK UNIFIED IDEOGRAPH-30000..CJK UNIFIED IDEOGRAPH-3134A
31350..323AF  ; Han # Lo [4192] CJK UNIFIED IDEOGRAPH-31350..CJK UNIFIED IDEOGRAPH-323AF
```

而在 autocorrect 中，把中文、日语平假名/片假名、韩语、台湾拼音合在一起定义成`\p{CJK}`。

### RULES 规则数组
了解到如何匹配 CJK unicode 字符后，我们继续看看 RULES 数组中具体包含哪些规则，这些规则定义在这里：
```rust
static ref RULES: Vec<Rule> = vec![
    // Rule: space-word
    Rule::new("space-word", word::format_space_word),
    // Rule: space-punctuation
    Rule::new("space-punctuation", word::format_space_punctuation),
    // Rule: space-bracket
    Rule::new("space-bracket", word::format_space_bracket),
    // Rule: space-dash
    Rule::new("space-dash", word::format_space_dash),
    // Rule: space-backticks
    Rule::new("space-backticks", word::format_space_backticks),
    // Rule: fullwidth
    Rule::new("fullwidth", fullwidth::format),
];
```
第一个规则 space-word 就是英文单词和数字的规则，这个 Rule 里又包含了以下 Strategy：
```rust
static ref WORD_STRATEGIES: Vec<Strategery> = vec![
    // EnglishLetter, Number
    // Avoid add space when Letter, Number has %, $, \ prefix, eg. %s, %d, $1, $2, \1, \2, \d, \r, \p ... in source code
    Strategery::new(r"\p{CJK}[^%\$\\]", r"[a-zA-Z0-9]"),
    Strategery::new(r"[^%\$\\][a-zA-Z0-9]", r"\p{CJK}"),
    // Number, -100, +100
    Strategery::new(r"\p{CJK}", r"[\-+][\d]+").with_reverse(),
    // Spcial format Letter, Number leading case, because the before Strategery can't cover eg. A 开头的 case 测试
    Strategery::new(r"^[a-zA-Z0-9]", r"\p{CJK}"),
    // 10% 中文
    Strategery::new(r"[0-9][%]", r"\p{CJK}"),
    // 300+单词，A+评分，C++中文，C#中文, 100#中文
    // The `#` can'not work, because is related to URL anchor, can't do it.
    Strategery::new(r"[a-zA-Z0-9][+#]+", r"\p{CJK}"),
];
```
每个 Strate 定义了两个 regrex 表达式，然后会根据需要在两个匹配项中间加上空格。


## 参考资料
[中西文排版差异](https://www.thetype.com/2017/08/12954/)
[unicode Script Property](https://unicode.org/reports/tr18/#Script_Property)
[rust regex 引擎对 unicode 的支持](https://github.com/rust-lang/regex/blob/master/UNICODE.md)
