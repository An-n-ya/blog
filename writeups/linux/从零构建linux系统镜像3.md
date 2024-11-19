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


## 准备编译环境
### 硬盘
根据lfs文档的要求，我们需要有一个u盘，然后把该u盘挂载到一个新创建的用户上，然后所有的编译都发生在该用户的这个u盘文件系统中。但是我不想额外使用一个u盘，所以这里用qemu-nbd挂载一个虚拟镜像文件系统，就像这样：
```sh
qemu-img create -f qcow2 rootfs.img 30G
sudo modprobe nbd
sudo qemu-nbd -c /dev/nbd0 rootfs.img
sudo mkfs.ext4 /dev/nbd0
sudo mount -v -t ext4 /dev/nbd0 $LFS
```
这些脚本将创建一个格式为qcow2的虚拟机镜像文件（这个文件会随着它包含的内容自动增长大小，而不会实际占用所声称的大小），我们将这个镜像文件作为[网络块设备](https://docs.kernel.org/admin-guide/blockdev/nbd.html)挂载在/dev/nbd0上，然后为这个设备创建ext4文件系统，最后将该虚拟设备挂载到lfs规定的/mnt/lfs上。

由于我们执行过的所有指令都能保存在一个shell script文件中，最后能像buildroot那样一键生成linux系统镜像，为了保证脚本能够反复执行（即命令的幂等性），在执行命令前需要先判断文件是否存在：
```sh
if [[ ! -e rootfs.img ]]; then
    qemu-img create -f qcow2 rootfs.img 30G
fi
sudo modprobe nbd
if ! ps -aux | grep -q "rootfs.img"; then
    sudo qemu-nbd -c /dev/nbd0 rootfs.img
fi
if ! lsblk -f | grep nbd0 | grep -q "ext4"; then
    sudo mkfs.ext4 /dev/nbd0
fi
if ! df /dev/nbd0 | grep -q "/mnt/lfs"; then
    sudo mount -v -t ext4 /dev/nbd0 $LFS
fi
```

### 创建目录结构并下载源码
由于接下来将在当前文件系统下创建一个lfs用户，所以需要创建基本的目录结构
```sh
mkdir -pv $LFS/{etc,var} $LFS/usr/{bin,lib,sbin,lib64,tools}
for i in bin lib sbin; do
    ln -sv usr/$i $LFS/$i
done
```
lfs给出了所有源码的下载链接，我们可以用wget一键下载：
```sh
mkdir $LFS/sources
wget --input-file=wget-list --continue --directory-prefix=$LFS/sources
```

### 切换到lfs用户
接下来创建lfs用户，接下来的编译过程都将发生在这个用户上
```sh
groupadd lfs
useradd -s /bin/bash -g lfs -m -k /dev/null lfs
echo "setting passwd for new user lfs:"
passwd lfs
chown -v lfs $LFS/{usr{,/*},lib,var,etc,bin,sbin,tools,lib64}
```
接下来理论上就可以切换到lfs用户了，但是在切换到lfs用户后，当前的shell script命令就不能执行了，因为当前的script是以host身份运行的，接下来需要以lfs用户身份运行脚本。我们需要把接下来的脚本文件复制到lfs用户的文件系统下，然后在切换用户的时候指定让lfs用户执行被复制过去的脚本文件：
```sh
sudo rm -rf /tmp/script_in_lfs/
cp -r script_in_lfs /tmp/script_in_lfs
sudo chown -R lfs /tmp/script_in_lfs

sudo -i -u lfs bash <<EOF
cd /tmp/script_in_lfs
./build.sh
EOF
```
这段脚本将host用户的script_in_lfs目录复制到所有用户都可以访问的/tmp目录下，然后给予lfs该目录的所有权，然后在su切换用户的时候指示lfs用户执行script_in_lfs目录下的build.sh脚本。这个build.sh脚本就是发生在lfs用户上的编译指令的入口文件。
至此，编译环境就准备好了，接下来进入编译的第一阶段：准备编译工具链。

## Stage1: 准备编译工具链

