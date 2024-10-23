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
手敲当然可以，但肯定是不现实的。像 `CMake` 这样的工具可以自动生成 `compile_commands.json` 文件，而 `GNUMake` 这样的老古董是不能自动生成 Compilation Database 的，这时候我们就可以依靠 Bear 工具来自动生成编译数据库。
Bear 的使用方法很直接，如果原来的编译指令是 `make` , 那么只需要执行 `bear -- make` 便可以生成 `compile_commands.json` 了。

::: warning
TODO: 介绍 Compliation Database 在代码生成、依赖图等方面对编译系统的作用
:::

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

### 从Bear的源码开始
#### 下载并编译Bear项目
1. 下载源码
```sh
> git clone https://github.com/rizsotto/Bear
```
2. 编译源码
Bear依赖一些第三方库：`spdlog`, `fmt`, `gRPC`, `json`，如果系统中没有这些库的话，Bear会在构建过程中编译这些库，其中spdlog库的编译挺花时间的，如果你想节省编译时间，可以提前在系统中安装这些包。
根据官方[编译文档](https://github.com/rizsotto/Bear/blob/master/INSTALL.md)使用下面的命令编译
```sh
cmake -DENABLE_UNIT_TESTS=OFF -DENABLE_FUNC_TESTS=OFF -DCMAKE_INSTALL_LIBDIR=lib/x86_64-linux-gnu build
make all
make install
```
为了方便后面用vim浏览代码，我们需要生成`compile_commands.json`（这也正是Bear项目存在的目的），`CMake`是默认支持生成`Compilation Database`的，只需要加上flag：`-DCMAKE_EXPORT_COMPILE_COMMANDS=1`即可，但如果你只是在上面的编译指令中加入这个flag，会发现没有生成`compile_commands.json`。为了了解具体如何生成`compile_commands.json`，我们需要深入Bear项目的编译系统。

3. 生成 Bear 项目的`compile_commands.json`
Bear项目根目录由以下部分组成：

- `rust/`: Bear项目正在向Rust语言迁移，目前Bear项目还没有用到Rust代码，所以这里的内容我们可以忽略
- `source`: Bear项目的主体
    - `bear`: 1. 程序入口，`main.c`所在地。 2. 定义`libmain`中`Application`的子类。
    - `citnames`: 解析`intercept`获取到的指令
    - `intercept`: 用于截获编译指令
    - `libflags`: 处理 bear 指令的 flags
    - `libmain`: 定义入口函数的行为，后面会讲
    - `libresult`: 定义类似rust的返回值类型`Result`
    - `libshell`: 处理shell命令字符串
    - `libsys`: 操作系统抽象层，定义了路径、进程、信号等抽象
    - `CMakeLists.txt`: Bear项目主体的CMake文件
- `test`: 测试集，可暂时忽略
- `third_party`: 第三方依赖，由一些CMakeLists组成，用来告诉CMake如何下载、编译第三方库
- `CMakeLists.txt`: 根目录下的CMake文件

进入到Bear项目根目录下的`CMakeLists.txt`，这个文件的头几行检查并安装了必要的第三 方库，最重要的部分是[这里](https://github.com/rizsotto/Bear/blob/777954d4c2c1fc9053d885c28c9e15f903cc519a/CMakeLists.txt#L49-L90), 使用[`ExternalProject_Add`](https://cmake.org/cmake/help/latest/module/ExternalProject.html)命令构建Bear项目本身，`ExternalProject_Add`相当于额外执行了一次cmake，本身是不受原先cmake指令里flags的影响的，所以我们在根目录下设置cmake的`-DCMAKE_EXPORT_COMPILE_COMMANDS`是不会影响到BearSource项目的。
解决方案很简单就是在`ExternalProject_Add`指令中加上`-DCMAKE_EXPORT_COMPILE_COMMANDS`指令即可：
:::code-group
```cmake [CMakeLists.txt]
ExternalProject_Add(BearSource
        SOURCE_DIR
            "${CMAKE_CURRENT_SOURCE_DIR}/source"
        DEPENDS
            nlohmann_json_dependency
            fmt_dependency
            spdlog_dependency
            grpc_dependency
            googletest_dependency
        CMAKE_ARGS
            -DENABLE_UNIT_TESTS:BOOL=${ENABLE_UNIT_TESTS}
            -DENABLE_MULTILIB:BOOL=${ENABLE_MULTILIB}
            -DPKG_CONFIG_EXECUTABLE:PATH=${PKG_CONFIG_EXECUTABLE}
        CMAKE_CACHE_ARGS
            -DCMAKE_EXPORT_COMPILE_COMMANDS:BOOL=1 // [!code ++]
            -DCMAKE_PROJECT_VERSION:STRING=${CMAKE_PROJECT_VERSION}
            -DCMAKE_BUILD_TYPE:STRING=${CMAKE_BUILD_TYPE}
            -DCMAKE_TOOLCHAIN_FILE:PATH=${CMAKE_TOOLCHAIN_FILE}
            -DCMAKE_FIND_ROOT_PATH:PATH=${CMAKE_FIND_ROOT_PATH}
...
```
:::
更改完后再编译一次就能在`buiuld`目录中得到`compile_commands.json`了。

Bear 中在[这里](https://github.com/rizsotto/Bear/blob/777954d4c2c1fc9053d885c28c9e15f903cc519a/source/intercept/source/report/libexec/lib.cc#L160)重载了 `execvpe` 系统函数。


## 参考资料
- [Compilation databases for Clang-based tools](https://eli.thegreenplace.net/2014/05/21/compilation-databases-for-clang-based-tools)
- [JSON Compliation Database Format Sepecification](https://clang.llvm.org/docs/JSONCompilationDatabase.html)

