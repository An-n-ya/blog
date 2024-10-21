---
layout: doc
outline: deep
---

# Bear 工作原理

[Bear](https://github.com/rizsotto/Bear?tab=readme-ov-file) 是用来生成`compilation database`的工具，这个 `compilation database` 是什么，我们为何需要它呢？

## Compilation Database

[Compilation Database](https://clang.llvm.org/docs/JSONCompilationDatabase.html) 是 Clang 项目中的一个规范，该规范规定了一种 JSON 文件格式，这个文件包含了编译系统编译整个项目所必须的信息，具体包含了哪些信息呢？该 JSON 文件由一个 JSON 数组构成，数组中每个 entry 对应着项目中的一个文件，每个 entry 包含以下信息：

- 文件路径
- 文件名
- 编译指令
- 编译参数
- 编译输出文件名

这些信息对编译系统十分重要，通过这些信息，编译系统可以知道每个文件该如何编译、系统的依赖关系。可问题是编译系统不应该直接由 `make` 或 `CMake` 这样的工具调用么，为什么还额外需要一个 JSON 文件。原因在于 `make` 这样的工具是调用编译器编译出目标文件的，而现代编译器不止提供了编译成目标文件的功能，现代编译器还额外提供了许许多多代码分析功能，比如：代码格式化、调用链分析、符号重命名等等。使用这些功能的前提是，编译系统必须了解每个文件是如何编译的。

就比如说，有一个`gtk` 项目，在 makefile 中我们需要指明必要的编译器 flags , 比如`-lgtk`，如果我们想用 clangd 代码高亮该项目，clangd 就必须得知道这个编译器 flags ，这样它才能分析到具体的 library，从而确定每个变量的定义。而 compilation database 就是 clang 规定的用来向编译器传达信息的文件格式。

下面来看一些具体的例子来体会 Compilation Database 的作用

### 静态分析

假如有以下代码：

<<< ./div.c{c:line-numbers{7}}

注意到第 7 行有一个除零错误，编译器在编译期就应该知道变量 z 在第七行时等于 0，所以像 `clang-check` 这样的静态分析软件应该会对这段程序有所反映。但在我们执行了 `clang-check -analyze div.c --` 之后并没有任何警告。
::: info
在当前目录下没有Compilation Database的情况下使用 `cargo-check` 必须加上参数 `--` 。
:::
没有警告的原因是默认情况下 `FOO` 变量未定义，在编译的“宏展开阶段”中，第 7 行代码被忽略了，所以 `clang-check` 没有抱怨这段代码，我们可以加上 FOO 的定义试试:
```sh 
> clang-check -analyze div.c -- -DFOO
/home/annya/blog/writeups/bear/div.c:7:16: warning: Division by zero [core.DivideZero]
        return DODIV(1, z);
               ^~~~~~~~~~~
/home/annya/blog/writeups/bear/div.c:2:26: note: expanded from macro 'DODIV'
#define DODIV(a, b) ((a) / (b))
                     ~~~~^~~~~
1 warning generated.
```
这时候就有警告信息了。如果我希望编译系统检验上述两种情况，就必须让编译系统知道对应的 flags 。这时候就可以用到 Compilation Database 了。我们定义如下文件`compile_commands.json`:

<<< ./compile_commands.json{json}

再次运行 `clang-check` ，这次不用加最后的 `--`：

```sh 
> clang-check -analyze div.c
div.c:7:16: warning: Division by zero [core.DivideZero]
        return DODIV(1, z);
               ^~~~~~~~~~~
div.c:2:26: note: expanded from macro 'DODIV'
#define DODIV(a, b) ((a) / (b))
                     ~~~~^~~~~
1 warning generated.
```

至此我们知道了 Compilation Database 的作用，但这个文件如何生成呢？需要自己敲出来么？

### 生成Compilation Database
手敲当然可以，但肯定是不现实的。像 `CMake` 这样的工具可以自动生成呢个 `compile_commands.json` 文件，而 `GNUMake` 这样的老古董是不能自动生成 Compilation Database 的，这时候我们就可以依靠 Bear 工具来自动生成编译数据库。
Bear 的使用方法很直接，如果原来的编译指令是 `make` , 那么只需要执行 `bear -- make` 便可以生成 `compile_commands.json` 了。

## Bear 的原理
Bear 的思路是这样的，既然 makefile 已经知道该如何编译整个项目了，那么 Bear 只需要**截取** makefile 调用的每一条编译指令，通过分析这些编译指令就可以构建出 `compile_commands.json` 了。
问题是，该如何**截取**呢？在 Linux 系统中可以使用 `LD_PRELOAD` 环境变量加载 bear 的动态库，在这个动态库中 `execvp` 这样的运行其他程序（比如运行编译器 gcc ）的系统函数会被“重载”，Bear 会在自己的动态库中记录调用过的所有编译指令，并且继续调用原始的 execvp 指令，在记录了所有的编译指令后，Bear 就掌握了充分的信息来构建 `compile_commands` 。

通过下面的这段示例代码来了解这个过程具体是如何运作的：

<<< ./hook_execvp.c

:::info
`dlsym` 是一个用于在运行时从共享库（动态链接库）中查找符号（通常是函数或全局变量）的函数，通常用于实现动态加载库的功能。该函数的第一个参数是 `dlopen` 函数返回的句柄，用来查找 `dlopen` 函数打开的共享库中的符号。这里使用的 `RTLD_NEXT` 是一个特殊句柄，用来查找当前库之后的库中的符号，该句柄通常用在动态库中的重载系统函数中。
:::

将该文件编译成动态库:
```sh
gcc -shared -fPIC -o hook_execp.so hook_execvp.c -ldl
```
- `shared`：生成动态库
- `fPIC`：生成位置无关代码
- `ldl`：链接动态库支持

使用该动态库劫持 gcc 指令:
```sh
> LD_PRELOAD=./hook_execvp.so gcc -o hello hello.c
Intercepted command: as as --64 -o /tmp/ccGnhoSF.o /tmp/ccBOaTyw.s
Intercepted command: /usr/bin/ld /usr/bin/ld -plugin ...
```
注意到，gcc 指令调用了另外两个指令 `as` 和 `ld` ，分别用来编译汇编文件和链接。

## Bear 的实现
Bear 中在[这里](https://github.com/rizsotto/Bear/blob/777954d4c2c1fc9053d885c28c9e15f903cc519a/source/intercept/source/report/libexec/lib.cc#L160)重载了 `execvpe` 系统函数。


## 参考资料
- [Compilation databases for Clang-based tools](https://eli.thegreenplace.net/2014/05/21/compilation-databases-for-clang-based-tools)

