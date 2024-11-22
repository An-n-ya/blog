
---
layout: doc
outline: deep
public: false
---

# DWM
你是否好奇Linux上的窗口系统是如何工作的，每个窗口到底是如何创建、运行、销毁的。这篇文章将以dwm为例介绍Linux上以XOrg为GUI server的桌面系统的工作原理，之所以选择dwm，是因为它的代码库十分小巧，一共也就两三千行代码。另一方面，作为经典的平铺式窗口管理器（tiling window manager），学习它有助于理解像i3wm、awesome甚至是hyprland这样流行的窗口管理器的工作原理。
<!-- intro -->

## 窗口管理器
在X Window System中万物皆窗口，所有的窗口以树的形式组织起来，树根root就是填满整个屏幕的窗口，如下图所示：

![X Window System中的窗口](./dwm_window.png)

每个程序都会对应一个或多个窗口，这些窗口由窗口管理器组织管理，你可以调整这些窗口的大小、位置、重叠方式等等。而窗口内部的小组件同样也是X Window System里的窗口，这些窗口由Qt、GTK这样的框架管理。
如果你想知道X Window System到底是什么，以及如何使用它写一个简单的窗口管理器可以参考[这篇文章](./diy_wm.md)
这篇文章要介绍的[dwm](https://dwm.suckless.org/)就是一种窗口管理器，具体来说它属于“平铺式窗口管理器”，它让每个窗口相互邻接却不重叠，就像贴瓷砖那样，这样做能够最大化利用屏幕空间。下面来看看dwm的基本使用。

### 下载编译DWM
DWM是以源码的方式分发的，要使用它就得下载它的源码自己编译，好在编译DWM并不复杂。
```sh
# 下载源码
> git clone https://git.suckless.org/dwm
> cd dwm
# 编译并安装dwm
> make
> sudo make install
```
### 使用Xehper运行DWM
个人使用的Linux主机上一般都已经运行着Window Manager了，而X Window System只允许一个Window Manager运行，所以我们没有办法在有图形界面的Linux主机上直接运行dwm，如果直接运行，会有这样的错误：`another window manager is already running`。这时候我们可以使用[Xepher](https://freedesktop.org/wiki/Software/Xephyr/)这个软件，它允许在X中嵌套运行X，Xepher会创建一个DISPLAY，这个DISPLAY将是一个空白的X环境，我们可以在这个DISPLAY中运行GUI程序、Window Manager。就像这样：
```sh
# 创建Xepher窗口
# -br 创建空的Root Window
# -retro 创建条纹背景，“x”型鼠标
# 窗口大小为800 x 600
# DISPLAY编号为22
> Xepher -br -retro -screen 800x600 :22 &
# 在22号DISPLAY上运行DWM
> DISPALY=:22 dwm &
# 在22号DISPLAY上运行终端模拟器，这里运行的是st，你也可以运行xterm或是claritty
> DISPLAY=:22 st &
```
运行效果如图：

![dwm运行效果](./dwm_effect.png)

使用快捷键MOD+Shift+Enter可以创建新的终端模拟器，使用快捷键MOD+NUMBER会跳转到对应的工作空间，具体的使用方法可以参考[官方文档](https://dwm.suckless.org/tutorial/)。

### tiling 
dwm以平铺窗口为最重要的特性，那么这个特性是如何实现的呢？
在dwm管理每个窗口的时候，会对窗口调用manage函数，在这个函数中会调用arrange函数，arrange函数会进一步调用当前screen的display对应的函数，这个函数是在config.h中设置的，默认为tile，而dwm的平铺逻辑就实现在`tile()`函数中，它的逻辑其实并不复杂，我们一部分一部分的看。
```c
for (n = 0, c = nexttiled(m->clients); c; c = nexttiled(c->next), n++)
    ;
if (n == 0)
    return;
```
m是当前monitor，这几行代码遍历了当前monitor的所有窗口，统计窗口个数保存在n变量中，其中`nexttiled`函数过滤了所有的floating窗口。如果所有非floating的窗口个数为0，就不用执行tiling逻辑。

```c
for (i = my = ty = 0, c = nexttiled(m->clients); c; c = nexttiled(c->next), i++) {
    if (i < m->nmaster) {
        h = (m->wh - my) / (MIN(n, m->nmaster) - i);
        resize(c, m->wx, m->wy + my, mw - (2 * c->bw), h - (2 * c->bw), 0);
        if (my + HEIGHT(c) < m->wh)
            my += HEIGHT(c);
    } else {
        h = (m->wh - ty) / (n - i);
        resize(c, m->wx + mw, m->wy + ty, m->ww - mw - (2 * c->bw), h - (2 * c->bw), 0);
        if (ty + HEIGHT(c) < m->wh)
            ty += HEIGHT(c);
    }
}
```
这段代码大体上也是在遍历所有的非floating窗口，这些窗口又可以分为两类，一类为“主窗口”，它们位于屏幕左侧，通常来说只有一个主窗口，一类为“从窗口”，它们位于屏幕右侧。并且主窗口总位于窗口链表的前面，即主窗口在链表中的位置总位于从窗口前面。
```c
h = (m->wh - my) / (MIN(n, m->nmaster) - i);
resize(c, m->wx, m->wy + my, mw - (2 * c->bw), h - (2 * c->bw), 0);
```
这两行代码只是从上到下排列窗口，`- (w * c->bw)`的意思是减去边框宽度。
