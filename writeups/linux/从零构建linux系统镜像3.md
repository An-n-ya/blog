---
layout: doc
outline: deep
public: false
---

# 从零构建 Linux 系统镜像 -- 3. 构建 LFS
LFS 是一个教你如何一步步构建自己的 Linux 系统的项目，它提供了完整的构建步骤，以及充足的 Linux 系统相关信息，是值得初学者好好学习的优秀材料，本篇文章将带着上一篇文章的问题，跟着 LFS 教程的步骤试着写出一个能够一键运行的 Makefile 项目来构建 Linux 系统。

<!-- intro -->

## Linux 系统必要的软件环境
规定 Linux 系统必要软件环境的规范有很多，我们主要关注 Linux 基金会维护和管理的 [Linux Standard Base(LSB)](https://refspecs.linuxfoundation.org/lsb.shtml) ，这也是 LFS 主要参考的规范。LSB 建立了一组规范、库和接口，使得软件开发者可以更轻松地在不同 Linux 发行版上运行他们的应用程序。
LSB 规范很长，它不仅规定了该安装哪些库，还定义了很多接口规范，比如 libc 应该实现哪些接口，还定义了 elf 文件格式等等。不过我们可以在[这个页面](https://refspecs.linuxfoundation.org/LSB_5.0.0/LSB-Common/LSB-Common/requirements.html#RLIBRARIES)看到汇总的相关库。
LFS 很贴心的在[这个页面](https://www.linuxfromscratch.org/lfs/view/stable/prologue/package-choices.html)中介绍了每个包的用途。

## 交叉编译
Ok，现在我们知道 Linux 系统需要哪些包了，那我们要做的就是把这些包下载下来挨个编译，再把编译出来的目标文件放到最后的根文件系统就行了呗？虽然这个思路大体上是正确的，但有个重要的点没有考虑到，那就是**依赖**。
我们知道每个包都是有依赖的，即使这个包再简单，只要它是 C 语言写的（即使不是 C 语言写的也会间接依赖 C），它就得依赖 libc，而 libc 本身又依赖 gcc 和 linux-headers，而 gcc 本身又依赖 gcc 的。有人可能会觉得，这个问题很好解决，我的 host 主机上就有现成的 gcc，glibc 这些库，让这些包依赖我主机上的现成的库不就好了。这个解决方案是有问题的，因为我们要编译的是一个 Linux 系统，这个系统是 self-sustaining 的，即它只能依赖它自己，因为我们编译出来的 Linux 系统在运行时是与 Host 主机隔离的，它不能依赖任何来自于 Host 主机的库。

那问题就来了，gcc 本身是依赖 gcc 的，而且又不能依赖 Host 主机的 gcc，那我们该如何构建这个 gcc 呢？难不成左脚踩右脚地构建？没错！就是左脚踩右脚地构建，我们先构建出最基本的库，这些库可以依赖 Host 主机的库，然后再用这些最基本的库构建它们自己。

实际操作还要稍微复杂些，比如为了彻底隔绝 Host 主机，我们还需要在 Host 主机中创建一个新的用户，给这个用户创建最基础的编译工具后再 chroot 进去，用这样的方式来保证隔离型。对于有的库可能会有循环依赖，我们需要对这些库重复编译多次，每次给不同的编译参数。

上面的操作看起来有点像“交叉编译”，就是在一种 CPU 架构的机器上构建另一种 CPU 架构机器上的程序，比如在 x86 机器上构建 arm 上运行的程序，这在嵌入式开发中十分常见。其实上面的操作就是交叉编译，即使我们的 Host 机器和 Target 机器是相同的 CPU 架构。交叉编译在这里带给我们最大的好处也是我们最需要的就是**隔离性**。
